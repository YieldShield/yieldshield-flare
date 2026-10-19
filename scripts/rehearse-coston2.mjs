/**
 * Full Coston2 deployment rehearsal on a disposable chain-114 Anvil:
 *
 *   anvil --host 127.0.0.1 --port 8557 --chain-id 114 --silent
 *   node scripts/rehearse-coston2.mjs
 *
 * Flare stand-ins (contracts/test/mocks) are installed at the canonical Coston2 addresses of the
 * FlareContractRegistry, FtsoV2 and WC2FLR, so the rehearsal manifest differs from
 * config/deployment.json only in its RPC, deployer and progress. The rehearsal account is Anvil's
 * publicly known development account 0, funded with exactly one faucet claim (100 C2FLR); fees are
 * Anvil's, not Coston2's 500 gwei base fee, so OPERATIONS sizes the real cost from measured gas. It then
 * runs the real scripts: deploy-coston2 (preflight and --broadcast), verify-coston2, a
 * fail-closed feed check, a featured-market replacement round and verification again, and writes
 * source-bound evidence to docs/evidence/coston2-rehearsal.json. Nothing touches Coston2,
 * config/ or .secrets/.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { flareTestnet } from "viem/chains";
import {
  FLARE_CONTRACT_REGISTRY,
  LOCAL_RPC,
  coston2Network,
  featuredMarkets,
  localFeed,
  mockArtifacts,
  planArtifacts,
} from "./setup-markets.mjs";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const network = coston2Network(true);
const c = createPublicClient({ chain: flareTestnet, transport: http(LOCAL_RPC) });
if ((await c.getChainId()) !== 114)
  throw new Error(
    "Start a disposable chain-114 Anvil first: anvil --host 127.0.0.1 --port 8557 --chain-id 114",
  );
if (!(await c.request({ method: "web3_clientVersion" })).toLowerCase().includes("anvil"))
  throw new Error("The rehearsal only runs against Anvil");
await c.request({ method: "anvil_reset", params: [] });
const base = JSON.parse(readFileSync("config/deployment.json"));
const deployer = privateKeyToAccount(network.rehearsalKey);
const operator = createWalletClient({
  account: privateKeyToAccount(
    // Anvil development account 1: configures the stand-ins only.
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  ),
  chain: flareTestnet,
  transport: http(LOCAL_RPC),
});

// Flare stand-ins at the canonical Coston2 addresses.
const mocks = mockArtifacts();
const ftsoAddress = base.references.ftsoV2ObservedAt20261019;
const standIns = [
  [FLARE_CONTRACT_REGISTRY, mocks.registry, "FlareContractRegistry"],
  [ftsoAddress, mocks.ftso, "FtsoV2"],
  [base.wrapper, mocks.wnat, "WNat (WC2FLR)"],
];
for (const [address, a] of standIns)
  await c.request({ method: "anvil_setCode", params: [address, a.deployedBytecode.object] });
const configure = async (address, abi, functionName, args) => {
  const hash = await operator.sendTransaction({
    to: address,
    data: encodeFunctionData({ abi, functionName, args }),
  });
  const receipt = await c.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} failed`);
};
await configure(FLARE_CONTRACT_REGISTRY, mocks.registry.abi, "setContractAddress", ["FtsoV2", ftsoAddress]);
await configure(FLARE_CONTRACT_REGISTRY, mocks.registry.abi, "setContractAddress", ["WNat", base.wrapper]);
await configure(ftsoAddress, mocks.ftso.abi, "setFeed", [base.ftsoFeed.id, localFeed.value, localFeed.decimals]);
await c.request({
  method: "anvil_setBalance",
  params: [deployer.address, `0x${parseEther("100").toString(16)}`],
});

// Rehearsal manifest: config/deployment.json with a local RPC, the rehearsal deployer and no progress.
const manifest = {
  ...base,
  rpcUrl: LOCAL_RPC,
  explorer: LOCAL_RPC,
  deployer: deployer.address,
  status: "rehearsal-not-deployed",
  transactions: [],
};
for (const field of [
  "backingToken",
  "scenarioOracle",
  "referenceOracle",
  "vault",
  "backingVault",
  "vaultOracle",
  "factory",
  "exchange",
  ...featuredMarkets(manifest).map(([field]) => field),
])
  manifest[field] = null;
for (const field of ["deploymentId", "source", "failedTransactions", "defaultTerms", "replacements", "verifiedAt"])
  delete manifest[field];
rmSync(".local/rehearsal", { recursive: true, force: true });
mkdirSync(".local/rehearsal", { recursive: true });
writeFileSync(network.manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const steps = [];
function run(script, args, { mayFail = false } = {}) {
  let output = "",
    ok = true;
  try {
    output = execFileSync("node", [`scripts/${script}`, "--local", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    ok = false;
    output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    if (!mayFail) {
      process.stdout.write(output);
      throw new Error(`${script} ${args.join(" ")} failed`);
    }
  }
  process.stdout.write(output);
  steps.push({ command: `node scripts/${script} --local ${args.join(" ")}`.trim(), ok, output: output.trim().split("\n") });
  return output;
}
const recorded = () => JSON.parse(readFileSync(network.manifestPath));
const gasOf = (txs) => txs.reduce((sum, t) => sum + BigInt(t.gasUsed), 0n);

run("deploy-coston2.mjs", []);
run("deploy-coston2.mjs", ["--broadcast"]);
const deployed = recorded();
const planGas = gasOf(deployed.transactions);
run("verify-coston2.mjs", []);

// Fail closed: a stale FTSOv2 reading must stop pricing; restoring it must resume.
const reference = planArtifacts().reference;
const stale = BigInt((await c.getBlock()).timestamp) - BigInt(manifest.maxPriceAge) - 1n;
await configure(ftsoAddress, mocks.ftso.abi, "setFeedTimestamp", [manifest.ftsoFeed.id, stale]);
const staleError = await c
  .readContract({ address: deployed.referenceOracle, abi: reference.abi, functionName: "price" })
  .then(() => null)
  .catch((error) => error.shortMessage ?? error.message);
if (!staleError?.includes("STALE_PRICE")) throw new Error("A stale feed did not stop the reference price");
await configure(ftsoAddress, mocks.ftso.abi, "setFeed", [manifest.ftsoFeed.id, localFeed.value, localFeed.decimals]);
const restored = await c.readContract({
  address: deployed.referenceOracle,
  abi: reference.abi,
  functionName: "price",
});

// A monthly replacement round once the featured markets are within a week of maturity.
const maturity = await c.readContract({
  address: deployed.referencePool,
  abi: planArtifacts().pool.abi,
  functionName: "maturity",
});
await c.request({ method: "evm_setNextBlockTimestamp", params: [Number(maturity - 6n * 86400n)] });
await c.request({ method: "evm_mine", params: [] });
run("deploy-coston2.mjs", ["--replace-featured"]);
run("deploy-coston2.mjs", ["--broadcast", "--replace-featured"]);
const replaced = recorded();
const replacementGas = gasOf(replaced.transactions.filter((t) => t.label.startsWith("r1-")));
run("verify-coston2.mjs", []);

const sourceHash = {};
for (const file of [
  "contracts/src/ShieldPool.sol",
  "contracts/src/ShieldMarket.sol",
  "contracts/src/DemoAssets.sol",
  "contracts/src/ShieldFtsoV2Oracle.sol",
  "contracts/test/mocks/FlareMocks.sol",
  "scripts/deploy-coston2.mjs",
  "scripts/verify-coston2.mjs",
  "scripts/setup-markets.mjs",
  "scripts/rehearse-coston2.mjs",
])
  sourceHash[file] = keccak256(readFileSync(file));
const final = recorded();
writeFileSync(
  "docs/evidence/coston2-rehearsal.json",
  JSON.stringify(
    {
      network:
        "Disposable local Anvil with chain ID 114 (Coston2's); Flare stand-ins at the canonical Coston2 addresses. Not Coston2 activity.",
      chainId: 114,
      createdAt: new Date().toISOString(),
      deployer: `${deployer.address} (Anvil development account 0, publicly known; funded with 100 C2FLR, one faucet claim)`,
      fees: "Anvil's own base fee, not Coston2's 500 gwei; gas amounts are comparable, costs are not",
      standIns: standIns.map(([address, a, role]) => ({
        role,
        address,
        artifact: a.id,
        runtimeHash: keccak256(a.deployedBytecode.object),
      })),
      deploymentId: final.deploymentId,
      sourceCommit: final.source?.commit ?? null,
      artifacts: final.source?.artifacts ?? null,
      gas: {
        planTransactions: deployed.transactions.length,
        planGasUsed: String(planGas),
        replacementTransactions: replaced.transactions.length - deployed.transactions.length,
        replacementGasUsed: String(replacementGas),
      },
      failClosed: {
        staleFeedPriceError: staleError,
        restoredPrice: String(restored),
      },
      featuredMarkets: Object.fromEntries(featuredMarkets(final).map(([field]) => [field, final[field]])),
      retiredMarkets: final.replacements?.[0]?.retired ?? null,
      status: final.status,
      steps,
      transactions: final.transactions,
      sourceHash,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Rehearsal complete: ${deployed.transactions.length} plan transactions (${planGas} gas), ${replaced.transactions.length - deployed.transactions.length} replacement transactions (${replacementGas} gas), verified twice. Evidence: docs/evidence/coston2-rehearsal.json. Nothing was sent to Coston2.`,
);
if (!existsSync("docs/evidence/coston2-rehearsal.json")) process.exit(1);
