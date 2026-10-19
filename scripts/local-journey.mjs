/**
 * Scripted lifecycle on a disposable local Anvil (chain 31337, port 8557):
 *
 *   anvil --host 127.0.0.1 --port 8557 --silent
 *   node scripts/local-journey.mjs [--browser-ready]
 *
 * It deploys Flare stand-ins (registry, FtsoV2 and WNat from contracts/test/mocks), runs the real
 * deployment plan against them, including the real ShieldFtsoV2Oracle, then drives holder,
 * provider, creator and maturity flows. Evidence is source-hash bound in
 * docs/evidence/local-journey.json. Nothing is sent to Coston2.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseEther,
  toHex,
  zeroAddress,
} from "viem";
import { foundry } from "viem/chains";
import {
  LOCAL_RPC,
  featuredMarkets,
  localFeed,
  mockArtifacts,
  setupMarkets,
  wnatAbi,
} from "./setup-markets.mjs";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const rpc = LOCAL_RPC,
  c = createPublicClient({ chain: foundry, transport: http(rpc) });
if ((await c.getChainId()) !== 31337) throw new Error("Local-only chain guard");
await c.request({ method: "anvil_reset", params: [] });
const accounts = await c.request({ method: "eth_accounts", params: [] }),
  account = accounts[0],
  holder = accounts[1];
const w = createWalletClient({ account, chain: foundry, transport: http(rpc) }),
  h = createWalletClient({
    account: holder,
    chain: foundry,
    transport: http(rpc),
  });
const base = JSON.parse(readFileSync("config/deployment.json"));
const manifest = {
  ...base,
  network: "Local Anvil test chain",
  chainId: 31337,
  rpcUrl: rpc,
  explorer: rpc,
  deployer: account,
  transactions: [],
  status: "local-only",
};
const contractFields = [
  "backingToken",
  "referenceOracle",
  "scenarioOracle",
  "vault",
  "backingVault",
  "vaultOracle",
  "factory",
  "exchange",
  ...featuredMarkets(base).map(([field]) => field),
];
const reset = () => {
  for (const field of [...contractFields, "flareContractRegistry", "wrapper", "mockFtsoV2"])
    manifest[field] = null;
  manifest.transactions = [];
  delete manifest.defaultTerms;
};
reset();
mkdirSync(".local", { recursive: true });
const save = () =>
  writeFileSync(".local/deployment.json", JSON.stringify(manifest, null, 2) + "\n");
const expectedReverts = [];
async function receipt(label, hash) {
  const r = await c.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${label} reverted`);
  manifest.transactions.push({
    label,
    hash,
    blockNumber: String(r.blockNumber),
    status: r.status,
    contractAddress: r.contractAddress,
  });
  save();
  return r;
}
async function deploy(field, a, args = []) {
  const r = await receipt(
    field,
    await w.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args }),
  );
  manifest[field] = r.contractAddress;
  save();
}
async function call(label, request, signer = w) {
  const hash = request.to
    ? await signer.sendTransaction(request)
    : await signer.writeContract({ ...request, chain: foundry });
  return receipt(label, hash);
}
const run = (label, address, abi, functionName, args = [], value, signer = w) =>
  call(label, { address, abi, functionName, args, value }, signer);
const mocks = mockArtifacts();
/** Flare stand-ins first: the reference adapter checks its feed when it is deployed. */
async function prepare() {
  await deploy("flareContractRegistry", mocks.registry);
  await deploy("mockFtsoV2", mocks.ftso);
  await deploy("wrapper", mocks.wnat);
  await run("registry-ftsov2", manifest.flareContractRegistry, mocks.registry.abi, "setContractAddress", [
    "FtsoV2",
    manifest.mockFtsoV2,
  ]);
  await run("registry-wnat", manifest.flareContractRegistry, mocks.registry.abi, "setContractAddress", [
    "WNat",
    manifest.wrapper,
  ]);
  await run("ftso-flr-usd", manifest.mockFtsoV2, mocks.ftso.abi, "setFeed", [
    manifest.ftsoFeed.id,
    localFeed.value,
    localFeed.decimals,
  ]);
  return setupMarkets({ manifest, account, deploy, call, save, local: true });
}
const a = await prepare();
const read = (address, abi, functionName, args = []) =>
  c.readContract({ address, abi, functionName, args });
