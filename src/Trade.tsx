import { useReviewGuard } from "./review";
import { consumeReview } from "./lifecycle.mjs";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { formatUnits, type Address } from "viem";
import {
  assets,
  config,
  exchangeAbi,
  vaultAbi,
  wrapperAbi,
  tokenAbi,
  read,
  units,
  fmt,
  ZERO,
  chainDeadline,
  chainTimestamp,
} from "./chain";
import { useShield } from "./state";
import { PageTitle, Amount, Facts, ActionButton, RouteLink } from "./ui";
import { minimumOutput, safeError } from "./math.mjs";
type Quote = {
  assertCurrent: () => void;
  amount: bigint;
  output: bigint;
  bound: bigint;
  fee: bigint;
  deadline: bigint;
  account: Address;
  identity: number;
};
export function Trade() {
  const [params, setParams] = useSearchParams();
  const { account, identity, balances, approve, transact, markets } =
    useShield();
  // Only known assets are honoured; an unknown query value must not trade a different asset than shown.
  const requestedAsset = params.get("asset");
  const assetKey = assets.some((a) => a.key === requestedAsset)
    ? requestedAsset!
    : "native";
  const side = params.get("side") === "sell" ? "sell" : "buy";
  const amount =
    params.get("tradeAmount") ??
    (params.get("return") === "provide" ? "" : params.get("amount") || "");
  function updateDraft(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set(key, value);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }
  const setAssetKey = (value: string) => updateDraft("asset", value);
  const setSide = (value: string) => updateDraft("side", value);
  const setAmount = (value: string) => updateDraft("tradeAmount", value);
  const [q, setQ] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState<string | null>(null),
    [working, setWorking] = useState(false);
  const asset = assets.find((a) => a.key === assetKey) || assets[0];
  // Quick amounts stay within the seeded exchange inventory (10 C2FLR / 10 WC2FLR, 100 vsDEMO)
  // and above the 0.01 sDEMO minimum entry claim at FLR prices (about 1.6 C2FLR at 0.0064).
  const presets =
    assetKey === "vault" ? ["1", "10", "50"] : ["2", "5", "10"];
  const guard = useReviewGuard([assetKey, side, amount, identity]);
  useEffect(() => {
    setQ(null);
    setSuccess(null);
    setError("");
  }, [assetKey, side, amount, identity]);
  async function review() {
    setError("");
    const assertCurrent = guard();
    setWorking(true);
    try {
      if (!account || !config.exchange || !asset.address)
        throw new Error("Connect to the deployed exchange.");
      const n = units(amount);
      const [out, fee] = await read(config.exchange, exchangeAbi, "quote", [
        asset.address,
        n,
        side === "buy",
      ]);
      assertCurrent();
      const inventory =
        side === "buy"
          ? await read(config.exchange, exchangeAbi, "inventory", [
              asset.address,
            ])
          : await read(config.backingToken, tokenAbi, "balanceOf", [
              config.exchange,
            ]);
      if (inventory < (side === "buy" ? n : out))
        throw new Error(
          "Funded exchange inventory is too low for this trade. Try a smaller amount.",
        );
      const balance = balances[side === "buy" ? "backing" : assetKey];
      if (balance === undefined || balance < (side === "buy" ? out : n))
        throw new Error("Insufficient wallet balance.");
      const reviewedDeadline = await chainDeadline();
      assertCurrent();
      setQ({
        assertCurrent,
        amount: n,
        output: out,
        fee,
        bound: side === "buy" ? (out * 1005n) / 1000n : minimumOutput(out),
        deadline: reviewedDeadline,
        account,
        identity,
      });
      setError("");
    } catch (e) {
      setError(safeError(e));
    } finally {
      setWorking(false);
    }
  }
  async function confirm() {
    setError("");
    const assertCurrent = guard();
    if (!q) return;
    setWorking(true);
    try {
      consumeReview(q.assertCurrent);
      setQ(null);
      if (
        q.account !== account ||
        q.identity !== identity ||
        q.deadline < (await chainTimestamp())
      )
        throw new Error("This review is no longer valid. Review again.");
      const [out] = await read(config.exchange, exchangeAbi, "quote", [
        asset.address,
        q.amount,
        side === "buy",
      ]);
      if (side === "buy" ? out > q.bound : out < q.bound)
        throw new Error(
          "The fresh quote is outside your reviewed limit. Review again.",
        );
      if (side === "buy")
        await approve(config.backingToken, config.exchange, q.bound);
      else if (assetKey !== "native")
        await approve(asset.address!, config.exchange, q.amount);
      if (q.deadline < (await chainTimestamp()))
        throw new Error("Review expired while approving. Review again.");
      const [freshOutput] = await read(config.exchange, exchangeAbi, "quote", [
        asset.address,
        q.amount,
        side === "buy",
      ]);
      if (side === "buy" ? freshOutput > q.bound : freshOutput < q.bound)
        throw new Error(
          "Quote changed outside your reviewed limit after approval. Review again.",
        );
      assertCurrent();
      q.assertCurrent();
      await transact(
        `${side === "buy" ? "Buy" : "Sell"} ${asset.symbol}`,
        config.exchange,
        exchangeAbi,
        side === "buy"
          ? "buy"
          : assetKey === "native"
            ? "sellNative"
            : "sellToken",
        side === "buy"
          ? [asset.address, q.amount, q.bound, q.deadline]
          : assetKey === "native"
            ? [q.bound, q.deadline]
            : [asset.address, q.amount, q.bound, q.deadline],
        side === "sell" && assetKey === "native" ? q.amount : undefined,
        q.assertCurrent,
      );
      setSuccess(
        side === "buy"
          ? `/protect?pool=${markets.find((m) => m.key === params.get("pool") && m.asset === assetKey)?.key || (assetKey === "native" ? "reference" : assetKey)}&amount=${formatUnits(q.amount, 18)}`
          : "sold",
      );
      setQ(null);
    } catch (e) {
      setError(safeError(e));
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="FUND YOUR POSITION"
        title="Trade. Then protect."
        description="Buy and sell test assets for sDEMO. Trade fee: 0.3%."
      />
      {params.get("return") && (
        <RouteLink
          className="hero-link"
          to={`/${params.get("return") === "provide" ? "provide" : "protect"}?pool=${params.get("pool") || "reference"}&amount=${encodeURIComponent(params.get("amount") || "")}`}
        >
          Return to{" "}
          {params.get("return") === "provide"
            ? "capital provision"
            : "protection"}{" "}
          with your amount ↗
        </RouteLink>
      )}
      <div className="market-grid">
        <section className="action-card">
          <h2>Test-asset exchange</h2>
          <label className="field-label">
            Asset
            <select
              aria-label="Asset"
              name="trade-asset"
              value={assetKey}
              onChange={(e) => setAssetKey(e.target.value)}
            >
              {assets.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name} · {a.symbol}
                </option>
              ))}
            </select>
          </label>
          <div className="tabs">
            {(["buy", "sell"] as const).map((v) => (
              <button
                key={v}
                aria-pressed={side === v}
                className={side === v ? "active" : ""}
                onClick={() => setSide(v)}
              >
                {v === "buy" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>
          {success ? (
            <div className="success-panel">
              <h2>Trade confirmed.</h2>
              <p>
                {side === "buy"
                  ? `${amount} ${asset.symbol} is now in your wallet. Protection is a separate transaction.`
                  : "Your sDEMO proceeds are now in your wallet."}
              </p>
              {success !== "sold" && (
                <RouteLink className="hero-link" to={success}>
                  Protect this exact amount ↗
                </RouteLink>
              )}
              <button
                className="text-button"
                onClick={() => {
                  setSuccess(null);
                  setAmount("");
                }}
              >
                New trade
              </button>
            </div>
          ) : (
            <>
              <Amount
                value={amount}
                onChange={setAmount}
                symbol={asset.symbol}
                max={
                  side === "sell" && balances[assetKey] !== undefined
                    ? formatUnits(balances[assetKey], 18)
                    : undefined
                }
              />
              <div className="button-row">
                {presets.map((n) => (
                  <button
                    className="secondary-button"
                    key={n}
                    onClick={() => setAmount(n)}
                  >
                    {n} {asset.symbol}
                  </button>
                ))}
              </div>
              <p className="amount-help">
                Wallet:{" "}
                {balances.backing !== undefined ? fmt(balances.backing) : "—"}{" "}
                sDEMO ·{" "}
                {balances[assetKey] !== undefined
                  ? fmt(balances[assetKey], 18, 6)
                  : "—"}{" "}
                {asset.symbol}
              </p>
              {q ? (
                <>
                  <Facts
                    items={[
                      [
                        side === "buy" ? "You pay" : "You receive",
                        `${fmt(q.output, 6, 6)} sDEMO`,
                      ],
                      ["Included 0.3% fee", `${fmt(q.fee, 6, 6)} sDEMO`],
                      [
                        side === "buy" ? "Maximum payment" : "Minimum proceeds",
                        `${fmt(q.bound, 6, 6)} sDEMO`,
                      ],
                      ["Tolerance", "0.5%"],
                      [
                        "Deadline",
                        new Date(Number(q.deadline) * 1000).toLocaleTimeString(
                          "en-US",
                        ),
                      ],
                    ]}
                  />
                  <ActionButton
                    disabled={working}
                    onClick={() => void confirm()}
                  >
                    Confirm {side}
                  </ActionButton>
                  <button className="text-button" onClick={() => setQ(null)}>
                    Back
                  </button>
                </>
              ) : (
                <ActionButton
                  disabled={!amount || working}
                  onClick={() => void review()}
                >
                  Review trade
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
        <section className="market-card">
          <div className="eyebrow">ASSET DETAILS</div>
          <h2>{asset.name}</h2>
          <p className="card-description">{asset.description}</p>
          <Facts
            items={[
              ["Settlement token", "sDEMO · not USDT0, no value / six decimals"],
              [
                "Price source",
                assetKey === "vault"
                  ? "Vault redemption backing"
                  : "FTSOv2 FLR/USD (block-latency feed)",
              ],
              ["Trade execution", "Only within actual inventory"],
              ["Protection", "Separate opt-in transaction"],
            ]}
          />
          <details className="help-details">
            <summary>How trade pricing works</summary>
            <p>
              A stale or unavailable price blocks trading. Quotes use the price
              source above, with no synthetic fallback. The scenario market is
              separate.
            </p>
          </details>
          <div className="button-row">
            <RouteLink
              className="secondary-button"
              to={`/faucet?${params.toString()}`}
            >
              Get sDEMO
            </RouteLink>
            <RouteLink className="secondary-button" to="/assets">
              Asset identities
            </RouteLink>
          </div>
        </section>
      </div>
      <Conversions />
    </>
  );
}
const conversionKinds = [
  "wrap",
  "unwrap",
  "deposit",
  "redeem",
  "deposit-backing",
  "redeem-backing",
];
export function Conversions() {
  const [params, setParams] = useSearchParams();
  const { account, identity, balances, approve, transact } = useShield();
  const requestedKind = params.get("convert") || "";
  const kind = conversionKinds.includes(requestedKind) ? requestedKind : "wrap";
  const amount =
    params.get("convertAmount") ??
    (params.get("return") === "provide" ? params.get("amount") || "" : "");
  function updateDraft(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set(key, value);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }
  const setKind = (value: string) => updateDraft("convert", value);
  const setAmount = (value: string) => updateDraft("convertAmount", value);
  const [q, setQ] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    setQ(null);
    setError("");
    setSuccess("");
  }, [kind, amount, identity]);
  const guard = useReviewGuard([kind, amount, identity]);
  const wrapping = kind === "wrap" || kind === "unwrap",
    deposit = kind === "deposit" || kind === "deposit-backing",
    backingVault = kind.includes("backing"),
    target = wrapping
      ? config.wrapper
      : backingVault
        ? config.backingVault
        : config.vault;
  const inDecimals = wrapping ? 18 : deposit ? 6 : backingVault ? 6 : 18,
    outDecimals = wrapping ? 18 : deposit ? (backingVault ? 6 : 18) : 6;
  const inSymbol = wrapping
    ? kind === "wrap"
      ? "C2FLR"
      : "WC2FLR"
    : deposit
      ? "sDEMO"
      : backingVault
        ? "bvsDEMO"
        : "vsDEMO";
  const outSymbol = wrapping
    ? kind === "wrap"
      ? "WC2FLR"
      : "C2FLR"
    : deposit
      ? backingVault
        ? "bvsDEMO"
        : "vsDEMO"
      : "sDEMO";
  const balanceKey = wrapping
    ? kind === "wrap"
      ? "native"
      : "wrapped"
    : deposit
      ? "backing"
      : backingVault
        ? "backing-vault"
        : "vault";
  async function review() {
    setError("");
    const assertCurrent = guard();
    try {
      if (!account || !target)
        throw new Error("Connect to the deployed conversion contracts.");
      const n = units(amount, inDecimals);
      if (n > (balances[balanceKey] || 0n))
        throw new Error("Insufficient balance.");
      const out = wrapping
        ? n
        : await read(
            target,
            vaultAbi,
            deposit ? "previewDeposit" : "previewRedeem",
            [n],
          );
      if (!out) throw new Error("Conversion amount too small.");
      const reviewedDeadline = await chainDeadline();
      assertCurrent();
      setQ({
        assertCurrent,
        amount: n,
        output: out,
        bound: minimumOutput(out),
        deadline: reviewedDeadline,
        fee: 0n,
        account,
        identity,
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
      consumeReview(q.assertCurrent);
      setQ(null);
      if (
        q.identity !== identity ||
        q.account !== account ||
        q.deadline < (await chainTimestamp())
      )
        throw new Error("Review expired or wallet changed.");
      if (!wrapping && deposit)
        await approve(config.backingToken, target, q.amount);
      assertCurrent();
      q.assertCurrent();
      await transact(
        `${kind} conversion`,
        target,
        wrapping ? wrapperAbi : vaultAbi,
        wrapping
          ? kind === "wrap"
            ? "deposit"
            : "withdraw"
          : deposit
            ? "depositBounded"
            : "redeemBounded",
        wrapping
          ? kind === "wrap"
            ? []
            : [q.amount]
          : deposit
            ? [q.amount, account, q.bound, q.deadline]
            : [q.amount, account, account, q.bound, q.deadline],
        kind === "wrap" ? q.amount : undefined,
        q.assertCurrent,
      );
      setSuccess(
        `${fmt(q.amount, inDecimals, 8)} ${inSymbol} converted. Your wallet balance has refreshed.`,
      );
      setQ(null);
    } catch (e) {
      setError(safeError(e));
    }
  }
  return (
    <section id="convert" className="scenario-section">
      <div>
        <div className="eyebrow">DIRECT CONVERSIONS</div>
        <h2>Wrap or enter a funded vault.</h2>
        <p>
          Wrap C2FLR 1:1 into Flare’s canonical WC2FLR, or exchange sDEMO for
          funded vault receipts.
        </p>
        <p>vsDEMO can be protected; bvsDEMO backs markets.</p>
        <details className="help-details">
          <summary>How vault receipts work</summary>
          <p>
            Receipts redeem against the sDEMO held by their vault. Only funded
            donations can increase redemption value; no yield is promised.
            vsDEMO has 18 decimals, while bvsDEMO has six. They are separate
            contracts.
          </p>
        </details>
      </div>
      <div className="action-card">
        <label className="field-label">
          Conversion
          <select
            aria-label="Conversion"
            name="conversion-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="wrap">C2FLR → WC2FLR</option>
            <option value="unwrap">WC2FLR → C2FLR</option>
            <option value="deposit">sDEMO → vsDEMO</option>
            <option value="redeem">vsDEMO → sDEMO</option>
            <option value="deposit-backing">sDEMO → bvsDEMO</option>
            <option value="redeem-backing">bvsDEMO → sDEMO</option>
          </select>
        </label>
        <Amount
          value={amount}
          onChange={setAmount}
          symbol={inSymbol}
          label="Conversion amount"
          max={
            balances[balanceKey] !== undefined
              ? formatUnits(balances[balanceKey], inDecimals)
              : undefined
          }
        />
        {q ? (
          <>
            <Facts
              items={[
                [
                  "Expected output",
                  `${formatUnits(q.output, outDecimals)} ${outSymbol}`,
                ],
                [
                  "Minimum accepted",
                  `${formatUnits(wrapping ? q.output : q.bound, outDecimals)} ${outSymbol}`,
                ],
              ]}
            />
            <ActionButton onClick={() => void confirm()}>
              Confirm conversion
            </ActionButton>
            <button className="text-button" onClick={() => setQ(null)}>
              Back
            </button>
          </>
        ) : (
          <ActionButton disabled={!amount} onClick={() => void review()}>
            Review conversion
          </ActionButton>
        )}
        {success && <p className="feedback">{success}</p>}
        {error && (
          <p className="error-note" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
