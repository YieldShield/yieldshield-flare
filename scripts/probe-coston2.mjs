/**
 * Read-only rehearsal of the deployment plan against live Coston2 state. The Coston2PlanProbe
 * runtime code (contracts/test/probes) is placed at an unused address with an eth_call state
 * override and given test C2FLR there; its `simulate` deploys every plan contract from the same
 * creation code as the artifacts, wires them to the real FlareContractRegistry, FtsoV2 and WC2FLR,
 * creates the five featured markets and opens two positions. Nothing is signed or broadcast.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  http,
  keccak256,
  parseEther,
  toHex,
} from "viem";
import { flareTestnet } from "viem/chains";
import { artifact, artifactProvenance, planArtifacts } from "./setup-markets.mjs";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const m = JSON.parse(readFileSync("config/deployment.json"));
const c = createPublicClient({ chain: flareTestnet, transport: http(m.rpcUrl) });
if ((await c.getChainId()) !== 114) throw new Error("Expected Coston2 (chain 114)");
const probe = artifact("Coston2PlanProbe");
// An address no key controls: the low 20 bytes of a fixed label's hash.
const address = `0x${keccak256(toHex("yieldshield-flare/coston2-plan-probe")).slice(-40)}`;
const block = await c.getBlock();
const data = encodeFunctionData({
  abi: probe.abi,
  functionName: "simulate",
  args: [m.flareContractRegistry, m.ftsoFeed.id, BigInt(m.maxPriceAge), m.wrapper],
});
const raw = await c.call({
  to: address,
  data,
  gas: 60_000_000n,
  blockNumber: block.number,
  stateOverride: [
    { address, code: probe.deployedBytecode.object, balance: parseEther("100") },
  ],
});
const r = decodeFunctionResult({ abi: probe.abi, functionName: "simulate", data: raw.data });
const plain = Object.fromEntries(
  Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? String(v) : v]),
);
const sourceHash = {};
for (const file of [
  "contracts/src/ShieldPool.sol",
  "contracts/src/ShieldMarket.sol",
  "contracts/src/DemoAssets.sol",
  "contracts/src/ShieldFtsoV2Oracle.sol",
  "contracts/test/probes/Coston2PlanProbe.sol",
])
  sourceHash[file] = keccak256(readFileSync(file));
const { hashes, stale } = artifactProvenance(planArtifacts());
if (stale.length) throw new Error(`contracts/out is stale for ${stale.join(", ")}; rebuild first`);
const evidence = {
  network: "Flare Testnet Coston2, read-only eth_call with a state override; nothing signed or broadcast",
  chainId: 114,
  rpcUrl: m.rpcUrl,
  probedAt: new Date().toISOString(),
  blockNumber: String(block.number),
  probeAddress: address,
  inputs: {
    flareContractRegistry: m.flareContractRegistry,
    feed: m.ftsoFeed,
    maxPriceAge: m.maxPriceAge,
    wrapper: m.wrapper,
  },
  result: plain,
  readable: {
    feed: `${m.ftsoFeed.name} ${formatUnits(r.feedValue, r.feedDecimals)} at ${new Date(Number(r.feedTimestamp) * 1000).toISOString()}`,
    adapterPrice: `${formatUnits(r.price, 6)} sDEMO per C2FLR`,
    nativeEntryClaimFor5C2FLR: `${formatUnits(r.nativeFloor, 6)} sDEMO`,
    wrappedEntryClaimFor5WC2FLR: `${formatUnits(r.wrappedFloor, 6)} sDEMO`,
    planExecutionGas: String(r.planGas),
    realWnatDepositGas: String(r.wnatDepositGas),
    realWnatTransferGas: String(r.wnatTransferGas),
  },
  checks: [
    "every plan contract deploys on Coston2's EVM and passes the chain-114 guard",
    "ShieldFtsoV2Oracle resolves the registry's FtsoV2 and prices FLR/USD through a static call",
    "the factory accepts the canonical WC2FLR and creates all five featured markets",
    "native and WC2FLR protection open at the live feed price",
  ],
  sourceHash,
  artifacts: hashes,
};
mkdirSync("docs/evidence", { recursive: true });
writeFileSync("docs/evidence/coston2-plan-probe.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence.readable, null, 2));
console.log(`Probe of block ${block.number} saved to docs/evidence/coston2-plan-probe.json. Nothing was broadcast.`);
