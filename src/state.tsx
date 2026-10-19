import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  type Address,
  type Abi,
  type Hash,
  getAddress,
  zeroAddress,
} from "viem";
import {
  client,
  config,
  chain,
  localMode,
  read,
  short,
  wallet,
  walletProvider,
  poolAbi,
  tokenAbi,
  factoryAbi,
  oracleAbi,
  featured,
  assets,
  DEFAULT_TERMS,
  type Market,
} from "./chain";
import { safeError } from "./math.mjs";
import { createLatestRead } from "./lifecycle.mjs";
export type Position = {
  id: bigint;
  owner: Address;
  amount: bigint;
  floor: bigint;
  openedAt: bigint;
};
export type Snapshot = {
  backing: bigint;
  reserved: bigint;
  inventory: bigint;
  totalShares: bigint;
  ownShares: bigint;
  ready: bigint;
  earned: bigint;
  fees: bigint;
  claimable: bigint;
  price: bigint | null;
  oracleError: string;
  capacity: bigint;
  nav: bigint | null;
  maturity: bigint;
  /** New protection is admitted only while chain time + exit delay is before maturity. */
  protectOpen: boolean;
  /** Provider entry is admitted only before maturity (and while no exposure is open). */
  provideOpen: boolean;
  positions: Position[];
  terms: typeof DEFAULT_TERMS;
};
export type Activity = {
  hash: Hash;
  label: string;
  account: Address;
  chainId: number;
  status: "pending" | "confirmed" | "failed" | "unknown";
  time: number;
};
const Context = createContext<any>(null);
export const useAlpine = () =>
  useContext(Context) as {
    account: Address | null;
    identity: number;
    busy: boolean;
    message: string;
    activity: Activity[];
    markets: Market[];
    snapshots: Record<string, Snapshot>;
    balances: Record<string, bigint>;
    loading: boolean;
    chainTime: bigint;
    errors: Record<string, string>;
    connect: () => Promise<void>;
    disconnect: () => void;
    refresh: () => Promise<void>;
    transact: (
      label: string,
      address: Address,
      abi: Abi,
      functionName: string,
      args?: readonly unknown[],
      value?: bigint,
      assertReview?: () => void,
    ) => Promise<any>;
    approve: (
      token: Address,
      spender: Address,
      amount: bigint,
    ) => Promise<void>;
    setMessage: (s: string) => void;
    ready: boolean;
  };
