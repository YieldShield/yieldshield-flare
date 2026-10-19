/**
 * Scripted public-testnet journey from a second, fresh test wallet, run after
 * `npm run deploy:coston2 -- --broadcast` and `npm run verify:coston2`:
 *
 *   npm run journey:coston2              # Coston2: needs a verified deployment and a funded deployer
 *   npm run journey:coston2 -- --local   # the chain-114 rehearsal (scripts/rehearse-coston2.mjs)
 *
 * The tester key is created on first use in the ignored .secrets/coston2-journey-wallet.json
 * (.local/rehearsal/journey-wallet.json for --local); only its address is printed. The deployer
 * funds it with JOURNEY_FUNDING C2FLR. The tester then claims sDEMO, provides capital, protects
 * native C2FLR and canonical WC2FLR, exits both ways, transfers a position, trades, enters the
 * vault and redeems provider shares. Evidence goes to docs/evidence/coston2-e2e.json
 * (coston2-rehearsal-journey.json for --local). Never use a wallet that holds real funds.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  keccak256,
  parseEther,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { flareTestnet } from "viem/chains";
import { coston2Network, planArtifacts, wnatAbi } from "./setup-markets.mjs";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const local = process.argv.includes("--local");
const network = coston2Network(local);
const m = JSON.parse(readFileSync(network.manifestPath));
if (m.chainId !== 114) throw new Error("Expected a Coston2 (chain 114) manifest");
if (m.status !== "deployed-and-verified")
  throw new Error(
    `The deployment is ${m.status}; run npm run verify:coston2${local ? " -- --local" : ""} first.`,
  );
/** Gas for about 20 transactions at Coston2's fees plus 8 C2FLR protected or wrapped. */
const JOURNEY_FUNDING = parseEther("15");
const c = createPublicClient({ chain: flareTestnet, transport: http(m.rpcUrl) });
if ((await c.getChainId()) !== 114) throw new Error("RPC identity mismatch; stopped");
const walletPath = local ? ".local/rehearsal/journey-wallet.json" : ".secrets/coston2-journey-wallet.json";
if (!existsSync(walletPath)) {
  mkdirSync(walletPath.slice(0, walletPath.lastIndexOf("/")), { recursive: true, mode: 0o700 });
  const privateKey = generatePrivateKey();
  writeFileSync(
    walletPath,
    JSON.stringify(
      {
        purpose: "Fresh YieldShield Flare journey tester. Testnet only; never fund with real assets.",
        address: privateKeyToAccount(privateKey).address,
        privateKey,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
}
const tester = privateKeyToAccount(JSON.parse(readFileSync(walletPath)).privateKey);
const deployerKey = local
  ? network.rehearsalKey
  : JSON.parse(readFileSync(".secrets/coston2-test-signer.json")).privateKey;
const deployer = privateKeyToAccount(deployerKey);
if (deployer.address.toLowerCase() !== m.deployer.toLowerCase()) throw new Error("Unexpected deployer");
if ((await c.getTransactionCount({ address: tester.address })) !== 0)
  console.log(`Note: tester ${tester.address} has sent transactions before; this run continues with it.`);
const as = (account) =>
  createWalletClient({ account, chain: flareTestnet, transport: http(m.rpcUrl) });
const t = as(tester),
  d = as(deployer);
const a = planArtifacts();
const steps = [];
const evidencePath = `docs/evidence/${local ? "coston2-rehearsal-journey" : "coston2-e2e"}.json`;
const save = (extra = {}) =>
  writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        network: local
          ? "Chain-114 rehearsal Anvil with Flare stand-ins; not Coston2 activity"
          : "Flare Testnet Coston2 (chain 114); test assets with no value",
        explorer: local ? null : m.explorer,
        createdAt: new Date().toISOString(),
        deploymentId: m.deploymentId,
        sourceCommit: m.source?.commit ?? null,
        deployer: m.deployer,
        tester: tester.address,
        markets: Object.fromEntries(
          ["referencePool", "scenarioPool", "wrappedPool", "vaultPool", "vaultBackingPool"].map((f) => [f, m[f]]),
        ),
        scriptHash: keccak256(readFileSync("scripts/coston2-journey.mjs")),
        steps,
        ...extra,
      },
      null,
      2,
    ) + "\n",
  );
