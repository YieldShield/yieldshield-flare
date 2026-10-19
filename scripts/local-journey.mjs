import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeDeployData,
  encodeFunctionData,
  zeroAddress,
  keccak256,
  toHex,
} from "viem";
import { foundry } from "viem/chains";
import { setupMarkets, artifact, terms } from "./setup-markets.mjs";
const rpc = "http://127.0.0.1:8547",
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
const manifest = {
  ...JSON.parse(readFileSync("config/deployment.json")),
  chainId: 31337,
  rpcUrl: rpc,
  explorer: "http://127.0.0.1:8547",
  deployer: account,
  transactions: [],
  status: "local-only",
};
for (const field of [
  "backingToken",
  "scenarioPool",
  "referencePool",
  "referenceOracle",
  "scenarioOracle",
  "wrapper",
  "vault",
  "backingVault",
  "vaultOracle",
  "factory",
  "exchange",
  "wrappedPool",
  "vaultPool",
  "vaultBackingPool",
])
  manifest[field] = null;
mkdirSync(".local", { recursive: true });
const save = () =>
  writeFileSync(
    ".local/deployment.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );
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
const a = await setupMarkets({
  manifest,
  account,
  deploy,
  call,
  save,
  local: true,
});
const run = (label, address, abi, functionName, args = [], value, signer = w) =>
  call(label, { address, abi, functionName, args, value }, signer);
const read = (address, abi, functionName, args = []) =>
  c.readContract({ address, abi, functionName, args });
const step = async (seconds) => {
  await c.request({ method: "evm_increaseTime", params: [seconds] });
  await c.request({ method: "evm_mine", params: [] });
};
await run(
  "holder-faucet",
  manifest.backingToken,
  a.token.abi,
  "faucet",
  [],
  undefined,
  h,
);
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
const buyAmount = 10n ** 15n,
  [cost] = await read(manifest.exchange, a.exchange.abi, "quote", [
    manifest.wrapper,
    buyAmount,
    true,
  ]);
await run(
  "holder-buy-wrapper",
  manifest.exchange,
  a.exchange.abi,
  "buy",
  [manifest.wrapper, buyAmount, cost, dead],
  undefined,
  h,
);
await run(
  "holder-protection-approve",
  manifest.wrapper,
  a.wrapper.abi,
  "approve",
  [manifest.wrappedPool, buyAmount],
  undefined,
  h,
);
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
await run(
  "local-reference-gain",
  manifest.referenceOracle,
  a.reference.abi,
  "set",
  [50_000000n],
);
await run(
  "holder-partial-asset-exit",
  manifest.wrappedPool,
  a.pool.abi,
  "partialExitAsset",
  [1n, buyAmount / 2n, 1n, dead],
  undefined,
  h,
);
const reward = await read(manifest.wrappedPool, a.pool.abi, "earned", [
  account,
]);
if (reward <= 0n) throw new Error("Expected earned provider fee");
await run(
  "provider-claim-earned-fees",
  manifest.wrappedPool,
  a.pool.abi,
  "claimRewards",
  [account],
);
await run(
  "holder-transfer-remainder",
  manifest.wrappedPool,
  a.pool.abi,
  "transferPosition",
  [1n, account],
  undefined,
  h,
);
await run(
  "new-owner-backing-exit",
  manifest.wrappedPool,
  a.pool.abi,
  "partialExitBacking",
  [1n, buyAmount / 2n, 1n, dead],
);
await run(
  "provider-notice",
  manifest.wrappedPool,
  a.pool.abi,
  "requestJuniorWithdrawal",
);
await step(121);
await run(
  "provider-partial-redemption",
  manifest.wrappedPool,
  a.pool.abi,
  "withdrawJuniorBounded",
  [100n * 10n ** 18n, 1n, 0n, dead],
);
await run(
  "creator-protocol-pull-fees",
  manifest.wrappedPool,
  a.pool.abi,
  "claimFees",
  [account],
);
await run(
  "holder-wrapper-sale-approval",
  manifest.wrapper,
  a.wrapper.abi,
  "approve",
  [manifest.exchange, 10n ** 14n],
  undefined,
  h,
);
await run(
  "holder-sell-wrapper",
  manifest.exchange,
  a.exchange.abi,
  "sellToken",
  [manifest.wrapper, 10n ** 14n, 1n, dead],
  undefined,
  h,
);
await run(
  "vault-bounded-redeem",
  manifest.vault,
  a.vault.abi,
  "redeemBounded",
  [10n ** 18n, account, account, 1n, dead],
);
await run(
  "holder-vault-backing-protect",
  manifest.vaultBackingPool,
  a.pool.abi,
  "protect",
  [1n, dead],
  10n ** 15n,
  h,
);
await step(61);
await run(
  "holder-vault-receipt-claim",
  manifest.vaultBackingPool,
  a.pool.abi,
  "exitBacking",
  [1n],
  undefined,
  h,
);
await run(
  "holder-backing-vault-redeem",
  manifest.backingVault,
  a.backingVault.abi,
  "redeemBounded",
  [50000n, holder, holder, 1n, dead],
  undefined,
  h,
);
// A scenario epoch proves permissionless settlement, isolated credit, and independent owner claim.
await run(
  "holder-scenario-protect",
  manifest.scenarioPool,
  a.pool.abi,
  "protect",
  [1n, dead],
  10n ** 15n,
  h,
);
const maturity = await read(manifest.scenarioPool, a.pool.abi, "maturity");
await c.request({
  method: "evm_setNextBlockTimestamp",
  params: [Number(maturity)],
});
await c.request({ method: "evm_mine", params: [] });
await run(
  "permissionless-expiry",
  manifest.scenarioPool,
  a.pool.abi,
  "settleExpired",
  [1n],
);
await run(
  "holder-matured-backing-claim",
  manifest.scenarioPool,
  a.pool.abi,
  "claimBacking",
  [],
  undefined,
  h,
);
const sourceHash = {};
for (const file of [
  "contracts/src/AlpinePool.sol",
  "contracts/src/AlpineMarket.sol",
  "contracts/src/DemoAssets.sol",
])
  sourceHash[file] = keccak256(toHex(readFileSync(file)));
mkdirSync("docs/evidence", { recursive: true });
writeFileSync(
  "docs/evidence/local-journey.json",
  JSON.stringify(
    {
      network: "Local Anvil only; not Fuji",
      chainId: 31337,
      createdAt: new Date().toISOString(),
      sourceHash,
      tests: [
        "factory atomic seeded markets",
        "funded wrapper buy then protect",
        "partial gain exit and independent reward claim",
        "ownership transfer preserves entry basis",
        "partial provider basket redemption",
        "creator and protocol pull fee claim",
        "funded sell",
        "bounded vault redeem",
        "vault-backed native claim and receipt redemption",
        "permissionless expiry and segregated credit claim",
      ],
      transactions: manifest.transactions,
    },
    null,
    2,
  ) + "\n",
);
// Fresh setup is needed for browser workflows because this evidence intentionally expires its epoch.
console.log(
  `Confirmed ${manifest.transactions.length} local transactions; source-bound evidence saved. No Fuji transaction was sent.`,
);
if (process.argv.includes("--browser-ready")) {
  await c.request({ method: "anvil_reset", params: [] });
  for (const field of [
    "backingToken",
    "scenarioPool",
    "referencePool",
    "referenceOracle",
    "scenarioOracle",
    "wrapper",
    "vault",
    "backingVault",
    "vaultOracle",
    "factory",
    "exchange",
    "wrappedPool",
    "vaultPool",
    "vaultBackingPool",
  ])
    manifest[field] = null;
  manifest.transactions = [];
  await setupMarkets({ manifest, account, deploy, call, save, local: true });
  console.log(
    "Fresh local deployment prepared for browser checks after evidence capture.",
  );
}
