import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  decodeEventLog,
  http,
  keccak256,
  zeroAddress,
} from "viem";
import { avalancheFuji } from "viem/chains";
import {
  artifactProvenance,
  exchangeInventory,
  planArtifacts,
  terms,
  vaultSeed,
} from "./setup-markets.mjs";
const m = JSON.parse(readFileSync("config/deployment.json"));
if (m.chainId !== 43113 || m.version !== 2)
  throw new Error("Expected Fuji v2 manifest");
const c = createPublicClient({
  chain: avalancheFuji,
  transport: http(m.rpcUrl),
});
if ((await c.getChainId()) !== 43113) throw new Error("Wrong chain");
const read = (address, abi, functionName, args = []) =>
  c.readContract({ address, abi, functionName, args });
const same = (x, y) => x.toLowerCase() === y.toLowerCase();
const artifacts = planArtifacts();
if (!m.source) console.log("Note: the manifest records no source commit.");
else {
  const { hashes } = artifactProvenance(artifacts);
  const changed = Object.keys(hashes).filter(
    (id) =>
      hashes[id].deployedBytecode !==
      m.source.artifacts?.[id]?.deployedBytecode,
  );
  if (changed.length)
    console.log(
      `Note: contracts/out differs from the build recorded at ${m.source.commit} for ${changed.join(", ")}; runtime code is compared with contracts/out.`,
    );
}
const pool = artifacts.pool.abi,
  factory = artifacts.factory.abi,
  vault = artifacts.vault.abi;
/** Runtime code with every immutable slot zeroed, as listed in the artifact. */
function masked(code, a) {
  let out = code.toLowerCase();
  for (const ranges of Object.values(
    a.deployedBytecode.immutableReferences ?? {},
  ))
    for (const { start, length } of ranges)
      out =
        out.slice(0, 2 + start * 2) +
        "0".repeat(length * 2) +
        out.slice(2 + (start + length) * 2);
  return out;
}
async function checkRuntime(label, address, a) {
  const code = await c.getCode({ address });
  if (masked(code, a) === masked(a.deployedBytecode.object, a)) return;
  const recorded = m.source?.artifacts?.[a.id]?.deployedBytecode;
  throw new Error(
    `${label} runtime code does not match ${a.id}.` +
      (recorded && recorded !== keccak256(a.deployedBytecode.object)
        ? ` contracts/out differs from the build recorded at deployment; check out ${m.source.commit} and rebuild.`
        : ""),
  );
}
/** Successful receipt of a recorded deployment step: evidence that does not change with later use. */
async function recordedReceipt(label) {
  const tx = m.transactions.find((t) => t.label === label);
  if (!tx) throw new Error(`No recorded ${label} transaction`);
  const receipt = await c.getTransactionReceipt({ hash: tx.hash });
  if (receipt.status !== "success") throw new Error(`${label} did not succeed`);
  return receipt;
}
const eventsFrom = (receipt, address, abi, eventName) =>
  receipt.logs
    .filter((log) => same(log.address, address))
    .flatMap((log) => {
      try {
        return [decodeEventLog({ abi, data: log.data, topics: log.topics })];
      } catch {
        return [];
      }
    })
    .filter((event) => event.eventName === eventName);
for (const field of [
  "backingToken",
  "referenceOracle",
  "scenarioOracle",
  "wrapper",
  "vault",
  "backingVault",
  "vaultOracle",
  "factory",
  "exchange",
  "referencePool",
  "scenarioPool",
  "wrappedPool",
  "vaultPool",
  "vaultBackingPool",
]) {
  const code = m[field] ? await c.getCode({ address: m[field] }) : null;
  if (!code || code === "0x") throw new Error(`Missing contract ${field}`);
}
for (const [field, key] of [
  ["backingToken", "token"],
  ["scenarioOracle", "scenario"],
  ["referenceOracle", "reference"],
  ["wrapper", "wrapper"],
  ["vault", "vault"],
  ["backingVault", "backingVault"],
  ["vaultOracle", "vaultOracle"],
  ["factory", "factory"],
  ["exchange", "exchange"],
  ["referencePool", "pool"],
  ["scenarioPool", "pool"],
  ["wrappedPool", "pool"],
  ["vaultPool", "pool"],
  ["vaultBackingPool", "pool"],
])
  await checkRuntime(field, m[field], artifacts[key]);
for (const field of ["referenceOracle", "scenarioOracle", "vaultOracle"])
  await checkRuntime(
    `backing oracle for ${field}`,
    await read(m.factory, factory, "backingOracles", [m[field]]),
    artifacts.backingOracle,
  );
if (!same(await read(m.factory, factory, "protocol"), m.deployer))
  throw new Error("Factory protocol fee recipient is not the deployer");
const reference = artifacts.reference.abi;
if (!same(await read(m.referenceOracle, reference, "feed"), m.chainlinkFeed))
  throw new Error("Reference oracle does not read the manifest Chainlink feed");
