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
  networkName,
  faucetUrl,
  flareRegistryAbi,
  ftsoV2ViewAbi,
  ftsoOracleAbi,
} from "./chain";
import { useShield } from "./state";
import { PageTitle, Facts, RouteLink, ActionButton, Empty } from "./ui";
import { safeError, ftsoPrice, feedValue } from "./math.mjs";
import type { Address } from "viem";
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
          { key: "backing", symbol: "sDEMO", decimals: 6 },
          { key: "backing-vault", symbol: "bvsDEMO", decimals: 6 },
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
        description="You need Coston2 C2FLR for gas and sDEMO for backing or trading. Every asset here has no value; no mainnet funds are required."
      />
      <div className="market-grid">
        <section className="action-card">
          <h2>Claim 10,000 sDEMO</h2>
          <p>
            The contract faucet permits one claim per wallet per hour. sDEMO is
            not USDT0 or Flare’s testUSDT0, has no value and is not dollar
            redeemable.
          </p>
          <Facts
            items={[
              [
                "Wallet balance",
                balances.backing !== undefined
                  ? `${fmt(balances.backing)} sDEMO`
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
                "Claim test sDEMO",
                config.backingToken,
                tokenAbi,
                "faucet",
              ).catch((e) => setError(safeError(e)))
            }
          >
            Claim sDEMO
          </ActionButton>
          {error && (
            <p className="error-note" role="alert">
              {error}
            </p>
          )}
        </section>
        <section className="market-card">
          <h2>Coston2 C2FLR for gas</h2>
          <p className="card-description">
            Get gas from Flare’s official faucet with your own test wallet: 100
            C2FLR per address per day. The faucet uses a reCAPTCHA check that
            you complete yourself. Never fund the YieldShield deployer.
          </p>
          <a
            className="hero-link"
            href={faucetUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open the Flare faucet ↗
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
type FeedReading = {
  ftso: Address;
  value: bigint;
  decimals: number;
  timestamp: bigint;
  now: bigint;
  fee: bigint;
  adapterPrice: bigint | null;
  adapterError: string;
};
/** Live FTSOv2 reading through the FlareContractRegistry; available before any deployment. */
function FeedStatus() {
  const [reading, setReading] = useState<FeedReading | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const feed = config.ftsoFeed as { name: string; id: `0x${string}` };
  const maxAge = BigInt(config.maxPriceAge);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const ftso = (await read(
        config.flareContractRegistry,
        flareRegistryAbi,
        "getContractAddressByName",
        ["FtsoV2"],
      )) as Address;
      const [[value, decimals, timestamp], fee, block] = await Promise.all([
        read(ftso, ftsoV2ViewAbi, "getFeedById", [feed.id]),
        read(ftso, ftsoV2ViewAbi, "calculateFeeById", [feed.id]),
        client.getBlock(),
      ]);
      let adapterPrice: bigint | null = null,
        adapterError = "";
      if (config.referenceOracle)
        await read(config.referenceOracle, ftsoOracleAbi, "price")
          .then((p) => (adapterPrice = p))
          .catch((e) => (adapterError = safeError(e)));
      setReading({
        ftso,
        value,
        decimals: Number(decimals),
        timestamp,
        now: block.timestamp,
        fee,
        adapterPrice,
        adapterError,
      });
    } catch (e) {
      setReading(null);
      setError(safeError(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  let check = "Unavailable";
  if (reading) {
    try {
      const price = ftsoPrice(reading, reading.now, maxAge);
      check =
        reading.fee === 0n
          ? `Valid: ${fmt(price, 6, 6)} sDEMO per C2FLR`
          : "Read fee required: the adapter fails closed";
    } catch (e) {
      check = `Rejected (${(e as Error).message}): the adapter would revert`;
    }
  }
  return (
    <article className="market-card">
      <div className="eyebrow">FLARE ENSHRINED ORACLE</div>
      <h2>FTSOv2 {feed.name} feed</h2>
      <Facts
        items={[
          ["Feed ID", short(feed.id)],
          [
            "Value",
            reading
              ? `${feedValue(reading.value, reading.decimals)} (${reading.decimals} decimals)`
              : loading
                ? "Loading…"
                : "Unavailable",
          ],
          [
            "Age",
            reading
              ? `${reading.now - reading.timestamp}s (maximum ${maxAge}s)`
              : "—",
          ],
          ["Read fee", reading ? String(reading.fee) : "—"],
          ["Adapter checks", check],
          [
            "Deployed adapter price",
            !config.referenceOracle
              ? "Adapter not deployed yet"
              : reading?.adapterPrice != null
                ? `${fmt(reading.adapterPrice, 6, 6)} sDEMO`
                : reading?.adapterError || "Unavailable",
          ],
        ]}
      />
      {reading && (
        <a
          className="address"
          href={explorer("address", reading.ftso)}
          target="_blank"
          rel="noreferrer"
        >
          FtsoV2 {reading.ftso} ↗
        </a>
      )}
      <button
        className="secondary-button"
        disabled={loading}
        onClick={() => void load()}
      >
        {loading ? "Reading…" : "Read the feed again"}
      </button>
      <p className="card-description">
        A reference price for valueless C2FLR, read from the registry-resolved
        FtsoV2 contract. It does not give test assets any value.
      </p>
      {error && (
        <p className="error-note" role="alert">
          Feed read: {error}
        </p>
      )}
    </article>
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
        <FeedStatus />
        <article className="market-card">
          <h2>
            {ready
              ? "Contracts configured"
              : config.factory
                ? "Verification pending"
                : "Coston2 deployment pending"}
          </h2>
          <Facts
            items={[
              [
                "Network",
                networkName,
              ],
              ["Chain ID", String(config.chainId)],
              ["Manifest state", config.status],
              [
                "Deployer (test signer)",
                config.deployer ? short(config.deployer) : "Not created yet",
              ],
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
          {config.status === "awaiting-testnet-gas" && config.funding && (
            <p className="card-description">
              The deployer{" "}
              <a
                className="inline-link"
                href={explorer("address", config.deployer)}
                target="_blank"
                rel="noreferrer"
              >
                {short(config.deployer)} ↗
              </a>{" "}
              awaits test C2FLR from the{" "}
              <a
                className="inline-link"
                href={faucetUrl}
                target="_blank"
                rel="noreferrer"
              >
                Flare faucet ↗
              </a>
              . The faucet’s reCAPTCHA is completed by the owner, not by a
              script.
            </p>
          )}
          <p className="card-description">
            Local test results do not confirm a Coston2 deployment.
          </p>
        </article>
        <article className="market-card">
          <h2>Deployment addresses</h2>
          {[
            "flareContractRegistry",
            "referenceOracle",
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
                    ? `${fmt(snapshots[m.key].price!, 6, 6)} ${m.backingSymbol}`
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
            symbol: "sDEMO",
            name: "Shield Demo Dollar",
            address: config.backingToken,
            decimals: 6,
            description:
              "Faucet-issued demo backing. Not USDT0, not Flare’s testUSDT0, no value and not dollar redeemable.",
          },
          {
            key: "backing-vault",
            symbol: "bvsDEMO",
            name: "Shield Backing Vault",
            address: config.backingVault,
            decimals: 6,
            description:
              "Funded sDEMO ERC-4626 receipts used as junior backing. Floors are fixed receipt units; the sDEMO they redeem for can change.",
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
              <small>Contract pending Coston2 deployment</small>
            )}
          </article>
        ))}
      </div>
      <div className="field-note">
        <h2>Research references</h2>
        <p>
          FAssets FXRP (Coston2 FTestXRP, six decimals), Flare’s testUSDT0
          and Sceptre sFLR are not integrated in this deployment. They cannot
          be bought, protected or provided here. FXRP needs six-decimal asset
          support, testUSDT0 is distributed only by the CAPTCHA-protected
          faucet, and sFLR and its FTSO custom feed exist on Flare mainnet
          only. Each integration needs separate oracle, redemption, liquidity
          and security review.
        </p>
        <a
          className="hero-link"
          href="https://dev.flare.network/fassets/reference"
          target="_blank"
          rel="noreferrer"
        >
          FAssets reference ↗
        </a>
      </div>
    </>
  );
}
