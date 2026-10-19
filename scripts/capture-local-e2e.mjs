/**
 * Read-only evidence capture after the local browser journey
 * (SHIELD_LOCAL_E2E=1 npm run test:browser -- tests/browser/local-lifecycle.spec.ts). It lists every
 * transaction the browser signed for Anvil accounts 2 and 3, checks the resulting contract state
 * and writes docs/evidence/e2e/browser-receipts.json. It never broadcasts.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createPublicClient, http, decodeFunctionData, keccak256 } from "viem";
import { LOCAL_RPC } from "./setup-markets.mjs";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const client = createPublicClient({ transport: http(LOCAL_RPC) });
if ((await client.getChainId()) !== 31337)
  throw new Error("Evidence capture is local-only");
const manifest = JSON.parse(readFileSync(".local/deployment.json"));
if (manifest.chainId !== 31337 || manifest.rpcUrl !== LOCAL_RPC)
  throw new Error("Unexpected local manifest");
const accounts = await client.request({ method: "eth_accounts" });
const browserSigners = accounts.slice(2, 4).map((a) => a.toLowerCase());
const abi = [
  "ShieldPool",
  "ShieldFactory",
  "ShieldExchange",
  "ShieldDemoVault",
  "ShieldDemoDollar",
  "WNat",
].flatMap((name) => JSON.parse(readFileSync(`config/abi/${name}.json`)));
const last = await client.getBlockNumber();
const transactions = [];
for (let blockNumber = 1n; blockNumber <= last; blockNumber++) {
  const block = await client.getBlock({ blockNumber, includeTransactions: true });
  for (const tx of block.transactions) {
    if (!browserSigners.includes(tx.from.toLowerCase())) continue;
    const receipt = await client.getTransactionReceipt({ hash: tx.hash });
    let operation = "unknown";
    try {
      operation = decodeFunctionData({ abi, data: tx.input }).functionName;
    } catch {}
    transactions.push({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      operation,
      value: String(tx.value),
      status: receipt.status,
      blockNumber: String(blockNumber),
      chainTimestamp: String(block.timestamp),
    });
  }
}
assert.ok(transactions.length > 0, "No browser-signed transactions found");
const poolAbi = JSON.parse(readFileSync("config/abi/ShieldPool.json"));
const readPool = (functionName, args = []) =>
  client.readContract({ address: manifest.wrappedPool, abi: poolAbi, functionName, args });
const [nextId, position, earned, reserved] = await Promise.all([
  readPool("nextPositionId"),
  readPool("positions", [1n]),
  readPool("earned", [accounts[2]]),
  readPool("reservedBacking"),
]);
assert.equal(nextId, 2n, "The browser journey opened exactly one wrapped position");
assert.equal(position[1], 25n * 10n ** 17n, "Half of the 5 WC2FLR position remains after the partial exit");
assert.equal(reserved, position[2], "Only the remaining entry claim stays reserved");
assert.equal(earned, 0n, "The browser account claimed its earned provider fees");
const sourceHashes = {};
for (const file of [
  ...readdirSync("src").map((name) => `src/${name}`),
  ...["ShieldPool.sol", "ShieldMarket.sol", "DemoAssets.sol", "ShieldFtsoV2Oracle.sol"].map(
    (name) => `contracts/src/${name}`,
  ),
  "tests/browser/local-lifecycle.spec.ts",
])
  sourceHashes[file] = keccak256(readFileSync(file));
const evidence = {
  network: "Disposable local Anvil (chain 31337) with Flare stand-ins; no Coston2 broadcast",
  chainId: 31337,
  recordedAt: new Date().toISOString(),
  browserDriver:
    "Playwright with an injected provider that forwards to Anvil's unlocked development accounts; no wallet-extension approval",
  localFixtureTransactions: manifest.transactions.length,
  browserTransactionCount: transactions.length,
  allBrowserReceiptsSuccessful: transactions.every((t) => t.status === "success"),
  finalContractAssertions: {
    wrappedNextPositionId: String(nextId),
    remainingPositionAmount: String(position[1]),
    remainingEntryClaim: String(position[2]),
    wrappedReservedBacking: String(reserved),
    unclaimedProviderFees: String(earned),
    allPassed: true,
  },
  sourceHashes,
  transactions,
};
assert.ok(evidence.allBrowserReceiptsSuccessful, "A browser-signed transaction failed");
mkdirSync("docs/evidence/e2e", { recursive: true });
writeFileSync("docs/evidence/e2e/browser-receipts.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(
  `${transactions.length} browser-signed transactions captured separately from ${manifest.transactions.length} fixture transactions.`,
);