if ((await read(m.referenceOracle, reference, "maxAge")) !== BigInt(m.maxPriceAge))
  throw new Error("Reference oracle maximum price age differs from the manifest");
await read(m.referenceOracle, reference, "price").catch((error) =>
  console.log(
    `Warning: the reference price is unavailable right now (${error.shortMessage ?? error.message}).`,
  ),
);
for (const [field, name] of [
  ["backingToken", "backing"],
  ["wrapper", "wrapper"],
  ["vault", "vault"],
  ["backingVault", "backingVault"],
  ["referenceOracle", "referenceOracle"],
  ["scenarioOracle", "scenarioOracle"],
  ["vaultOracle", "vaultOracle"],
])
  if (
    (await read(m.factory, factory, name)).toLowerCase() !==
    m[field].toLowerCase()
  )
    throw new Error(`Factory mismatch: ${field}`);
// Featured markets carry the terms recorded when they were created.
const termKeys = Object.keys(terms);
if (!m.defaultTerms || termKeys.some((k) => m.defaultTerms[k] === undefined))
  throw new Error("Manifest does not record the featured market terms");
if (termKeys.some((k) => m.defaultTerms[k] !== terms[k]))
  console.log(
    "Note: the current plan's featured terms differ from the deployed ones; only a new deployment would apply them.",
  );
const seed = await read(m.factory, factory, "CREATION_SEED");
const now = (await c.getBlock()).timestamp;
const day = 86400n;
const date = (seconds) => new Date(Number(seconds) * 1000).toISOString();
for (const [field, asset, backing] of [
  ["referencePool", zeroAddress, m.backingToken],
  ["scenarioPool", zeroAddress, m.backingToken],
  ["wrappedPool", m.wrapper, m.backingToken],
  ["vaultPool", m.vault, m.backingToken],
  ["vaultBackingPool", zeroAddress, m.backingVault],
]) {
  const address = m[field];
  if (!(await read(m.factory, factory, "isPool", [address])))
    throw new Error(`${field} is not registered`);
  if (
    (await read(address, pool, "backing")).toLowerCase() !==
      backing.toLowerCase() ||
    (await read(address, pool, "protectedToken")).toLowerCase() !==
      asset.toLowerCase()
  )
    throw new Error(`${field} identity mismatch`);
  const expectedOracle =
    field === "scenarioPool"
      ? m.scenarioOracle
      : field === "vaultPool"
        ? m.vaultOracle
        : field === "vaultBackingPool"
          ? await read(m.factory, factory, "backingOracles", [
              m.referenceOracle,
            ])
          : m.referenceOracle;
  if (
    (await read(address, pool, "oracle")).toLowerCase() !==
    expectedOracle.toLowerCase()
  )
    throw new Error(`${field} oracle mismatch`);
  for (const name of ["creator", "protocol"])
    if (
      (await read(address, pool, name)).toLowerCase() !==
      m.deployer.toLowerCase()
    )
      throw new Error(`${field} ${name} mismatch`);
  const actual = await read(address, pool, "terms");
  if (actual.some((n, i) => Number(n) !== m.defaultTerms[termKeys[i]]))
    throw new Error(`${field} terms mismatch`);
  // New protection requires chain time + exitDelay < maturity.
  const maturity = await read(address, pool, "maturity");
  if (now + BigInt(m.defaultTerms.exitDelay) >= maturity)
    throw new Error(
      `${field} matured at ${date(maturity)} (chain time ${date(now)}) and no longer accepts protection. Do not present it as a live featured market; deploy replacement featured markets.`,
    );
  console.log(
    `${field} accepts protection until ${date(maturity)} (${(Number(maturity - now) / 86400).toFixed(1)} days left).`,
  );
  if (maturity - now < 3n * day)
    console.log(`Warning: ${field} closes within three days.`);
  // The seed is checked in the creation receipt, so later public use cannot fail verification.
  // A replacement round labels its creations `r<n>-…`; the original deployment has no prefix.
  const replaced = (m.replacements ?? []).findLast(
    (r) => r.completedAt && same(r.created?.[field], address),
  );
  const receipt = await recordedReceipt(
    `${replaced ? `r${replaced.round}-` : ""}${field}-factory-create`,
  );
  const created = eventsFrom(receipt, m.factory, factory, "PoolCreated");
  if (
    created.length !== 1 ||
    !same(created[0].args.pool, address) ||
    !same(created[0].args.creator, m.deployer) ||
    !same(created[0].args.asset, asset) ||
    !same(created[0].args.oracle, expectedOracle) ||
    created[0].args.seed !== seed
  )
    throw new Error(`${field} creation receipt lacks the expected PoolCreated`);
  const seeded = eventsFrom(receipt, address, pool, "JuniorDeposited");
  if (
    seeded.length !== 1 ||
    !same(seeded[0].args.owner, m.deployer) ||
    seeded[0].args.backingAmount !== seed ||
    seeded[0].args.sharesMinted !== seed * 10n ** 12n
  )
    throw new Error(`${field} creation receipt does not seed the deployer`);
  if (eventsFrom(receipt, address, pool, "Protected").length)
    throw new Error(`${field} expected no seeded holder exposure`);
}
for (const field of ["vault", "backingVault"])
  if (
    (await read(m[field], vault, "asset")).toLowerCase() !==
    m.backingToken.toLowerCase()
  )
    throw new Error("Wrong vault underlying");
