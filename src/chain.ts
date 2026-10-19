import {
  createPublicClient,
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
import { avalancheFuji, foundry } from "viem/chains";
import deployment from "../config/deployment.json";
import pool from "../config/abi/AlpinePool.json";
import factory from "../config/abi/AlpineFactory.json";
import exchange from "../config/abi/AlpineExchange.json";
import vault from "../config/abi/AlpineDemoVault.json";
import wrapper from "../config/abi/AlpineWrappedAVAX.json";
import token from "../config/abi/AlpineDemoDollar.json";
export const localMode =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO === "true";
export const config: Record<string, any> = localMode
  ? JSON.parse(import.meta.env.VITE_LOCAL_MANIFEST)
  : deployment;
export const chain = localMode ? foundry : avalancheFuji;
// Fuji has Multicall3, so concurrent reads are aggregated into a few eth_calls.
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
  tokenAbi = withErrors(token);
export const oracleAbi = parseAbi(["function price() view returns(uint256)"]);
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
    symbol: "AVAX",
    name: "Native Fuji AVAX",
    address: ZERO,
    decimals: 18,
    description: "Fuji gas token. Native transfers; valueless test network.",
  },
  {
    key: "wrapped" as AssetKey,
    symbol: "awAVAX",
    name: "Alpine Test Wrapped AVAX",
    address: config.wrapper as Address | null,
    decimals: 18,
    description:
      "Actually backed 1:1 by deposited Fuji AVAX. An Alpine test wrapper, not canonical WAVAX.",
  },
  {
    key: "vault" as AssetKey,
    symbol: "vaDEMO",
    name: "Alpine Demo Vault",
    address: config.vault as Address | null,
    decimals: 18,
    description:
      "Funded ERC-4626 aDEMO vault receipts. Value comes from assets held by this vault; no promised yield.",
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
    name: "AVAX reference",
    asset: "native",
    address: config.referencePool,
    backing: config.backingToken,
    backingSymbol: "aDEMO",
    oracle: config.referenceOracle,
    source: "Chainlink AVAX/USD",
  },
  {
    key: "wrapped",
    name: "Wrapped AVAX",
    asset: "wrapped",
    address: config.wrappedPool,
    backing: config.backingToken,
    backingSymbol: "aDEMO",
    oracle: config.referenceOracle,
    source: "Chainlink AVAX/USD",
  },
  {
    key: "vault",
    name: "Funded vault",
    asset: "vault",
    address: config.vaultPool,
    backing: config.backingToken,
    backingSymbol: "aDEMO",
    oracle: config.vaultOracle,
    source: "Vault redemption backing",
  },
  {
    key: "vault-backed",
    name: "AVAX · vault collateral",
    asset: "native",
    address: config.vaultBackingPool,
    backing: config.backingVault,
    backingSymbol: "bvaDEMO",
    oracle: null,
    source: "Chainlink / vault redemption backing",
  },
  {
    key: "scenario",
    name: "AVAX scenario lab",
    asset: "native",
    address: config.scenarioPool,
    backing: config.backingToken,
    backingSymbol: "aDEMO",
    oracle: config.scenarioOracle,
    source: "Synthetic 25 → 35 → 15 cycle",
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
      "Install Core or an Ethereum-compatible wallet to connect.",
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
