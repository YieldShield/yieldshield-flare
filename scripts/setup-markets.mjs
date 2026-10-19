import { existsSync, readFileSync } from "node:fs";
import { decodeEventLog, keccak256, zeroAddress } from "viem";
export const artifact = (source, name = source) => ({
  ...JSON.parse(readFileSync(`contracts/out/${source}.sol/${name}.json`)),
  id: `${source}.sol:${name}`,
});
/** Artifacts the plan deploys; the factory itself creates pools and backing oracles. */
export const planArtifacts = (local = false) => ({
  token: artifact("DemoAssets", "AlpineDemoDollar"),
  scenario: artifact("DemoAssets", "AlpineScenarioOracle"),
  reference: local
    ? artifact("AlpinePool.t", "MutableOracle")
    : artifact("DemoAssets", "AlpineChainlinkOracle"),
  wrapper: artifact("AlpineMarket", "AlpineWrappedAVAX"),
  vault: artifact("AlpineMarket", "AlpineDemoVault"),
  backingVault: artifact("AlpineMarket", "AlpineBackingVault"),
  vaultOracle: artifact("AlpineMarket", "AlpineVaultOracle"),
  factory: artifact("AlpineMarket", "AlpineFactory"),
  exchange: artifact("AlpineMarket", "AlpineExchange"),
  pool: artifact("AlpinePool"),
  backingOracle: artifact("AlpineMarket", "AlpineBackingOracle"),
});
/** Bytecode hashes, plus source files that differ from what the artifacts were compiled from. */
export function artifactProvenance(artifacts) {
  const hashes = {},
    stale = new Set();
  for (const a of Object.values(artifacts)) {
    hashes[a.id] = {
      bytecode: keccak256(a.bytecode.object),
      deployedBytecode: keccak256(a.deployedBytecode.object),
    };
    for (const [path, source] of Object.entries(a.metadata?.sources ?? {})) {
      const file = `contracts/${path}`;
      if (!existsSync(file) || keccak256(readFileSync(file)) !== source.keccak256)
        stale.add(file);
    }
  }
  return { hashes, stale: [...stale].sort() };
}
/**
 * Featured market terms. Epochs are fixed and never renewed, so featured markets use the
 * 30-day contract maximum (AlpinePool EPOCH_LIMIT) to stay open as long as possible.
 */