// Seed deposits must have minted exactly 10^(vault decimals - 6) shares per aDEMO.
for (const [field, label] of [
  ["vault", "vault-funded-deposit"],
  ["backingVault", "backing-vault-funded-deposit"],
]) {
  const offset = BigInt(await read(m[field], vault, "decimals")) - 6n;
  const deposits = eventsFrom(
    await recordedReceipt(label),
    m[field],
    vault,
    "Deposit",
  );
  if (
    deposits.length !== 1 ||
    !same(deposits[0].args.owner, m.deployer) ||
    deposits[0].args.assets !== vaultSeed ||
    deposits[0].args.shares !== vaultSeed * 10n ** offset
  )
    throw new Error(`${field} seed deposit did not mint exact 1:1 shares`);
}
const tokenAbi = artifacts.token.abi,
  exchangeAbi = artifacts.exchange.abi;
for (const [field, decimals, symbol] of [
  ["backingToken", 6, "aDEMO"],
  ["wrapper", 18, "awAVAX"],
  ["vault", 18, "vaDEMO"],
  ["backingVault", 6, "bvaDEMO"],
]) {
  if (
    Number(await read(m[field], tokenAbi, "decimals")) !== decimals ||
    (await read(m[field], tokenAbi, "symbol")) !== symbol
  )
    throw new Error(`${field} metadata mismatch`);
}
if (
  (await read(m.exchange, exchangeAbi, "registry")).toLowerCase() !==
  m.factory.toLowerCase()
)
  throw new Error("Exchange registry mismatch");
if (!same(await read(m.exchange, exchangeAbi, "backing"), m.backingToken))
  throw new Error("Exchange settlement token mismatch");
// Funding is proven by the recorded transfers; live inventory moves with public trading.
for (const [label, token, amount] of [
  ["exchange-cash-inventory", m.backingToken, exchangeInventory.cash],
  ["exchange-wrapper-inventory", m.wrapper, exchangeInventory.wrapper],
  ["exchange-vault-inventory", m.vault, exchangeInventory.vault],
]) {
  const transfers = eventsFrom(
    await recordedReceipt(label),
    token,
    tokenAbi,
    "Transfer",
  );
  if (
    transfers.length !== 1 ||
    !same(transfers[0].args.from, m.deployer) ||
    !same(transfers[0].args.to, m.exchange) ||
    transfers[0].args.value !== amount
  )
    throw new Error(`Missing funded exchange inventory: ${label}`);
}
const nativeFunding = (await recordedReceipt("exchange-native-inventory"))
  .transactionHash;
const nativeTx = await c.getTransaction({ hash: nativeFunding });
if (!same(nativeTx.to, m.exchange) || nativeTx.value !== exchangeInventory.native)
  throw new Error("Missing funded exchange inventory: exchange-native-inventory");
const live = {
  AVAX: await read(m.exchange, exchangeAbi, "inventory", [zeroAddress]),
  awAVAX: await read(m.exchange, exchangeAbi, "inventory", [m.wrapper]),
  vaDEMO: await read(m.exchange, exchangeAbi, "inventory", [m.vault]),
  aDEMO: await read(m.backingToken, tokenAbi, "balanceOf", [m.exchange]),
};
console.log(
  `Live exchange inventory (base units): ${Object.entries(live)
    .map(([symbol, amount]) => `${symbol} ${amount}`)
    .join(", ")}`,
);
for (const [symbol, amount] of Object.entries(live))
  if (amount === 0n)
    console.log(`Warning: ${symbol} exchange inventory is exhausted.`);
for (const tx of m.transactions)
  if ((await c.getTransactionReceipt({ hash: tx.hash })).status !== "success")
    throw new Error(`Unconfirmed transaction ${tx.label}`);
if (m.failedTransactions?.length)
  console.log(
    `Note: ${m.failedTransactions.length} reverted step(s) are recorded under failedTransactions; reverts have no state effect.`,
  );
m.status = "deployed-and-verified";
m.verifiedAt = new Date().toISOString();
writeFileSync("config/deployment.json", JSON.stringify(m, null, 2) + "\n");
console.log(
  `Verified Fuji runtime code (immutables masked) against contracts/out, factory and oracle wiring, exact asset identities, terms, open epochs, vault and creation seeds, exchange funding and all deployment receipts${m.source?.commit ? ` for source ${m.source.commit}` : ""}.`,
);