const step = async (seconds) => {
  await c.request({ method: "evm_increaseTime", params: [seconds] });
  await c.request({ method: "evm_mine", params: [] });
};
/** A step that must revert with `reason`; recorded as evidence, never sent. */
async function expectRevert(label, address, abi, functionName, args, reason, from, value) {
  const error = await c
    .simulateContract({ address, abi, functionName, args, account: from, value })
    .then(() => null)
    .catch((e) => e.shortMessage ?? e.message);
  if (!error?.includes(reason)) throw new Error(`${label}: expected ${reason}, got ${error}`);
  expectedReverts.push({ label, reason });
}
const setFeed = (label, value) =>
  run(label, manifest.mockFtsoV2, mocks.ftso.abi, "setFeed", [manifest.ftsoFeed.id, value, localFeed.decimals]);
await run("holder-faucet", manifest.backingToken, a.token.abi, "faucet", [], undefined, h);
await run(
  "holder-exchange-approve",
  manifest.backingToken,
  a.token.abi,
  "approve",
  [manifest.exchange, 1000_000000n],
  undefined,
  h,
);
let dead = BigInt((await c.getBlock()).timestamp) + 600n;
// 5 WC2FLR from the exchange's 10 WC2FLR inventory: a 0.032 sDEMO entry claim at FLR/USD 0.0064.
const buyAmount = parseEther("5"),
  [cost] = await read(manifest.exchange, a.exchange.abi, "quote", [manifest.wrapper, buyAmount, true]);
await run(
  "holder-buy-wrapper",
  manifest.exchange,
  a.exchange.abi,
  "buy",
  [manifest.wrapper, buyAmount, cost, dead],
  undefined,
  h,
);
await run("holder-protection-approve", manifest.wrapper, wnatAbi, "approve", [manifest.wrappedPool, buyAmount], undefined, h);
await run(
  "holder-protect-bought-wrapper",
  manifest.wrappedPool,
  a.pool.abi,
  "protectToken",
  [buyAmount, 1n, dead],
  undefined,
  h,
);
await step(61);
// The FTSOv2 stand-in doubles FLR/USD; the real adapter normalizes it to 12798 micro-units.
await setFeed("local-ftso-flr-usd-doubles", localFeed.value * 2n);
await run(
  "holder-partial-asset-exit",
  manifest.wrappedPool,
  a.pool.abi,
  "partialExitAsset",
  [1n, buyAmount / 2n, 1n, dead],
  undefined,
  h,
);
const reward = await read(manifest.wrappedPool, a.pool.abi, "earned", [account]);
if (reward <= 0n) throw new Error("Expected earned provider fee");
await run("provider-claim-earned-fees", manifest.wrappedPool, a.pool.abi, "claimRewards", [account]);
await run("holder-transfer-remainder", manifest.wrappedPool, a.pool.abi, "transferPosition", [1n, account], undefined, h);
await run("new-owner-backing-exit", manifest.wrappedPool, a.pool.abi, "partialExitBacking", [
  1n,
  buyAmount / 2n,
  1n,
  dead,
]);
await run("provider-notice", manifest.wrappedPool, a.pool.abi, "requestJuniorWithdrawal");
await step(121);
dead = BigInt((await c.getBlock()).timestamp) + 600n;
await run("provider-partial-redemption", manifest.wrappedPool, a.pool.abi, "withdrawJuniorBounded", [
  100n * 10n ** 18n,
  1n,
  0n,
  dead,
]);
await run("creator-protocol-pull-fees", manifest.wrappedPool, a.pool.abi, "claimFees", [account]);
await run("holder-wrapper-sale-approval", manifest.wrapper, wnatAbi, "approve", [manifest.exchange, parseEther("1")], undefined, h);
await run(
  "holder-sell-wrapper",
  manifest.exchange,
  a.exchange.abi,
  "sellToken",
  [manifest.wrapper, parseEther("1"), 1n, dead],
  undefined,
  h,
);
await run("vault-bounded-redeem", manifest.vault, a.vault.abi, "redeemBounded", [10n ** 18n, account, account, 1n, dead]);
await run("holder-vault-backing-protect", manifest.vaultBackingPool, a.pool.abi, "protect", [1n, dead], parseEther("5"), h);
await step(61);
dead = BigInt((await c.getBlock()).timestamp) + 600n;
await run("holder-vault-receipt-claim", manifest.vaultBackingPool, a.pool.abi, "exitBacking", [1n], undefined, h);
await run(
  "holder-backing-vault-redeem",
  manifest.backingVault,
  a.backingVault.abi,
  "redeemBounded",
  [50000n, holder, holder, 1n, dead],
  undefined,
  h,
);
// A stale FTSOv2 reading blocks priced actions but never the fixed backing claim.
await run("holder-reference-protect", manifest.referencePool, a.pool.abi, "protect", [1n, dead], parseEther("5"), h);
await step(61);
dead = BigInt((await c.getBlock()).timestamp) + 600n;
const staleAt = BigInt((await c.getBlock()).timestamp) - BigInt(manifest.maxPriceAge) - 1n;
await run("local-ftso-feed-goes-stale", manifest.mockFtsoV2, mocks.ftso.abi, "setFeedTimestamp", [
  manifest.ftsoFeed.id,
  staleAt,
]);
await expectRevert("stale-feed-blocks-protection", manifest.referencePool, a.pool.abi, "protect", [1n, dead], "STALE_PRICE", holder, parseEther("5"));
await expectRevert("stale-feed-blocks-asset-exit", manifest.referencePool, a.pool.abi, "exitAsset", [1n, 0n], "STALE_PRICE", holder);
await expectRevert("stale-feed-blocks-exchange-quote", manifest.exchange, a.exchange.abi, "buy", [zeroAddress, parseEther("1"), 10n ** 12n, dead], "STALE_PRICE", holder);
await run("holder-backing-exit-on-stale-feed", manifest.referencePool, a.pool.abi, "exitBacking", [1n], undefined, h);
await setFeed("local-ftso-feed-restored", localFeed.value);
// A scenario epoch proves permissionless settlement, isolated credit, and independent owner claim.
await run("holder-scenario-protect", manifest.scenarioPool, a.pool.abi, "protect", [1n, dead], parseEther("5"), h);
const maturity = await read(manifest.scenarioPool, a.pool.abi, "maturity");
await c.request({ method: "evm_setNextBlockTimestamp", params: [Number(maturity)] });
await c.request({ method: "evm_mine", params: [] });
await run("permissionless-expiry", manifest.scenarioPool, a.pool.abi, "settleExpired", [1n]);
await run("holder-matured-backing-claim", manifest.scenarioPool, a.pool.abi, "claimBacking", [], undefined, h);
const sourceHash = {};
for (const file of [
  "contracts/src/ShieldPool.sol",
  "contracts/src/ShieldMarket.sol",
  "contracts/src/DemoAssets.sol",
  "contracts/src/ShieldFtsoV2Oracle.sol",
  "contracts/test/mocks/FlareMocks.sol",
  "scripts/setup-markets.mjs",
  "scripts/local-journey.mjs",
])
  sourceHash[file] = keccak256(toHex(readFileSync(file)));
