import {
  createPublicClient,
  defineChain,
  createWalletClient,
  custom,
  http,
  parseAbi,
  formatUnits,
  parseUnits,
  zeroAddress,
  type Address,
  type Abi,
  type EIP1193Provider,
} from "viem";
import { flareTestnet, foundry } from "viem/chains";
import deployment from "../config/deployment.json";
import pool from "../config/abi/ShieldPool.json";
import factory from "../config/abi/ShieldFactory.json";
import exchange from "../config/abi/ShieldExchange.json";
import vault from "../config/abi/ShieldDemoVault.json";
import ftsoOracle from "../config/abi/ShieldFtsoV2Oracle.json";
import wrapper from "../config/abi/WNat.json";
import token from "../config/abi/ShieldDemoDollar.json";
export const localMode =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO === "true";
export const config: Record<string, any> = localMode
  ? JSON.parse(import.meta.env.VITE_LOCAL_MANIFEST)
  : deployment;
/** Flare Testnet Coston2 (chain 114). viem's definition lacks Multicall3, which Coston2 has at the
 * canonical address (runtime code checked against the canonical deployment on 19 October 2026). */
export const coston2 = defineChain({
  ...flareTestnet,
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});
export const chain = localMode ? foundry : coston2;
export const networkName = localMode
  ? "Local Anvil test chain"
  : "Flare Testnet Coston2";
export const faucetUrl = "https://faucet.flare.network/coston2";
// Coston2 has Multicall3, so concurrent reads are aggregated into a few eth_calls.
// The local chain has none, so its reads share JSON-RPC batches instead.
const multicall = Boolean(
  (chain as { contracts?: { multicall3?: unknown } }).contracts?.multicall3,
);
export const client = createPublicClient({
  chain,
  batch: multicall ? { multicall: true } : undefined,
  transport: http(config.rpcUrl, {
    timeout: 12000,
    retryCount: 1,
    batch: !multicall,
  }),
});
// Nested token calls revert with OpenZeppelin errors; include them so failures decode.
const tokenErrors = parseAbi([
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InvalidSender(address sender)",
  "error ERC20InvalidReceiver(address receiver)",
  "error SafeERC20FailedOperation(address token)",
  "error ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max)",
]);
const withErrors = (abi: unknown) => {
  const own = abi as Abi;
  const names = new Set(own.map((item) => "name" in item && item.name));
  return [...own, ...tokenErrors.filter((e) => !names.has(e.name))] as Abi;
};
export const poolAbi = withErrors(pool),
  factoryAbi = withErrors(factory),
  exchangeAbi = withErrors(exchange),
  vaultAbi = withErrors(vault),
  wrapperAbi = withErrors(wrapper),
  tokenAbi = withErrors(token),
  ftsoOracleAbi = withErrors(ftsoOracle);
export const oracleAbi = parseAbi(["function price() view returns(uint256)"]);
/** Direct FTSOv2 reads through the FlareContractRegistry, available before any YieldShield deployment. */
export const flareRegistryAbi = parseAbi([
  "function getContractAddressByName(string) view returns (address)",
]);
export const ftsoV2ViewAbi = parseAbi([
  "function getFeedById(bytes21) view returns (uint256, int8, uint64)",
  "function calculateFeeById(bytes21) view returns (uint256)",
]);
export const read = async (
  address: Address,
  abi: Abi,
  name: string,
  args: readonly unknown[] = [],
): Promise<any> =>
  client.readContract({ address, abi, functionName: name, args });
export const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
export const explorer = (type: "address" | "tx", id: string) =>
  `${config.explorer}/${type}/${id}`;
export const fmt = (value: bigint, decimals = 6, digits = 4) =>
  Number(formatUnits(value, decimals)).toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