export const terms = {
  collateralBps: 15000,
  juniorFeeBps: 1000,
  creatorFeeBps: 100,
  epochSeconds: 2592000,
  exitDelay: 60,
  juniorNotice: 120,
};
/** Backing units the factory takes from the creator as each market's seed (AlpineFactory CREATION_SEED). */
export const creationSeed = 500_000000n;
/** Featured markets: manifest field, protected asset (zero address = native AVAX), oracle, backing. */
export const featuredMarkets = (m) => [
  ["referencePool", zeroAddress, m.referenceOracle, m.backingToken],
  ["scenarioPool", zeroAddress, m.scenarioOracle, m.backingToken],
  ["wrappedPool", m.wrapper, m.referenceOracle, m.backingToken],
  ["vaultPool", m.vault, m.vaultOracle, m.backingToken],
  ["vaultBackingPool", zeroAddress, m.referenceOracle, m.backingVault],
];
/** aDEMO the deployer deposits into each vault before creating markets. */
export const vaultSeed = 1000_000000n;
/** Finite funded exchange inventory sent by the deployer. */
export const exchangeInventory = {
  cash: 1000_000000n,
  wrapper: 10n ** 16n,
  vault: 100n * 10n ** 18n,
  native: 10n ** 16n,
};
/** Shared deployment plan; executor owns signing, receipts and durable progress. */
export async function setupMarkets({
  manifest: m,
  account,
  deploy,
  call,
  save,
  local = false,
}) {
  // Executors append to m.transactions only for newly mined steps.
  const recordedBefore = m.transactions.length;
  const a = planArtifacts(local);
  await deploy("backingToken", a.token);
  await deploy("scenarioOracle", a.scenario);
  await deploy(
    "referenceOracle",
    a.reference,
    local ? [] : [m.chainlinkFeed, BigInt(m.maxPriceAge)],
  );
  await deploy("wrapper", a.wrapper);
  await deploy("vault", a.vault, [m.backingToken]);
  await deploy("backingVault", a.backingVault, [m.backingToken]);
  await deploy("vaultOracle", a.vaultOracle, [m.vault]);
  await deploy("factory", a.factory, [
    m.backingToken,
    account,
    m.wrapper,
    m.vault,
    m.referenceOracle,
    m.scenarioOracle,
    m.vaultOracle,
    m.backingVault,
  ]);
  await deploy("exchange", a.exchange, [m.backingToken, m.factory]);
  const run = async (label, address, abi, functionName, args = [], value) =>
    call(label, { address, abi, functionName, args, value });
  await run("seed-faucet", m.backingToken, a.token.abi, "faucet");
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 86400);
  // ERC-4626 mints assets * (supply + 10^offset) / (held assets + 1) shares, exactly
  // assets * 10^offset unless aDEMO was donated to the vault first. Requiring that amount
  // stops a donation front-run from minting the seed as dust: with bvaDEMO's offset 0,
  // deposit(1) + donate(1000e6) would leave the deployer 1 share and no market seed.
  for (const [label, address, offset] of [
    ["vault", m.vault, 12n],
    ["backing-vault", m.backingVault, 0n],
  ]) {
    await run(`${label}-approve`, m.backingToken, a.token.abi, "approve", [
      address,
      vaultSeed,
    ]);
    await run(
      `${label}-funded-deposit`,
      address,
      a.vault.abi,
      "depositBounded",
      [vaultSeed, account, vaultSeed * 10n ** offset, deadline()],
    );
  }
  await run(
    "wrapper-funded-deposit",
    m.wrapper,
    a.wrapper.abi,
    "deposit",
    [],
    exchangeInventory.wrapper,
  );
  await run("factory-cash-approve", m.backingToken, a.token.abi, "approve", [
    m.factory,
    2000_000000n,
  ]);
  await run("factory-vault-approve", m.backingVault, a.vault.abi, "approve", [
    m.factory,
    500_000000n,
  ]);
  const pairs = featuredMarkets(m);
  if (pairs.some(([field]) => !m[field])) {
    // The manifest describes the featured markets that exist, not the current plan.
    if (
      pairs.some(([field]) => m[field]) &&
      JSON.stringify(m.defaultTerms) !== JSON.stringify(terms)
    )
      throw new Error(
        "Some featured markets were created with different terms; start a new deployment instead of mixing terms.",
      );
    m.defaultTerms = terms;
    await save();
  }
  for (const [field, asset, oracle, backing] of pairs) {
    if (m[field]) continue;
    const receipt = await run(
      `${field}-factory-create`,
      m.factory,
      a.factory.abi,
      "createPoolWithBacking",
      [
        asset,
        oracle,
        backing,
        terms,
        deadline(),
      ],
    );
    m[field] = createdPool(receipt, a.factory.abi);
    if (!m[field]) throw new Error(`Missing factory event for ${field}`);
    await save();
  }
  await run(
    "exchange-cash-inventory",
    m.backingToken,
    a.token.abi,
    "transfer",
    [m.exchange, exchangeInventory.cash],
  );
  await run(
    "exchange-wrapper-inventory",
    m.wrapper,
    a.wrapper.abi,
    "transfer",
    [m.exchange, exchangeInventory.wrapper],
  );
  await run("exchange-vault-inventory", m.vault, a.vault.abi, "transfer", [
    m.exchange,
    exchangeInventory.vault,
  ]);
  await call("exchange-native-inventory", {
    to: m.exchange,
    value: exchangeInventory.native,
  });
  // No holder positions are seeded: all featured pools allow new provider entry initially.
  m.version = 2;
  // A rerun that mined nothing new keeps the existing (possibly verified) status.
  const deployed = local
    ? "local-only-verified"
    : "deployed-awaiting-verification";
  if (
    m.transactions.length > recordedBefore ||
    ![deployed, "deployed-and-verified"].includes(m.status)
  )
    m.status = deployed;
  await save();
  return a;
}
/** The pool address from a factory creation receipt's PoolCreated event. */
export function createdPool(receipt, factoryAbi) {
  for (const log of receipt.logs) {
    try {
      const event = decodeEventLog({
        abi: factoryAbi,
        data: log.data,
        topics: log.topics,
      });
      if (event.eventName === "PoolCreated") return event.args.pool;
    } catch {}
  }
  return null;
}
/** Label prefix for a replacement round's steps, so every round signs its own intents. */
export const roundPrefix = (round) => `r${round}-`;
/** The open replacement round, if a previous run stopped before switching the manifest. */
export const openRound = (m) => (m.replacements ?? []).find((r) => !r.completedAt);
/**
 * Replaces the five featured markets with new ones on the recorded terms. Epochs are fixed and
 * cannot be extended, so matured featured markets are superseded rather than renewed. The
 * manifest keeps naming the current markets until all five replacements exist, then records the
 * superseded ones in `replacements[n].retired`. Top-ups are decided once when the round opens,
 * so a resumed round replays the same steps.
 */