const stored = () => {
  try {
    return JSON.parse(
      localStorage.getItem("alpine-activity-v2") || "[]",
    ) as Activity[];
  } catch {
    return [];
  }
};
export function AlpineProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Address | null>(null),
    [identity, setIdentity] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [markets, setMarkets] = useState<Market[]>(featured),
    [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({}),
    [balances, setBalances] = useState<Record<string, bigint>>({}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(false),
    [chainTime, setChainTime] = useState(0n),
    [activity, setActivity] = useState<Activity[]>(stored);
  const latestRead = useRef(createLatestRead()),
    readsInFlight = useRef(0);
  const generation = useRef(0),
    currentAccount = useRef<Address | null>(null);
  // Production writes require a verified Fuji manifest; only the dev-only local mode accepts local evidence.
  const ready = Boolean(
    config.factory &&
    config.referencePool &&
    config.backingToken &&
    config.chainId === chain.id &&
    config.status ===
      (localMode ? "local-only-verified" : "deployed-and-verified"),
  );
  useEffect(() => {
    try {
      localStorage.setItem(
        "alpine-activity-v2",
        JSON.stringify(activity.slice(0, 100)),
      );
    } catch {
      /* Browser storage can be unavailable; in-memory activity still works. */
    }
  }, [activity]);
  useEffect(() => {
    const provider = walletProvider();
    const reset = () => {
      generation.current++;
      currentAccount.current = null;
      setAccount(null);
      setSnapshots({});
      setBalances({});
      setIdentity((x) => x + 1);
      setMessage(
        "Wallet account or network changed. Reconnect and review a fresh quote.",
      );
    };
    provider?.on?.("accountsChanged", reset);
    provider?.on?.("chainChanged", reset);
    return () => {
      provider?.removeListener?.("accountsChanged", reset);
      provider?.removeListener?.("chainChanged", reset);
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!ready) return;
    readsInFlight.current++;
    try {
      await readAll();
    } finally {
      readsInFlight.current--;
    }
  }, [ready]);
  const readAll = async () => {
    const isLatestRead = latestRead.current.begin();
    const generationAtStart = generation.current,
      owner = currentAccount.current;
    setLoading(true);
    let catalog = [...featured];
    const issues: Record<string, string> = {};
    const blockTime = await client
      .getBlock()
      .then((block) => block.timestamp)
      .catch((error) => {
        issues.clock = safeError(error);
        return 0n;
      });
    try {
      const registry = (await read(
        config.factory,
        factoryAbi,
        "allPools",
      )) as Address[];
      const community = registry.filter(
        (address) =>
          !catalog.some(
            (m) => m.address?.toLowerCase() === address.toLowerCase(),
          ),
      );
      // Community pools are priced by an approved oracle or its bvaDEMO-unit adapter; name the source
      // so a synthetic scenario pool cannot pass for a Chainlink-priced one.
      const sources: [Address | null, string][] = [
        [config.referenceOracle, "Chainlink AVAX/USD"],
        [config.scenarioOracle, "Synthetic 25 → 35 → 15 cycle"],
        [config.vaultOracle, "Vault redemption backing"],
      ];
      const [details, adapters] = await Promise.all([
        Promise.all(
          community.map((address) =>
            Promise.all(
              ["protectedToken", "backing", "oracle"].map((n) =>
                read(address, poolAbi, n),
              ),
            ),
          ),
        ),
        community.length
          ? Promise.all(
              sources.map(([oracle]) =>
                oracle
                  ? read(config.factory, factoryAbi, "backingOracles", [
                      oracle,
                    ]).catch(() => null)
                  : null,
              ),
            )
          : [],
      ]);
      const sourceOf = (oracle: Address) =>
        sources.findIndex(([direct], i) =>
          [direct, adapters[i]].some(
            (o) => o?.toLowerCase() === oracle.toLowerCase(),
          ),
        );
      community.forEach((address, i) => {
        const [asset, backing, oracle] = details[i];
        const item = assets.find(
          (a) => a.address?.toLowerCase() === asset.toLowerCase(),
        );
        if (!item) return;
        const source = sourceOf(oracle);
        catalog.push({
          key: address,
          name: `${source === 1 ? "Scenario" : "Community"} ${item.symbol} · ${short(address)}`,
          asset: item.key,
          address,
          backing,
          backingSymbol:
            backing.toLowerCase() === config.backingVault?.toLowerCase()
              ? "bvaDEMO"
              : "aDEMO",
          oracle,
          source: source < 0 ? "Factory-approved oracle" : sources[source][1],
        });
      });
    } catch (e) {
      issues.registry = safeError(e);
    }
    const data: Record<string, Snapshot> = {};
    await Promise.all(
      catalog
        .filter((m) => m.address)
        .map(async (market) => {
          try {
            const address = market.address!;
            const names = [
              "totalBacking",
              "reservedBacking",
              "juniorInventory",
              "totalShares",
              "maturity",
              "openPositionIds",
              "oracle",
              "terms",
            ];
            const values = await Promise.all(
              names.map((n) => read(address, poolAbi, n)),
            );
            const [
              backing,
              reserved,
              inventory,
              totalShares,
              maturity,
              openIds,
              oracle,
              rawTerms,
            ] = values;
            const terms = Array.isArray(rawTerms)
              ? Object.fromEntries(
                  Object.keys(DEFAULT_TERMS).map((k, i) => [
                    k,
                    Number(rawTerms[i]),
                  ]),
                )
              : rawTerms;
            let price: bigint | null = null,
              oracleError = "";
            try {
              price = await read(oracle, oracleAbi, "price");
            } catch (e) {
              oracleError = safeError(e);
            }
            const positions = (
              await Promise.all(
                (openIds as bigint[]).map((id) =>
                  read(address, poolAbi, "positions", [id]).then((p: any) => ({
                    id,
                    owner: p[0],
                    amount: p[1],
                    floor: p[2],
                    openedAt: p[3],
                  })),
                ),
              )
            ).filter((p) => p.owner !== zeroAddress);
            const personal = owner
              ? await Promise.all(
                  [
                    "shares",
                    "withdrawalReadyAt",
                    "earned",
                    "claimableFees",
                    "claimableBacking",
                  ].map((n) => read(address, poolAbi, n, [owner])),
                )
              : [0n, 0n, 0n, 0n, 0n];
            data[market.key] = {
              backing,
              reserved,
              inventory,
              totalShares,
              maturity,
              // An unreadable clock (0) never marks a market closed; the contract still enforces it.
              protectOpen:
                blockTime === 0n ||
                blockTime + BigInt(terms.exitDelay) < maturity,
              provideOpen: blockTime === 0n || blockTime < maturity,
              positions,
              price,
              oracleError,
              terms,
              ownShares: personal[0],
              ready: personal[1],
              earned: personal[2],
              fees: personal[3],
              claimable: personal[4],
              capacity:
                (backing * 10000n) / BigInt(terms.collateralBps) > reserved
                  ? (backing * 10000n) / BigInt(terms.collateralBps) - reserved
                  : 0n,
              nav:
                inventory === 0n
                  ? backing
                  : price === null
                    ? null
                    : backing + (inventory * price) / 10n ** 18n,
            };
          } catch (e) {
            issues[market.key] = safeError(e);
          }
        }),
    );
    const funds: Record<string, bigint> = {};
    if (owner) {
      await Promise.all(
        [
          ["native", null],
          ["wrapped", config.wrapper],
          ["vault", config.vault],
          ["backing", config.backingToken],
          ["backing-vault", config.backingVault],
        ].map(async ([key, address]) => {
          try {
            funds[key!] = address
              ? await read(address as Address, tokenAbi, "balanceOf", [owner])
              : await client.getBalance({ address: owner });
          } catch (e) {
            issues.balance = safeError(e);
          }
        }),
      );
    }
    if (generationAtStart === generation.current && isLatestRead()) {
      setChainTime(blockTime);
      setMarkets(catalog);
      setSnapshots(data);
      setBalances(funds);
      setErrors(issues);
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    // Background polling never supersedes a read still in flight (a slow RPC would otherwise
    // never publish) and pauses while the tab is hidden. Explicit refreshes still supersede.
    const poll = () => {
      if (!document.hidden && readsInFlight.current === 0) void refresh();
    };
    const timer = setInterval(poll, 20000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [refresh, account]);
  // Remembers only that this browser chose to connect; addresses and keys are never stored.
  const rememberConnection = (on: boolean) => {
    try {
      if (on) localStorage.setItem("alpine-wallet-connected", "1");
      else localStorage.removeItem("alpine-wallet-connected");
    } catch {
      /* Without storage the wallet simply is not restored after a reload. */
    }
  };
  useEffect(() => {
    let remembered = false;
    try {
      remembered = localStorage.getItem("alpine-wallet-connected") === "1";
    } catch {
      /* Storage unavailable. */
    }
    const provider = walletProvider();
    if (!remembered || !provider) return;
    // eth_accounts and eth_chainId never prompt; restore only an already-authorized account on Fuji.
    void Promise.all([
      provider.request({ method: "eth_accounts" }) as Promise<Address[]>,
      provider.request({ method: "eth_chainId" }) as Promise<string>,
    ])
      .then(([accounts, chainId]) => {
        if (
          !accounts?.[0] ||
          Number(chainId) !== chain.id ||
          currentAccount.current
        )
          return;
        const restored = getAddress(accounts[0]);
        generation.current++;
        currentAccount.current = restored;
        setAccount(restored);
        setIdentity((x) => x + 1);
      })
      .catch(() => {});
  }, []);
  function disconnect() {
    rememberConnection(false);
    generation.current++;
    currentAccount.current = null;
    setAccount(null);
    setIdentity((n) => n + 1);
    setBalances({});
    setSnapshots({});
    setMessage("Wallet disconnected from this app.");
  }
  async function connect() {
    try {
      const result = await wallet();
      rememberConnection(true);
      generation.current++;
      currentAccount.current = result.account;
      setAccount(result.account);
      setSnapshots({});
      setBalances({});
      setErrors({});
      setIdentity((x) => x + 1);
      setMessage("Wallet connected. Review each operation before signing.");
    } catch (e) {
      setMessage(safeError(e));
    }
  }
  async function transact(
    label: string,
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[] = [],
    value?: bigint,
    assertReview?: () => void,
  ) {
    if (!ready) throw new Error("Fuji contracts are awaiting deployment.");
    if (!currentAccount.current) throw new Error("Connect your wallet first.");
    const expected = currentAccount.current;
    const expectedGeneration = generation.current;
    setBusy(true);
    let hash: Hash | undefined;
    try {
      const { w, account: active } = await wallet();
      if (
        active.toLowerCase() !== expected.toLowerCase() ||
        currentAccount.current !== expected ||
        generation.current !== expectedGeneration
      )
        throw new Error("Wallet changed. Review again.");
      const request = {
        address,
        abi,
        functionName,
        args,
        account: active,
        value,
        chain,
      };
      const simulation = await client.simulateContract(request);
      const [signingAccount] = await w.getAddresses();
      const signingChain = await w.getChainId();
      if (
        signingAccount?.toLowerCase() !== expected.toLowerCase() ||
        signingChain !== chain.id ||
        currentAccount.current !== expected ||
        generation.current !== expectedGeneration
      )
        throw new Error("Wallet changed before signing. Review again.");
      assertReview?.();
      hash = await w.writeContract(simulation.request as any);
      setActivity((old) => [
        {
          hash: hash!,
          label,
          account: active,
          chainId: chain.id,
          status: "pending",
          time: Date.now(),
        },
        ...old,
      ]);
      setMessage(`${label} submitted. Waiting for confirmation.`);
      const receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: 120000,
      });
      setActivity((old) =>
        old.map((a) =>
          a.hash === hash
            ? {
                ...a,
                status: receipt.status === "success" ? "confirmed" : "failed",
              }
            : a,
        ),
      );
      if (receipt.status !== "success")
        throw new Error(
          "Transaction reverted. No successful action was recorded.",
        );
      setMessage(`${label} confirmed.`);
      await refresh().catch(() =>
        setMessage(
          `${label} confirmed. Data refresh failed; refresh the page to reload balances.`,
        ),
      );
      return receipt;
    } catch (e) {
      if (hash)
        setActivity((old) =>
          old.map((a) =>
            a.hash === hash && a.status === "pending"
              ? { ...a, status: "unknown" }
              : a,
          ),
        );
      setMessage(
        hash
          ? `${safeError(e)} Transaction ${hash} may still confirm; check Activity before retrying.`
          : safeError(e),
      );
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function approve(token: Address, spender: Address, amount: bigint) {
    if (!currentAccount.current) throw new Error("Connect your wallet first.");
    const allowance = await read(token, tokenAbi, "allowance", [
      currentAccount.current,
      spender,
    ]);
    if (allowance < amount)
      await transact("Token allowance", token, tokenAbi, "approve", [
        spender,
        amount,
      ]);
  }
  return (
    <Context.Provider
      value={{
        account,
        identity,
        busy,
        message,
        setMessage,
        activity,
        markets,
        snapshots,
        balances,
        errors,
        loading,
        chainTime,
        connect,
        disconnect,
        refresh,
        transact,
        approve,
        ready,
      }}
    >
      {children}
    </Context.Provider>
  );
}