export function units(value: string, decimals = 18) {
  if (
    !/^\d+(\.\d*)?$/.test(value) ||
    (value.split(".")[1] || "").length > decimals
  )
    throw new Error(
      `Enter a positive amount with at most ${decimals} decimal places.`,
    );
  const n = parseUnits(value, decimals);
  if (n <= 0n) throw new Error("Amount must be greater than zero.");
  return n;
}
export const chainTimestamp = async () => (await client.getBlock()).timestamp;
export const chainDeadline = async () => (await chainTimestamp()) + 600n;
export const ZERO = zeroAddress;
export const DEFAULT_TERMS = {
  collateralBps: 15000,
  juniorFeeBps: 1000,
  creatorFeeBps: 100,
  epochSeconds: 604800,
  exitDelay: 60,
  juniorNotice: 120,
};
export type AssetKey = "native" | "wrapped" | "vault";
export const assets = [
  {
    key: "native" as AssetKey,
    symbol: "C2FLR",
    name: "Native Coston2 FLR",
    address: ZERO,
    decimals: 18,
    description:
      "Coston2 gas token from Flare's official faucet. Native transfers; test network, no value.",
  },
  {
    key: "wrapped" as AssetKey,
    symbol: "WC2FLR",
    name: "Wrapped Coston2Flare",
    address: config.wrapper as Address | null,
    decimals: 18,
    description:
      "Flare's canonical wrapped C2FLR (WNat), backed 1:1 by deposited C2FLR. Not a YieldShield contract; test network, no value.",
  },
  {
    key: "vault" as AssetKey,
    symbol: "vsDEMO",
    name: "Shield Demo Vault",
    address: config.vault as Address | null,
    decimals: 18,
    description:
      "Funded ERC-4626 sDEMO vault receipts. Value comes from sDEMO held by this vault; no value and no promised yield.",
  },
];
export type Market = {
  key: string;
  name: string;
  asset: AssetKey;
  address: Address | null;
  backing: Address | null;
  backingSymbol: string;
  oracle: Address | null;
  source: string;
};
export const featured: Market[] = [
  {
    key: "reference",
    name: "FLR reference",
    asset: "native",
    address: config.referencePool,
    backing: config.backingToken,
    backingSymbol: "sDEMO",
    oracle: config.referenceOracle,
    source: "FTSOv2 FLR/USD",
  },
  {
    key: "wrapped",
    name: "Wrapped FLR",
    asset: "wrapped",
    address: config.wrappedPool,
    backing: config.backingToken,
    backingSymbol: "sDEMO",
    oracle: config.referenceOracle,
    source: "FTSOv2 FLR/USD",
  },
  {
    key: "vault",
    name: "Funded vault",
    asset: "vault",
    address: config.vaultPool,
    backing: config.backingToken,
    backingSymbol: "sDEMO",
    oracle: config.vaultOracle,
    source: "Vault redemption backing",
  },
  {
    key: "vault-backed",
    name: "FLR · vault collateral",
    asset: "native",
    address: config.vaultBackingPool,
    backing: config.backingVault,
    backingSymbol: "bvsDEMO",
    oracle: null,
    source: "FTSOv2 FLR/USD in vault receipts",
  },
  {
    key: "scenario",
    name: "FLR scenario lab",
    asset: "native",
    address: config.scenarioPool,
    backing: config.backingToken,
    backingSymbol: "sDEMO",
    oracle: config.scenarioOracle,
    source: "Synthetic 0.0060 → 0.0084 → 0.0036 cycle",
  },
];
declare global {
  interface Window {
    ethereum?: EIP1193Provider & {
      on?: (event: string, callback: (...args: any[]) => void) => void;
      removeListener?: (
        event: string,
        callback: (...args: any[]) => void,
      ) => void;
    };
  }
}
let localWallet: Window["ethereum"];
export function setLocalWallet(provider: Window["ethereum"]) {
  if (
    !import.meta.env.DEV ||
    !localMode ||
    import.meta.env.VITE_LOCAL_WALLET !== "true"
  )
    throw new Error("Local wallet disabled");
  localWallet = provider;
}
export function walletProvider() {
  return import.meta.env.DEV &&
    localMode &&
    import.meta.env.VITE_LOCAL_WALLET === "true"
    ? localWallet
    : window.ethereum;
}
export async function wallet() {
  const provider = walletProvider();
  if (!provider)
    throw new Error(
      "Install MetaMask or another Ethereum-compatible wallet to connect.",
    );
  const w = createWalletClient({ chain, transport: custom(provider) });
  const [account] = await w.requestAddresses();
  try {
    await w.switchChain({ id: chain.id });
  } catch (e: any) {
    // MetaMask Mobile wraps "unknown chain" (4902) inside an internal -32603 error.
    const unknownChain = [
      e?.code,
      e?.cause?.code,
      e?.data?.originalError?.code,
      e?.cause?.data?.originalError?.code,
    ].includes(4902);
    if (unknownChain) {
      await w.addChain({ chain });
      await w.switchChain({ id: chain.id });
    } else throw e;
  }
  if ((await w.getChainId()) !== chain.id)
    throw new Error(`Switch to ${chain.name}.`);
  return { w, account };
}