export async function replaceFeaturedMarkets({
  manifest: m,
  account,
  call,
  read,
  save,
}) {
  if (JSON.stringify(m.defaultTerms) !== JSON.stringify(terms))
    throw new Error(
      "The featured terms in this checkout differ from the deployed ones; replacements must use the recorded terms.",
    );
  const a = planArtifacts();
  const markets = featuredMarkets(m);
  const seedsFor = (backing) =>
    creationSeed *
    BigInt(markets.filter((market) => market[3] === backing).length);
  const cashSeeds = seedsFor(m.backingToken);
  const vaultSeeds = seedsFor(m.backingVault);
  m.replacements ??= [];
  let round = openRound(m);
  if (!round) {
    const [cash, shares] = await Promise.all([
      read(m.backingToken, a.token.abi, "balanceOf", [account]),
      read(m.backingVault, a.backingVault.abi, "balanceOf", [account]),
    ]);
    const shortShares = shares < vaultSeeds ? vaultSeeds - shares : 0n;
    const depositAssets = shortShares
      ? await read(m.backingVault, a.backingVault.abi, "previewMint", [
          shortShares,
        ])
      : 0n;
    const cashNeeded = cashSeeds + depositAssets;
    // The faucet mints 10,000 aDEMO per address per hour.
    if (cash + 10000_000000n < cashNeeded)
      throw new Error(
        `The deployer holds ${cash} aDEMO base units; one faucet claim cannot cover the ${cashNeeded} this round needs.`,
      );
    round = {
      round: m.replacements.length + 1,
      openedAt: new Date().toISOString(),
      topUps: {
        faucet: cash < cashNeeded,
        backingVaultAssets: String(depositAssets),
        backingVaultShares: String(shortShares),
      },
      created: {},
    };
    m.replacements.push(round);
    await save();
  }
  const prefix = roundPrefix(round.round);
  const run = async (label, address, abi, functionName, args = []) =>
    call(prefix + label, { address, abi, functionName, args });
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 86400);
  if (round.topUps.faucet)
    await run("faucet", m.backingToken, a.token.abi, "faucet");
  const depositAssets = BigInt(round.topUps.backingVaultAssets);
  if (depositAssets) {
    await run("backing-vault-approve", m.backingToken, a.token.abi, "approve", [
      m.backingVault,
      depositAssets,
    ]);
    await run(
      "backing-vault-deposit",
      m.backingVault,
      a.backingVault.abi,
      "depositBounded",
      [
        depositAssets,
        account,
        BigInt(round.topUps.backingVaultShares),
        deadline(),
      ],
    );
  }
  await run("factory-cash-approve", m.backingToken, a.token.abi, "approve", [
    m.factory,
    cashSeeds,
  ]);
  await run(
    "factory-vault-approve",
    m.backingVault,
    a.backingVault.abi,
    "approve",
    [m.factory, vaultSeeds],
  );
  for (const [field, asset, oracle, backing] of markets) {
    if (round.created[field]) continue;
    const receipt = await run(
      `${field}-factory-create`,
      m.factory,
      a.factory.abi,
      "createPoolWithBacking",
      [asset, oracle, backing, terms, deadline()],
    );
    round.created[field] = createdPool(receipt, a.factory.abi);
    if (!round.created[field])
      throw new Error(`Missing factory event for ${field}`);
    await save();
  }
  round.retired = Object.fromEntries(markets.map(([field]) => [field, m[field]]));
  for (const [field] of markets) m[field] = round.created[field];
  round.completedAt = new Date().toISOString();
  m.status = "deployed-awaiting-verification";
  await save();
  return round;
}