mkdirSync("docs/evidence", { recursive: true });
writeFileSync(
  "docs/evidence/local-journey.json",
  JSON.stringify(
    {
      network: "Local Anvil only (chain 31337) with Flare stand-ins; not Coston2",
      chainId: 31337,
      createdAt: new Date().toISOString(),
      priceSource:
        "Real ShieldFtsoV2Oracle reading MockFtsoV2 through MockFlareContractRegistry (FLR/USD 639928, 8 decimals, as read on Coston2 on 19 October 2026)",
      sourceHash,
      tests: [
        "Flare stand-ins and factory atomic seeded markets",
        "funded WC2FLR buy then protect",
        "FTSOv2 price rise, partial gain exit and independent reward claim",
        "ownership transfer preserves entry basis",
        "partial provider basket redemption",
        "creator and protocol pull fee claim",
        "funded sell",
        "bounded vault redeem",
        "vault-backed native claim and receipt redemption",
        "stale FTSOv2 feed blocks protection, asset exit and trading; backing exit still pays",
        "permissionless expiry and segregated credit claim",
      ],
      expectedReverts,
      transactions: manifest.transactions,
    },
    null,
    2,
  ) + "\n",
);
// Fresh setup is needed for browser workflows because this evidence intentionally expires its epoch.
console.log(
  `Confirmed ${manifest.transactions.length} local transactions and ${expectedReverts.length} expected reverts; source-bound evidence saved. No Coston2 transaction was sent.`,
);
if (process.argv.includes("--browser-ready")) {
  await c.request({ method: "anvil_reset", params: [] });
  reset();
  await prepare();
  console.log("Fresh local deployment prepared for browser checks after evidence capture.");
}
