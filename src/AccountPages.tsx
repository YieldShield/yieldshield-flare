import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  config,
  assets,
  fmt,
  explorer,
  short,
  read,
  tokenAbi,
  client,
  poolAbi,
  localMode,
} from "./chain";
import { useShield } from "./state";
import { PageTitle, Facts, RouteLink, ActionButton, Empty } from "./ui";
import { safeError } from "./math.mjs";
export function Portfolio() {
  const { account, balances, markets, snapshots, disconnect } = useShield();
  return (
    <>
      <PageTitle
        eyebrow="YOUR HOLDINGS"
        title="Wallet balances."
        description="Balances and claims in their original asset units."
      />
      {account && (
        <button className="secondary-button" onClick={disconnect}>
          Disconnect {short(account)}
        </button>
      )}
      {!account && (
        <Empty title="Connect your wallet">
          Read balances, entry claims and provider exposure for your current
          account.
        </Empty>
      )}
      <div className="catalog-grid">
        {[
          ...assets.map((a) => ({
            key: a.key,
            symbol: a.symbol,
            decimals: 18,
          })),
          { key: "backing", symbol: "aDEMO", decimals: 6 },
          { key: "backing-vault", symbol: "bvaDEMO", decimals: 6 },
        ].map((a) => (
          <article className="market-card" key={a.key}>
            <div className="eyebrow">WALLET / {a.symbol}</div>
            <h2>
              {balances[a.key] !== undefined
                ? fmt(balances[a.key], a.decimals, 8)
                : "—"}{" "}
              <small>{a.symbol}</small>
            </h2>
            <RouteLink className="hero-link" to="/trade">
              Trade or convert ↗
            </RouteLink>
          </article>
        ))}
      </div>
      <div className="table-list">
        {markets
          .filter((m) => snapshots[m.key] && account)
          .map((m) => {
            const s = snapshots[m.key],
              own = s.positions.filter(
                (p) => p.owner.toLowerCase() === account?.toLowerCase(),
              ),
              floor = own.reduce((n, p) => n + p.floor, 0n);
            return (
              <article key={m.key}>
                <h2>{m.name}</h2>
                <Facts
                  items={[
                    [
                      "Protected entry claims",
                      `${fmt(floor, 6, 6)} ${m.backingSymbol}`,
                    ],
                    [
                      "Matured backing credit",
                      `${fmt(s.claimable, 6, 6)} ${m.backingSymbol}`,
                    ],
                    [
                      "Provider ownership",
                      s.totalShares
                        ? `${fmt((s.ownShares * 1000000n) / s.totalShares, 4, 2)}%`
                        : "0%",
                    ],
                    [
                      "Earned asset fees",
                      `${fmt(s.earned, 18, 8)} ${assets.find((a) => a.key === m.asset)!.symbol}`,
                    ],
                  ]}
                />
                <RouteLink
                  className="hero-link"
                  to={`/positions?pool=${m.key}`}
                >
                  Manage holdings ↗
                </RouteLink>
              </article>
            );
          })}
      </div>
    </>
  );
}
export function Activity() {
  const { activity, account, refresh } = useShield();
  const rows = activity.filter(
    (a) =>
      a.chainId === config.chainId &&
      a.account.toLowerCase() === account?.toLowerCase(),
  );
  return (
    <>
      <PageTitle
        eyebrow="TRANSACTION JOURNAL"
        title="Activity."
        description="Transactions submitted from this browser for the connected wallet. Pending or unknown transactions retain their hash for recovery; this is not a complete chain history."
      />
      <button className="secondary-button" onClick={() => void refresh()}>
        Refresh balances
      </button>
      {!rows.length && (
        <Empty title="No recorded transactions">
          Confirmed actions appear here after you use a deployed market.
        </Empty>
      )}
      <div className="table-list">
        {rows.map((a) => (
          <article key={a.hash}>
            <div className="transaction-row">
              <div>
                <h2>{a.label}</h2>
                <p>
                  {new Date(a.time).toLocaleString("en-US")} · {a.status}
                </p>
              </div>
              <a
                className="secondary-button"
                href={explorer("tx", a.hash)}
                target="_blank"
                rel="noreferrer"
              >
                Check transaction ↗
              </a>
            </div>
            <p className="address">{a.hash}</p>
          </article>
        ))}
      </div>
    </>
  );
}
export function Faucet() {
  const [params] = useSearchParams();
  const { account, identity, transact, balances, chainTime } = useShield();
  const [next, setNext] = useState<bigint | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setNext(null);
    if (account && config.backingToken)
      void read(config.backingToken, tokenAbi, "nextClaim", [account])
        .then(setNext)
        .catch((e) => setError(safeError(e)));
  }, [account, identity, balances.backing]);
  return (
    <>
      <PageTitle
        eyebrow="TESTNET SUPPLIES"
        title="Get ready for the route."
        description="You need Fuji AVAX for gas and aDEMO for backing or trading. Every asset here is valueless; no mainnet funds are required."
      />
      <div className="market-grid">
        <section className="action-card">
          <h2>Claim 10,000 aDEMO</h2>
          <p>
            The contract faucet permits one claim per wallet per hour. aDEMO is
            not Circle USDC and is not dollar redeemable.
          </p>
          <Facts
            items={[
              [
                "Wallet balance",
                balances.backing !== undefined
                  ? `${fmt(balances.backing)} aDEMO`
                  : "Unavailable",
              ],
              [
                "Next claim",
                next === null
                  ? "Read after connecting"
                  : next > chainTime
                    ? new Date(Number(next) * 1000).toLocaleString("en-US")
                    : "Available now",
              ],
            ]}
          />
          <ActionButton
            disabled={next !== null && next > chainTime}
            onClick={() =>
              void transact(
                "Claim test aDEMO",
                config.backingToken,
                tokenAbi,
                "faucet",
              ).catch((e) => setError(safeError(e)))
            }
          >
            Claim aDEMO
          </ActionButton>
          {error && (
            <p className="error-note" role="alert">
              {error}
            </p>
          )}
        </section>
        <section className="market-card">
          <h2>Fuji AVAX for gas</h2>
          <p className="card-description">
            Get gas from the official faucet using your test wallet. Never fund
            the Alpine deployer.
          </p>
          <a
            className="hero-link"
            href="https://build.avax.network/console/primary-network/faucet"
            target="_blank"
            rel="noreferrer"
          >
            Open Avalanche faucet ↗
          </a>
          <div className="button-row">
            <RouteLink
              className="secondary-button"
              to={`/trade?${params.toString()}`}
            >
              Return to acquisition
            </RouteLink>
            <RouteLink
              className="secondary-button"
              to={`/trade?${params.toString()}#convert`}
            >
              Wrap or deposit
            </RouteLink>
          </div>
        </section>
      </div>
    </>
  );
}
export function Status() {
  const { ready, markets, snapshots, errors, loading, refresh } = useShield();
  return (
    <>
      <PageTitle
        eyebrow="NETWORK STATUS"
        title="Verify the ground beneath you."
        description="Check deployment, contracts and price availability."
      />
      <div className="market-grid">
        <article className="market-card">
          <h2>
            {ready
              ? "Contracts configured"
              : config.factory
                ? "Verification pending"
                : "Fuji deployment pending"}
          </h2>
          <Facts
            items={[
              [
                "Network",
                localMode ? "Local Anvil test chain" : "Avalanche Fuji C-Chain",
              ],
              ["Chain ID", String(config.chainId)],
              ["Manifest state", config.status],
              [
                "Read status",
                !ready
                  ? "Available after verified deployment"
                  : loading
                    ? "Loading…"
                    : "See individual market results",
              ],
              [
                "Deployment evidence",
                `${config.transactions.length} recorded transactions`,
              ],
            ]}
          />
          <button
            className="secondary-button"
            disabled={!ready || loading}
            onClick={() => void refresh()}
          >
            {loading ? "Refreshing…" : "Refresh network reads"}
          </button>
          <p className="card-description">
            Local test results do not confirm a Fuji deployment.
          </p>
        </article>
        <article className="market-card">
          <h2>Deployment addresses</h2>
          {[
            "factory",
            "exchange",
            "backingToken",
            "wrapper",
            "vault",
            "backingVault",
          ].map((key) => (
            <div key={key}>
              <p className="source-note">{key}</p>
              {config[key] ? (
                <a
                  className="address"
                  href={explorer("address", config[key])}
                  target="_blank"
                  rel="noreferrer"
                >
                  {config[key]} ↗
                </a>
              ) : (
                <p className="muted-text">Not deployed</p>
              )}
            </div>
          ))}
        </article>
      </div>
      <div className="table-list">
        {markets.map((m) => (
          <article key={m.key}>
            <h2>{m.name}</h2>
            <Facts
              items={[
                [
                  "Data status",
                  errors[m.key]
                    ? "Read failed"
                    : snapshots[m.key]
                      ? "Contract read succeeded"
                      : ready || m.address
                        ? loading
                          ? "Loading…"
                          : "Unavailable"
                        : "Awaiting deployment",
                ],
                [
                  "Oracle",
                  snapshots[m.key]?.price
                    ? `${fmt(snapshots[m.key].price!)} ${m.backingSymbol}`
                    : "Unavailable",
                ],
                ["Source", m.source],
              ]}
            />
            {snapshots[m.key]?.oracleError && (
              <p className="error-note" role="alert">
                {snapshots[m.key].oracleError}
              </p>
            )}
            {errors[m.key] && (
              <p className="error-note" role="alert">
                {errors[m.key]}
              </p>
            )}
          </article>
        ))}
      </div>
      {errors.registry && (
        <p className="error-note" role="alert">
          Registry read: {errors.registry}
        </p>
      )}
    </>
  );
}
export function Assets() {
  return (
    <>
      <PageTitle
        eyebrow="TOKEN IDENTITIES"
        title="Know what you hold."
        description="Test assets, their roles and contract addresses."
      />
      <div className="asset-cards">
        {[
          ...assets,
          {
            key: "backing",
            symbol: "aDEMO",
            name: "Alpine Demo Dollar",
            address: config.backingToken,
            decimals: 6,
            description:
              "Faucet-issued valueless demo backing. Not USDC and not dollar redeemable.",
          },
          {
            key: "backing-vault",
            symbol: "bvaDEMO",
            name: "Alpine Backing Vault",
            address: config.backingVault,
            decimals: 6,
            description:
              "Funded aDEMO ERC-4626 receipts used as junior backing. Floors are fixed receipt units, not guaranteed fixed aDEMO value.",
          },
        ].map((a) => (
          <article key={a.key}>
            <div className="eyebrow">
              INTEGRATED CAPABILITY / {a.decimals} DECIMALS
            </div>
            <h2>
              {a.name} · {a.symbol}
            </h2>
            <p>{a.description}</p>
            {a.key === "native" ? (
              <small>Native network asset · no token contract</small>
            ) : a.address ? (
              <a
                className="address"
                href={explorer("address", a.address)}
                target="_blank"
                rel="noreferrer"
              >
                {a.address}
              </a>
            ) : (
              <small>Contract pending Fuji deployment</small>
            )}
          </article>
        ))}
      </div>
      <div className="field-note">
        <h2>Research references</h2>
        <p>
          BENQI sAVAX and Circle USDC are not integrated in this deployment.
          They cannot be bought, protected or provided here. A production
          integration requires separate oracle, redemption, liquidity and
          security review.
        </p>
        <a
          className="hero-link"
          href="https://docs.benqi.fi/benqi-liquid-staking/overview"
          target="_blank"
          rel="noreferrer"
        >
          BENQI documentation ↗
        </a>
      </div>
    </>
  );
}