async function send(label, wallet, request) {
  const hash = request.abi
    ? await wallet.writeContract({ ...request, chain: flareTestnet })
    : await wallet.sendTransaction({ ...request, chain: flareTestnet });
  const r = await c.waitForTransactionReceipt({ hash, timeout: 180_000 });
  steps.push({
    label,
    from: wallet.account.address,
    hash,
    blockNumber: String(r.blockNumber),
    gasUsed: String(r.gasUsed),
    status: r.status,
    logs: r.logs.length,
  });
  save();
  if (r.status !== "success") throw new Error(`${label} reverted (${hash})`);
  console.log(`${label}: ${hash}`);
  return r;
}
const read = (address, abi, functionName, args = []) => c.readContract({ address, abi, functionName, args });
const now = async () => (await c.getBlock()).timestamp;
const deadline = async () => (await now()) + 900n;
/** Waits until chain time reaches `ts`: real time on Coston2, a mined jump on the rehearsal chain. */
async function waitUntil(ts) {
  if (local) {
    await c.request({ method: "evm_setNextBlockTimestamp", params: [Number(ts) + 1] });
    await c.request({ method: "evm_mine", params: [] });
    return;
  }
  while ((await now()) <= ts) await new Promise((resolve) => setTimeout(resolve, 5000));
}
const pool = a.pool.abi;
const price = await read(m.referenceOracle, a.reference.abi, "price");
console.log(
  `Tester ${tester.address}; reference price ${formatUnits(price, 6)} sDEMO per C2FLR from FTSOv2 ${m.ftsoFeed.name}.`,
);
await send("deployer-funds-tester", d, { to: tester.address, value: JOURNEY_FUNDING });
await send("tester-faucet-sdemo", t, { address: m.backingToken, abi: a.token.abi, functionName: "faucet" });
await send("tester-approve-scenario-pool", t, {
  address: m.backingToken,
  abi: a.token.abi,
  functionName: "approve",
  args: [m.scenarioPool, 500_000000n],
});
await send("tester-provides-500-sdemo", t, {
  address: m.scenarioPool,
  abi: pool,
  functionName: "depositJuniorBounded",
  args: [500_000000n, 1n, await deadline()],
});
await send("tester-protects-5-c2flr", t, {
  address: m.referencePool,
  abi: pool,
  functionName: "protect",
  args: [1n, await deadline()],
  value: parseEther("5"),
});
const nativeId = (await read(m.referencePool, pool, "nextPositionId")) - 1n;
await send("tester-wraps-3-c2flr", t, { address: m.wrapper, abi: wnatAbi, functionName: "deposit", value: parseEther("3") });
await send("tester-approves-wc2flr", t, {
  address: m.wrapper,
  abi: wnatAbi,
  functionName: "approve",
  args: [m.wrappedPool, parseEther("3")],
});
const wrappedOpen = await send("tester-protects-3-wc2flr", t, {
  address: m.wrappedPool,
  abi: pool,
  functionName: "protectToken",
  args: [parseEther("3"), 1n, await deadline()],
});
const wrappedId = (await read(m.wrappedPool, pool, "nextPositionId")) - 1n;
const [, , floor] = await read(m.referencePool, pool, "positions", [nativeId]);
// Both positions must pass the exit delay; the WC2FLR one opened last.
const opened = (await c.getBlock({ blockNumber: wrappedOpen.blockNumber })).timestamp;
console.log(`Waiting for the 60 s exit delay (entry claim ${formatUnits(floor, 6)} sDEMO)…`);
await waitUntil(opened + 60n);
await send("tester-partial-asset-exit", t, {
  address: m.referencePool,
  abi: pool,
  functionName: "partialExitAsset",
  args: [nativeId, parseEther("2.5"), 1n, await deadline()],
});
await send("tester-backing-exit-remainder", t, {
  address: m.referencePool,
  abi: pool,
  functionName: "exitBacking",
  args: [nativeId],
});
await send("tester-transfers-wc2flr-position", t, {
  address: m.wrappedPool,
  abi: pool,
  functionName: "transferPosition",
  args: [wrappedId, deployer.address],
});
await send("new-owner-backing-exit", d, {
  address: m.wrappedPool,
  abi: pool,
  functionName: "exitBacking",
  args: [wrappedId],
});
await send("tester-approves-exchange", t, {
  address: m.backingToken,
  abi: a.token.abi,
  functionName: "approve",
  args: [m.exchange, 100_000000n],
});
const [cost] = await read(m.exchange, a.exchange.abi, "quote", [m.wrapper, parseEther("1"), true]);
await send("tester-buys-1-wc2flr", t, {
  address: m.exchange,
  abi: a.exchange.abi,
  functionName: "buy",
  args: [m.wrapper, parseEther("1"), cost, await deadline()],
});
await send("tester-approves-vault", t, {
  address: m.backingToken,
  abi: a.token.abi,
  functionName: "approve",
  args: [m.vault, 10_000000n],
});
await send("tester-vault-deposit", t, {
  address: m.vault,
  abi: a.vault.abi,
  functionName: "depositBounded",
  args: [10_000000n, tester.address, 1n, await deadline()],
});
const notice = await send("tester-provider-notice", t, {
  address: m.scenarioPool,
  abi: pool,
  functionName: "requestJuniorWithdrawal",
});
const ready = await read(m.scenarioPool, pool, "withdrawalReadyAt", [tester.address]);
console.log(`Waiting for the provider notice (ready at ${ready}; notice mined in block ${notice.blockNumber})…`);
await waitUntil(ready);
const shares = await read(m.scenarioPool, pool, "shares", [tester.address]);
await send("tester-redeems-provider-shares", t, {
  address: m.scenarioPool,
  abi: pool,
  functionName: "withdrawJuniorBounded",
  args: [shares, 1n, 0n, await deadline()],
});
const unwrap = await read(m.wrapper, wnatAbi, "balanceOf", [tester.address]);
await send("tester-unwraps-wc2flr", t, { address: m.wrapper, abi: wnatAbi, functionName: "withdraw", args: [unwrap] });
const balances = {
  C2FLR: formatEther(await c.getBalance({ address: tester.address })),
  sDEMO: formatUnits(await read(m.backingToken, a.token.abi, "balanceOf", [tester.address]), 6),
  vsDEMO: formatEther(await read(m.vault, a.vault.abi, "balanceOf", [tester.address])),
};
save({
  referencePrice: `${formatUnits(price, 6)} sDEMO per C2FLR`,
  testerFinalBalances: balances,
  notExercised: [
    "wallet-extension signing (scripted keys only)",
    "permissionless maturity settlement (featured epochs last 30 days)",
    "gain fees: they depend on FLR/USD rising between entry and exit",
  ],
});
console.log(`Journey complete: ${steps.length} confirmed transactions. Evidence: ${evidencePath}.`);
