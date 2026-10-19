import { useReviewGuard } from "./review";
import { consumeReview } from "./lifecycle.mjs";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { decodeEventLog, formatUnits, isAddress, type Address } from "viem";
import {
  assets,
  read,
  client,
  poolAbi,
  oracleAbi,
  fmt,
  units,
  DEFAULT_TERMS,
  explorer,
  short,
  walletProvider,
  chainTimestamp,
  chainDeadline,
} from "./chain";
import { useAlpine, type Snapshot, type Position } from "./state";
import {
  useMarket,
  PageTitle,
  MarketSelect,
  Amount,
  Facts,
  Risk,
  ActionButton,
  RouteLink,
  Empty,
} from "./ui";
import { minimumOutput, safeError } from "./math.mjs";
type Quote = {
  assertCurrent: () => void;
  amount: bigint;
  output: bigint;
  secondary?: bigint;
  minimum: bigint;
  secondaryMinimum?: bigint;
  deadline: bigint;
  account: Address;
  details?: string;
};
async function valid(q: Quote) {
  if (q.deadline < (await chainTimestamp()))
    throw new Error("Review expired. Get a fresh quote.");
  const accounts = (await walletProvider()!.request({
    method: "eth_accounts",
  })) as string[];
  if (accounts[0]?.toLowerCase() !== q.account.toLowerCase())
    throw new Error("Wallet changed. Review again.");
  q.assertCurrent();
}
export function RoleFlow({ role }: { role: "protect" | "provide" }) {
  const {
    market,
    snapshot: s,
    account,
    identity,
    params,
    balances,
    approve,
    transact,
    setMessage,
    ready,
  } = useMarket();
  const [amount, setAmount] = useState(params.get("amount") || ""),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState<string | null>(null),
    [working, setWorking] = useState(false);
  const guard = useReviewGuard([amount, market.key, identity, role]);
  const asset = assets.find((a) => a.key === market.asset)!;
  const provider = role === "provide",
    symbol = provider ? market.backingSymbol : asset.symbol;
  const balance =
    balances[
      provider
        ? market.backingSymbol === "bvaDEMO"
          ? "backing-vault"
          : "backing"
        : market.asset
    ];
  useEffect(() => {
    setQuote(null);
    setSuccess(null);
    setError("");
  }, [amount, market.key, identity, role]);
  useEffect(
    () => setAmount(params.get("amount") || ""),
    [market.key, params.get("amount")],
  );
  async function review() {
    setError("");
    const assertCurrent = guard();
    setWorking(true);
    setError("");
    try {
      if (!account || !market.address)
        throw new Error("Connect your wallet to a deployed market.");
      const n = units(amount, provider ? 6 : 18);
      if (balance !== undefined && n > balance)
        throw new Error("Amount exceeds your available balance.");
      const [reserve, maturity] = await Promise.all(
        ["reservedBacking", "maturity"].map((name) =>
          read(market.address!, poolAbi, name),
        ),
      );
      if ((await chainTimestamp()) >= maturity)
        throw new Error("This epoch has ended. Create a fresh market.");
      let out: bigint;
      if (provider) {
        if (reserve > 0n)
          throw new Error(
            "Provider entry is frozen until all protected positions settle. Create a fresh market to provide now.",
          );
        const [nav, shares] = await Promise.all(
          ["juniorValue", "totalShares"].map((name) =>
            read(market.address!, poolAbi, name),
          ),
        );
        out = shares === 0n ? n * 10n ** 12n : (n * shares) / nav;
      } else {
        const oracle = await read(market.address, poolAbi, "oracle");
        const price = await read(oracle, oracleAbi, "price");
        out = (n * price) / 10n ** 18n;
        if (out < 10_000n)
          throw new Error(
            `The entry claim must be at least 0.01 ${market.backingSymbol}. Increase the amount.`,
          );
        const [capacity, openIds] = await Promise.all(
          ["capacity", "openPositionIds"].map((name) =>
            read(market.address!, poolAbi, name),
          ),
        );
        if (out > capacity)
          throw new Error(
            "Not enough unreserved backing for this entry claim.",
          );
        if ((openIds as bigint[]).length >= 100)
          throw new Error(
            "This market already has 100 open positions. Try again after one closes, or use another market.",
          );
      }
      if (out === 0n) throw new Error("Amount is too small.");
      const reviewedDeadline = await chainDeadline();
      assertCurrent();
      setQuote({
        assertCurrent,
        amount: n,
        output: out,
        minimum: minimumOutput(out),
        deadline: reviewedDeadline,
        account,
      });
    } catch (e) {
      setError(safeError(e));
    } finally {
      setWorking(false);
    }
  }
  async function confirm() {
    setError("");
    const assertCurrent = guard();
    if (!quote || !market.address) return;
    setWorking(true);
    setError("");
    try {
      assertCurrent();
      consumeReview(quote.assertCurrent);
      setQuote(null);
      await valid(quote);
      if (provider || asset.address) {
        const token = provider ? market.backing : asset.address;
        if (token && token !== "0x0000000000000000000000000000000000000000")
          await approve(token, market.address, quote.amount);
      }
      assertCurrent();
      quote.assertCurrent();
      await valid(quote);
      const receipt = await transact(
        provider ? "Provide capital" : "Protect asset",
        market.address,
        poolAbi,
        provider
          ? "depositJuniorBounded"
          : market.asset === "native"
            ? "protect"
            : "protectToken",
        provider
          ? [quote.amount, quote.minimum, quote.deadline]
          : market.asset === "native"
            ? [quote.minimum, quote.deadline]
            : [quote.amount, quote.minimum, quote.deadline],
        !provider && market.asset === "native" ? quote.amount : undefined,
        quote.assertCurrent,
      );
      let path = `/positions?pool=${market.key}`;
      if (!provider) {
        for (const log of receipt.logs) {
          try {
            const event = decodeEventLog({
              abi: poolAbi,
              data: log.data,
              topics: log.topics,
            }) as any;
            if (event.eventName === "Protected")
              path = `/positions/${market.key}:${event.args.id}?pool=${market.key}`;
          } catch {}
        }
      }
      setSuccess(path);
      setQuote(null);
    } catch (e) {
      setError(safeError(e));
      setMessage(safeError(e));
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="workflow">
      <PageTitle
        eyebrow={provider ? "FOR CAPITAL PROVIDERS" : "FOR ASSET HOLDERS"}
        title={
          provider ? "Put your capital to work." : "Choose your protection."
        }
        description={
          provider
            ? "Back a market for a share of gain fees. Your capital carries the downside."
            : "Choose an asset and backing token, then review your entry claim."
        }
      />
      <div className="market-grid">
        <section className="action-card">
          <div className="review-step">
            <b>01 Select</b>
            <span>→</span>
            <b>{quote ? "02 Review" : "02 Review & confirm"}</b>
            <span>→ 03 Position</span>
          </div>
          <MarketSelect />
          {s && !(provider ? s.provideOpen : s.protectOpen) && (
            <p className="error-note" role="status">
              This market's epoch has ended for new{" "}
              {provider ? "capital" : "protection"}. Choose an open market or{" "}
              <RouteLink to="/create-pool">create a fresh one</RouteLink>.
            </p>
          )}
          {success ? (
            <div className="success-panel">
              <h2>{provider ? "Capital provided." : "Protection opened."}</h2>
              <p>Confirmed. Your position is ready.</p>
              <RouteLink className="hero-link" to={success}>
                View position ↗
              </RouteLink>
              <button
                className="text-button"
                onClick={() => {
                  setSuccess(null);
                  setAmount("");
                }}
              >
                Start another
              </button>
            </div>
          ) : (
            <>
              <Amount
                value={amount}
                onChange={setAmount}
                symbol={symbol}
                max={
                  balance !== undefined
                    ? formatUnits(balance, provider ? 6 : 18)
                    : undefined
                }
              />
              <p className="amount-help">
                Balance:{" "}
                {balance !== undefined
                  ? `${fmt(balance, provider ? 6 : 18, 6)} ${symbol}`
                  : "Connect to read balance"}
              </p>
              {quote ? (
                <>
                  <Facts
                    items={[
                      [
                        "You deposit",
                        `${formatUnits(quote.amount, provider ? 6 : 18)} ${symbol}`,
                      ],
                      [
                        provider ? "Provider shares" : "Entry claim",
                        `${formatUnits(quote.output, provider ? 18 : 6)} ${provider ? "shares" : market.backingSymbol}`,
                      ],
                      [
                        "Minimum accepted (0.5% tolerance)",
                        `${formatUnits(quote.minimum, provider ? 18 : 6)} ${provider ? "shares" : market.backingSymbol}`,
                      ],
                      [
                        "Review expires",
                        new Date(
                          Number(quote.deadline) * 1000,
                        ).toLocaleTimeString("en-US"),
                      ],
                    ]}
                  />
                  <ActionButton
                    disabled={working}
                    onClick={() => void confirm()}
                  >
                    Confirm {provider ? "capital provision" : "protection"}
                  </ActionButton>
                  <button
                    className="text-button"
                    onClick={() => setQuote(null)}
                  >
                    Back to amount
                  </button>
                </>
              ) : (
                <ActionButton
                  disabled={working || !amount}
                  onClick={() => void review()}
                >
                  {working
                    ? "Checking market…"
                    : "Review " + (provider ? "provision" : "protection")}
                </ActionButton>
              )}
              {error && (
                <p className="error-note" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </section>
        <section className="market-card">
          <h2>{market.name}</h2>
          <Facts
            items={[
              ["Protected asset", asset.symbol],
              ["Backing", market.backingSymbol],
              [
                "Available entry claims",
                s
                  ? `${fmt(s.capacity)} ${market.backingSymbol}`
                  : ready
                    ? "Unavailable"
                    : "Awaiting deployment",
              ],
              [
                "Collateral",
                s
                  ? s.terms.collateralBps / 100 + "%"
                  : ready
                    ? "Unavailable"
                    : "Prepared default: 150%",
              ],
              [
                "Gain fees · provider / creator / protocol",
                s
                  ? `${s.terms.juniorFeeBps / 100}% / ${s.terms.creatorFeeBps / 100}% / 1%`
                  : ready
                    ? "Unavailable"
                    : "10% / 1% / 1% · prepared",
              ],
              [
                "Maturity",
                s
                  ? new Date(Number(s.maturity) * 1000).toLocaleString("en-US")
                  : ready
                    ? "Unavailable"
                    : "Set at market creation",
              ],
            ]}
          />
          <Risk provider={provider} backing={market.backingSymbol} />
          <div className="button-row">
            <RouteLink
              className="secondary-button"
              to={`/trade?pool=${market.key}&asset=${market.asset}&amount=${encodeURIComponent(amount)}&return=${role}${provider && market.backingSymbol === "bvaDEMO" ? "&convert=deposit-backing" : ""}`}
            >
              Get an asset
            </RouteLink>
            <RouteLink className="secondary-button" to="/create-pool">
              Create fresh market
            </RouteLink>
          </div>
        </section>
      </div>
    </div>
  );
}
export function Positions() {
  const { markets, snapshots, account, ready, errors, loading } = useAlpine();
  const incomplete = ready && (loading || Object.keys(errors).length > 0);
  const own = markets.flatMap((m) =>
    (snapshots[m.key]?.positions || [])
      .filter((p) => p.owner.toLowerCase() === account?.toLowerCase())
      .map((p) => ({ m, p })),
  );
  const providers = markets.filter((m) => {
    const s = snapshots[m.key];
    return (
      s &&
      (s.ownShares > 0n || s.earned > 0n || s.claimable > 0n || s.fees > 0n)
    );
  });
  return (
    <>
      <PageTitle
        eyebrow="YOUR EXPEDITION"
        title="My positions."
        description="Manage protection, capital, fees and backing claims."
      />
      <div className="button-row">
        <RouteLink className="secondary-button" to="/protect">
          Protect an asset
        </RouteLink>
        <RouteLink className="secondary-button" to="/provide">
          Provide capital
        </RouteLink>
      </div>
      {incomplete && (
        <p className="notice">
          Position data is loading or incomplete. A failed registry or market
          read does not mean your positions are empty. See Network status and
          refresh.
        </p>
      )}
      {!account || (!incomplete && !own.length && !providers.length) ? (
        <Empty
          title={
            !account ? "Connect to see your positions" : "No open positions yet"
          }
        >
          {!ready
            ? "Position tracking becomes live after Fuji deployment."
            : "Open protection or provide backing in an available market."}
        </Empty>
      ) : null}
      <div className="table-list">
        {own.map(({ m, p }) => (
          <article key={`${m.key}:${p.id}`}>
            <div className="eyebrow">HOLDER / {m.name}</div>
            <h2>
              {fmt(p.amount, 18, 8)}{" "}
              {assets.find((a) => a.key === m.asset)!.symbol}
            </h2>
            <p>
              Remaining entry claim: {fmt(p.floor)} {m.backingSymbol}
            </p>
            <RouteLink
              className="hero-link"
              to={`/positions/${m.key}:${p.id}?pool=${m.key}`}
            >
              Manage protection #{String(p.id)} ↗
            </RouteLink>
          </article>
        ))}
        {providers.map((m) => (
          <ProviderPosition key={m.key} marketKey={m.key} />
        ))}
      </div>
    </>
  );
}
export function PositionDetail() {
  const { key = "" } = useParams();
  const [routeParams] = useSearchParams();
  const split = key.lastIndexOf(":");
  const marketKey =
      split < 0 ? routeParams.get("pool") || "reference" : key.slice(0, split),
    id = key.slice(split + 1);
  const { markets, snapshots, account, identity, transact, chainTime } =
    useAlpine();
  const m = markets.find(
      (m) => m.key.toLowerCase() === marketKey.toLowerCase(),
    ),
    s = m ? snapshots[m.key] : undefined,
    p = s?.positions.find((p) => String(p.id) === id);
  const [amount, setAmount] = useState(""),
    [mode, setMode] = useState<"asset" | "backing" | "transfer">("asset"),
    [recipient, setRecipient] = useState(""),
    [q, setQ] = useState<Quote | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setQ(null);
    setError("");
  }, [amount, mode, recipient, identity, key]);
  const guard = useReviewGuard([amount, mode, recipient, identity, key]);
  if (!m || !s || !p)
    return (
      <>
        <PageTitle
          eyebrow="PROTECTION"
          title="Position details."
          description="Every position keeps its own remaining entry claim and maturity."
        />
        <Empty
          title={
            s ? "Position closed or not found" : "Position data unavailable"
          }
        >
          Connect and refresh to load your position. A fully exited position no
          longer has a live entry.{" "}
          <RouteLink to="/positions">Return to positions</RouteLink>.
        </Empty>
      </>
    );
  const asset = assets.find((a) => a.key === m.asset)!,
    own = p.owner.toLowerCase() === account?.toLowerCase(),
    matured = chainTime >= s.maturity;
  async function review() {
    setError("");
    const assertCurrent = guard();
    try {
      if (!account || !m?.address || !p) throw new Error("Connect first.");
      if (mode === "transfer") {
        if (
          !isAddress(recipient) ||
          recipient.toLowerCase() === account.toLowerCase()
        )
          throw new Error("Enter a different valid recipient address.");
        const reviewedDeadline = await chainDeadline();
        assertCurrent();
        setQ({
          assertCurrent,
          amount: p.amount,
          output: p.floor,
          minimum: 0n,
          deadline: reviewedDeadline,
          account,
        });
        return;
      }
      const n = units(amount);
      if (n > p.amount) throw new Error("Amount exceeds position.");
      let output: bigint;
      if (mode === "asset") {
        [output] = await read(m.address, poolAbi, "previewPartialExit", [
          p.id,
          n,
        ]);
      } else output = n === p.amount ? p.floor : (p.floor * n) / p.amount;
      if (!output) throw new Error("Exit amount is too small.");
      const reviewedDeadline = await chainDeadline();
      assertCurrent();
      setQ({
        assertCurrent,
        amount: n,
        output,
        minimum: minimumOutput(output),
        deadline: reviewedDeadline,
        account,
      });
    } catch (e) {
      setError(safeError(e));
    }
  }
  async function confirm() {
    setError("");
    const assertCurrent = guard();
    try {
      if (!q || !m?.address || !p) return;
      assertCurrent();
      consumeReview(q.assertCurrent);
      setQ(null);
      await valid(q);
      await transact(
        mode === "transfer" ? "Transfer position" : `Partial ${mode} exit`,
        m.address,
        poolAbi,
        mode === "transfer"
          ? "transferPosition"
          : mode === "asset"
            ? "partialExitAsset"
            : "partialExitBacking",
        mode === "transfer"
          ? [p.id, recipient]
          : [p.id, q.amount, q.minimum, q.deadline],
        undefined,
        q.assertCurrent,
      );
      setQ(null);
      setAmount("");
    } catch (e) {
      setError(safeError(e));
    }
  }
  return (
    <>
      <PageTitle
        eyebrow={`PROTECTION #${id} / ${m.name}`}
        title="Your remaining claim."
        description="Exit, transfer or settle your protection. Partial exits preserve the remaining entry basis."
      />
      <div className="market-grid">
        <section className="market-card">
          <h2>
            {fmt(p.amount, 18, 8)} {asset.symbol}
          </h2>
          <Facts
            items={[
              ["Entry claim", `${fmt(p.floor, 6, 6)} ${m.backingSymbol}`],
              ["Owner", short(p.owner)],
              [
                "Asset exit available",
                new Date(
                  Number(p.openedAt) + s.terms.exitDelay > 0
                    ? (Number(p.openedAt) + s.terms.exitDelay) * 1000
                    : 0,
                ).toLocaleString("en-US"),
              ],
              [
                "Maturity",
                new Date(Number(s.maturity) * 1000).toLocaleString("en-US"),
              ],
            ]}
          />
          <Risk backing={m.backingSymbol} />
        </section>
        <section className="action-card">
          <h2>Manage protection</h2>
          {matured ? (
            <>
              <p>
                Asset exits have ended. Settle the remaining entry claim into
                backing credit, then claim it from Positions. This gives up the
                remaining asset and its upside.
              </p>
              <ActionButton
                onClick={() =>
                  void transact(
                    "Settle matured position",
                    m.address!,
                    poolAbi,
                    "settleExpired",
                    [p.id],
                  ).catch((e) => setError(safeError(e)))
                }
              >
                Settle matured position
              </ActionButton>
            </>
          ) : !own ? (
            <p className="muted-text">
              Only the current owner can exit or transfer this position.
            </p>
          ) : (
            <>
              <div className="tabs">
                {(["asset", "backing", "transfer"] as const).map((v) => (
                  <button
                    aria-pressed={mode === v}
                    className={mode === v ? "active" : ""}
                    key={v}
                    onClick={() => setMode(v)}
                  >
                    {v === "asset"
                      ? `Exit ${asset.symbol}`
                      : v === "backing"
                        ? `Exit ${m.backingSymbol}`
                        : "Transfer"}
                  </button>
                ))}
              </div>
              {mode === "transfer" ? (
                <label className="field-label">
                  Recipient address
                  <input
                    name="recipient-address"
                    autoComplete="off"
                    spellCheck={false}
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="0x…"
                  />
                </label>
              ) : (
                <Amount
                  value={amount}
                  onChange={setAmount}
                  symbol={asset.symbol}
                  label="Amount to exit"
                  max={formatUnits(p.amount, 18)}
                />
              )}
              <p className="muted-text">
                {mode === "transfer"
                  ? "The recipient receives control of the entire remaining position, with the same entry basis and maturity. Transfers cannot be undone."
                  : `Backing exits surrender the selected asset amount. Asset exits deduct fees only on that slice’s positive gain.`}
              </p>
              {q ? (
                <>
                  <Facts
                    items={[
                      [
                        mode === "transfer" ? "New owner" : "Minimum received",
                        mode === "transfer"
                          ? recipient
                          : `${formatUnits(q.minimum, mode === "asset" ? 18 : 6)} ${mode === "asset" ? asset.symbol : m.backingSymbol}`,
                      ],
                      ["Price tolerance", "0.5% maximum reduction"],
                    ]}
                  />
                  <ActionButton onClick={() => void confirm()}>
                    Confirm{" "}
                    {mode === "transfer" ? "ownership transfer" : "exit"}
                  </ActionButton>
                  <button className="text-button" onClick={() => setQ(null)}>
                    Back
                  </button>
                </>
              ) : (
                <ActionButton onClick={() => void review()}>
                  Review {mode === "transfer" ? "transfer" : "exit"}
                </ActionButton>
              )}
            </>
          )}
          {error && (
            <p className="error-note" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
export function ProviderPosition({ marketKey }: { marketKey: string }) {
  const { markets, snapshots, account, identity, transact, chainTime } =
    useAlpine();
  const m = markets.find((m) => m.key === marketKey)!,
    s = snapshots[marketKey];
  const [amount, setAmount] = useState(""),
    [q, setQ] = useState<Quote | null>(null),
    [error, setError] = useState("");
  useEffect(() => setQ(null), [amount, identity, marketKey]);
  const guard = useReviewGuard([amount, identity, marketKey]);
  if (!s || !account) return null;
  const symbol = assets.find((a) => a.key === m.asset)!.symbol;
  async function action(name: string, label: string, args: unknown[] = []) {
    try {
      await transact(label, m.address!, poolAbi, name, args);
      setError("");
    } catch (e) {
      setError(safeError(e));
    }
  }
  async function review() {
    setError("");
    const assertCurrent = guard();
    try {
      const n = units(amount);
      const [out, asset] = await read(
        m.address!,
        poolAbi,
        "previewJuniorWithdrawal",
        [account, n],
      );
      const reviewedDeadline = await chainDeadline();
      assertCurrent();
      setQ({
        assertCurrent,
        amount: n,
        output: out,
        secondary: asset,
        minimum: minimumOutput(out),
        secondaryMinimum: minimumOutput(asset),
        deadline: reviewedDeadline,
        account: account!,
      });
    } catch (e) {
      setError(safeError(e));
    }
  }
  async function confirm() {
    setError("");
    const assertCurrent = guard();
    if (!q) return;
    try {
      assertCurrent();
      consumeReview(q.assertCurrent);
      setQ(null);
      await valid(q);
      await transact(
        "Redeem provider shares",
        m.address!,
        poolAbi,
        "withdrawJuniorBounded",
        [q.amount, q.minimum, q.secondaryMinimum, q.deadline],
        undefined,
        q.assertCurrent,
      );
      setQ(null);
      setAmount("");
    } catch (e) {
      setError(safeError(e));
    }
  }
  return (
    <article>
      <div className="eyebrow">CAPITAL PROVIDER / {m.name}</div>
      <h2>{fmt(s.ownShares, 18, 8)} provider shares</h2>
      <Facts
        items={[
          ["Earned gain fees", `${fmt(s.earned, 18, 10)} ${symbol}`],
          ["Creator / protocol fees", `${fmt(s.fees, 18, 10)} ${symbol}`],
          [
            "Matured backing credit",
            `${fmt(s.claimable, 6, 6)} ${m.backingSymbol}`,
          ],
          [
            "Withdrawal notice",
            s.ready
              ? new Date(Number(s.ready) * 1000).toLocaleString("en-US")
              : "Not requested",
          ],
          [
            "Exposure",
            s.reserved > 0n
              ? "Frozen until all positions settle"
              : "No open protection",
          ],
        ]}
      />
      <div className="button-row">
        {s.earned > 0n && (
          <button
            className="secondary-button"
            onClick={() =>
              void action("claimRewards", "Claim provider rewards", [account])
            }
          >
            Claim earned fees
          </button>
        )}
        {s.fees > 0n && (
          <button
            className="secondary-button"
            onClick={() =>
              void action("claimFees", "Claim creator / protocol fees", [
                account,
              ])
            }
          >
            Claim creator fees
          </button>
        )}
        {s.claimable > 0n && (
          <button
            className="secondary-button"
            onClick={() => void action("claimBacking", "Claim matured backing")}
          >
            Claim backing credit
          </button>
        )}
        {s.ownShares > 0n && (
          <button
            className="secondary-button"
            onClick={() =>
              void action(
                s.ready ? "cancelJuniorWithdrawal" : "requestJuniorWithdrawal",
                s.ready
                  ? "Cancel withdrawal notice"
                  : "Request withdrawal notice",
              )
            }
          >
            {s.ready ? "Cancel notice" : "Request withdrawal"}
          </button>
        )}
      </div>
      {s.ownShares > 0n && (
        <>
          <Amount
            label="Provider shares to redeem"
            value={amount}
            onChange={setAmount}
            symbol="shares"
            max={formatUnits(s.ownShares, 18)}
          />
          {q ? (
            <>
              <Facts
                items={[
                  [
                    "Minimum backing",
                    `${formatUnits(q.minimum, 6)} ${m.backingSymbol}`,
                  ],
                  [
                    "Minimum surrendered asset",
                    `${formatUnits(q.secondaryMinimum || 0n, 18)} ${symbol}`,
                  ],
                ]}
              />
              <ActionButton onClick={() => void confirm()}>
                Confirm redemption
              </ActionButton>
              <button className="text-button" onClick={() => setQ(null)}>
                Back
              </button>
            </>
          ) : (
            <ActionButton
              disabled={
                !s.ready || chainTime < s.ready || s.reserved > 0n || !amount
              }
              onClick={() => void review()}
            >
              Review partial redemption
            </ActionButton>
          )}
        </>
      )}
      {s.reserved > 0n && (
        <p>
          Capital entry and redemption are frozen.{" "}
          <RouteLink to="/create-pool">Create a fresh market</RouteLink> to
          provide separately. At maturity, settle each outstanding position on
          its detail page.
        </p>
      )}
      {s.positions.length > 0 && chainTime >= s.maturity && (
        <div className="button-row">
          {s.positions.map((p) => (
            <RouteLink
              key={String(p.id)}
              className="secondary-button"
              to={`/positions/${m.key}:${p.id}?pool=${m.key}`}
            >
              Settle #{String(p.id)}
            </RouteLink>
          ))}
        </div>
      )}
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
