/** Read-only evidence capture after the CUA browser journey; never broadcasts. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { createPublicClient, http, decodeFunctionData } from "viem";
const rpc = "http://127.0.0.1:8547";
const client = createPublicClient({ transport: http(rpc) });
if ((await client.getChainId()) !== 31337)
  throw new Error("Evidence capture is local-only");
const manifest = JSON.parse(readFileSync(".local/deployment.json"));
if (manifest.chainId !== 31337 || manifest.rpcUrl !== rpc)
  throw new Error("Unexpected local manifest");
const accounts = await client.request({ method: "eth_accounts" });
const browserSigners = accounts.slice(2, 4).map((a) => a.toLowerCase());
const abi = [
  "AlpinePool",
  "AlpineFactory",
  "AlpineExchange",
  "AlpineDemoVault",
  "AlpineWrappedAVAX",
  "AlpineDemoDollar",
].flatMap((name) => JSON.parse(readFileSync(`config/abi/${name}.json`)));
const last = await client.getBlockNumber();
const transactions = [];
for (let blockNumber = 1n; blockNumber <= last; blockNumber++) {
  const block = await client.getBlock({
    blockNumber,
    includeTransactions: true,
  });
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
const sourceHashes = {};
for (const file of [
  ...readdirSync("src").map((name) => `src/${name}`),
  ...["AlpinePool.sol", "AlpineMarket.sol", "DemoAssets.sol"].map(
    (name) => `contracts/src/${name}`,
  ),
])
  sourceHashes[file] = createHash("sha256")
    .update(readFileSync(file))
    .digest("hex");
const native = JSON.parse(readFileSync("docs/evidence/local-journey.json"));
const poolAbi = JSON.parse(readFileSync("config/abi/AlpinePool.json"));
const customPool = "0x74f28Bba2A8ef311D15a8A816Bb42B750cDd635F";
const readPool = (address, functionName, args = []) =>
  client.readContract({ address, abi: poolAbi, functionName, args });
const [
  wrappedNextId,
  wrappedReserved,
  customShares,
  customClaim,
  customReserved,
] = await Promise.all([
  readPool(manifest.wrappedPool, "nextPositionId"),
  readPool(manifest.wrappedPool, "reservedBacking"),
  readPool(customPool, "shares", [accounts[2]]),
  readPool(customPool, "claimableBacking", [accounts[2]]),
  readPool(customPool, "reservedBacking"),
]);
assert.equal(
  wrappedNextId,
  2n,
  "Navigating away during approval must not create another position",
);
assert.equal(
  wrappedReserved,
  0n,
  "Transferred wrapped position was fully exited",
);
assert.equal(
  customShares,
  0n,
  "Custom pool provider fully redeemed after settlement",
);
assert.equal(
  customClaim,
  0n,
  "Holder claimed credit after provider redemption",
);
assert.equal(
  customReserved,
  0n,
  "Custom pool maturity cleared protection reserve",
);
const evidence = {
  network: "Disposable local Anvil only; no Fuji broadcast",
  chainId: 31337,
  recordedAt: new Date().toISOString(),
  browserDriver:
    "CUA with explicit localhost-only unlocked Anvil wallet bridge; no actual extension approval",
  nativeJourneyTransactions: native.transactions.length,
  localFixtureTransactions: manifest.transactions.length,
  browserTransactionCount: transactions.length,
  allBrowserReceiptsSuccessful: transactions.every(
    (t) => t.status === "success",
  ),
  testedSourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  finalContractAssertions: {
    wrappedNextPositionId: String(wrappedNextId),
    wrappedReservedBacking: String(wrappedReserved),
    customProviderShares: String(customShares),
    customHolderCredit: String(customClaim),
    customReservedBacking: String(customReserved),
    allPassed: true,
  },
  sourceHashes,
  transactions,
};
mkdirSync("docs/evidence/e2e", { recursive: true });
writeFileSync(
  "docs/evidence/e2e/browser-receipts.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  `${transactions.length} CUA-signed transactions captured separately from ${manifest.transactions.length} fixture and ${native.transactions.length} native-journey transactions.`,
);
