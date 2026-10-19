import { useParams } from "react-router-dom";
import { useShield } from "./state";
import { assets, fmt, explorer } from "./chain";
import { PageTitle, RouteLink, MarketCard, Facts, Risk, Empty } from "./ui";
export function Markets({ home = false }: { home?: boolean }) {
  const { markets } = useShield();
  return (
    <>
      {home ? (
        <section className="hero">
          <div>
            <div className="eyebrow">YIELDSHIELD / AVALANCHE FIELD STATION</div>
            <h1>
              Explore the upside.
              <br />
              <em>Define your floor.</em>
            </h1>
            <p>
              Protect your assets or provide the capital behind them. Three test
              assets. Two forms of backing.
            </p>
            <div className="button-row">
              <RouteLink className="secondary-button" to="/protect">
                Protect an asset ↗
              </RouteLink>
              <RouteLink className="secondary-button" to="/provide">
                Provide capital ↗
              </RouteLink>
            </div>
          </div>
          <div className="mountain-art" aria-hidden>
            <svg viewBox="0 0 500 330">
              <path d="M0 300 145 125 230 235 335 35 500 300Z" fill="#d9e7d8" />
              <path d="m145 125 85 110 105-200 165 265H230Z" fill="#b3cfb8" />
              <path d="m335 35-35 71 36-18 22 18Z" fill="#fffefa" />
              <path d="M0 300 125 200 245 300 320 190 500 300" fill="#729e80" />
              <path d="M0 310h500" stroke="#294d36" />
              <path
                d="M335 35v-26l35 10-35 7"
                fill="#ef775d"
                stroke="#526f51"
              />
            </svg>
            <span className="altitude">46° 51′ N · THE ALPINE EXPERIMENT</span>
          </div>
        </section>
      ) : (
        <PageTitle
          eyebrow="DISCOVER"
          title="Find your market."
          description="Choose an asset, backing token and role."
        />
      )}
      <div className="market-heading">
        <div>
          <div className="eyebrow">EXPLORE THE RANGE</div>
          <h2>Protection markets</h2>
        </div>
        <RouteLink className="secondary-button" to="/create-pool">
          Create a market +
        </RouteLink>
      </div>
      <div className="catalog-grid">
        {markets.map((m) => (
          <MarketCard key={m.key} market={m} />
        ))}
      </div>
      <details className="field-note help-details">
        <summary>What backs these test assets?</summary>
        <p>
          All assets are valueless test tokens. awAVAX wraps actual Fuji AVAX;
          vaDEMO and bvaDEMO represent funded aDEMO vault deposits. sAVAX and
          Circle USDC are research references only and cannot be deposited here.
        </p>
        <RouteLink className="hero-link" to="/how-it-works">
          Read the field guide ↗
        </RouteLink>
      </details>
    </>
  );
}
export function PoolDetail() {
  const { key } = useParams();
  const { markets, snapshots, errors, ready } = useShield();
  const market = markets.find(
    (m) => m.key.toLowerCase() === key?.toLowerCase(),
  );
  if (!market)
    return (
      <Empty headingLevel={1} title="Market not found">
        Return to <RouteLink to="/markets">markets</RouteLink> or refresh after
        the factory registry loads.
      </Empty>
    );
  const s = snapshots[market.key],
    asset = assets.find((a) => a.key === market.asset)!;
  return (
    <>
      <PageTitle
        eyebrow="MARKET DETAILS"
        title={market.name}
        description={`${asset.symbol} protected with ${market.backingSymbol} collateral. ${market.source}.`}
      />
      <div className="market-grid">
        <MarketCard market={market} headingLevel={2} />
        <article className="action-card">
          <h2>Know the terms</h2>
          {!s && !ready && !market.address && (
            <p className="muted-text">
              Prepared default terms. Verify the deployed pool before signing.
            </p>
          )}
          {!s && (ready || market.address) && (
            <p className="error-note" role="alert">
              Market terms could not be read. Refresh Network status before
              continuing.
            </p>
          )}
          <Facts
            items={[
              [
                "Collateral requirement",
                s
                  ? `${s.terms.collateralBps / 100}%`
                  : ready || market.address
                    ? "Unavailable"
                    : "150% · prepared",
              ],
              [
                "Gain fees: providers / creator / protocol",
                s
                  ? `${s.terms.juniorFeeBps / 100}% / ${s.terms.creatorFeeBps / 100}% / 1%`
                  : ready || market.address
                    ? "Unavailable"
                    : "10% / 1% / 1% · prepared",
              ],
              [
                "Earliest holder exit",
                s
                  ? `${s.terms.exitDelay} seconds after entry`
                  : ready || market.address
                    ? "Unavailable"
                    : "60 seconds after entry · prepared",
              ],
              [
                "Provider notice",
                s
                  ? `${s.terms.juniorNotice} seconds + exposure clearance`
                  : ready || market.address
                    ? "Unavailable"
                    : "120 seconds + exposure clearance · prepared",
              ],
              [
                "Maturity",
                s
                  ? new Date(Number(s.maturity) * 1000).toLocaleString("en-US")
                  : ready || market.address
                    ? "Unavailable"
                    : "Set at deployment",
              ],
              [
                "Remaining backing",
                s ? `${fmt(s.backing)} ${market.backingSymbol}` : "Unavailable",
              ],
              ["Open positions", s?.positions.length ?? "Unavailable"],
            ]}
          />
          {market.address && (
            <a
              className="contract-link"
              href={explorer("address", market.address)}
              target="_blank"
              rel="noreferrer"
            >
              Verify contract {market.address}
            </a>
          )}
          {errors[market.key] && (
            <p className="error-note">{errors[market.key]}</p>
          )}
        </article>
      </div>
      <Risk backing={market.backingSymbol} />
      <Risk provider backing={market.backingSymbol} />
      <div className="button-row">
        <RouteLink
          className="secondary-button"
          to={`/positions?pool=${market.key}`}
        >
          Positions
        </RouteLink>
        <RouteLink
          className="secondary-button"
          to={`/create-pool?pool=${market.key}`}
        >
          Create a fresh market
        </RouteLink>
      </div>
    </>
  );
}
