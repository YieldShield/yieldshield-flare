import { useState } from "react";
import { PageTitle, RouteLink, Facts, Risk } from "./ui";
export function Guide() {
  const [move, setMove] = useState(20);
  const entry = 250,
    spot = entry * (1 + move / 100),
    gain = Math.max(spot - entry, 0),
    fee = gain * 0.12;
  return (
    <>
      <PageTitle
        eyebrow="THE FIELD GUIDE"
        title="Two roles. One explicit tradeoff."
        description="A holder gives providers some positive-gain fees in exchange for an entry claim. Providers supply the backing and carry the downside."
      />
      <div className="asset-cards">
        <article>
          <div className="eyebrow">01 / HOLDER</div>
          <h2>Choose your exit.</h2>
          <p>
            Deposit an asset at the market price. After the exit delay, withdraw
            part or all of the asset and pay gain fees, or surrender that slice
            for its proportional backing claim. Ownership can be transferred
            with its original basis and maturity.
          </p>
          <RouteLink to="/protect">Open protection ↗</RouteLink>
        </article>
        <article>
          <div className="eyebrow">02 / CAPITAL PROVIDER</div>
          <h2>Back the downside.</h2>
          <p>
            Deposit aDEMO or backing-vault receipts into a market. Positive
            asset exits create independently claimable fees. Backing exits
            consume your collateral and leave you the surrendered asset.
            Redemption returns a basket of backing and asset inventory.
          </p>
          <RouteLink to="/provide">Provide capital ↗</RouteLink>
        </article>
      </div>
      <section className="scenario-section" id="scenarios">
        <div>
          <div className="eyebrow">ILLUSTRATION / NOT A LIVE QUOTE</div>
          <h2>Walk through the outcome.</h2>
          <p>
            Example: 10 asset units, entry price 25 aDEMO, default 10% provider
            + 1% creator + 1% protocol fee on gains. This slider does not move
            an oracle or send a transaction.
          </p>
          <label htmlFor="movement">
            Price move{" "}
            <strong>
              {move > 0 ? "+" : ""}
              {move}%
            </strong>
          </label>
          <input
            id="movement"
            type="range"
            min="-80"
            max="100"
            value={move}
            onChange={(e) => setMove(Number(e.target.value))}
          />
          <div className="range-labels">
            <span>−80%</span>
            <span>+100%</span>
          </div>
        </div>
        <div className="scenario-results">
          <Facts
            items={[
              ["Asset value at selected price", `${spot.toFixed(2)} aDEMO`],
              [
                "Asset exit value after gain fees",
                `${(spot - fee).toFixed(2)} aDEMO`,
              ],
              ["Backing exit claim", "250.00 aDEMO"],
              [
                "Providers’ gain fee",
                `${(gain * 0.1).toFixed(2)} aDEMO equivalent`,
              ],
              [
                "Providers’ surrendered-asset loss on backing exit",
                `${Math.max(entry - spot, 0).toFixed(2)} aDEMO equivalent`,
              ],
            ]}
          />
          <p>
            No APY is implied. Provider returns depend on realized fees and
            losses.
          </p>
        </div>
      </section>
      <Risk />
      <Risk provider />
      <div className="field-note">
        <h2>Why an epoch?</h2>
        <p>
          Provider entries and redemptions pause while any position is open.
          This prevents someone redeeming an overstated share value before
          holders exercise underwater claims. At the fixed maturity, anyone can
          settle each remaining position without its owner. Backing credit is
          reserved separately until the owner claims it.
        </p>
        <h2>What happens on a partial exit?</h2>
        <p>
          The withdrawn slice gets its proportional entry claim; rounding
          preserves the remainder. Gain fees apply only to the withdrawn slice.
          Remaining protection keeps its original opening time and maturity.
        </p>
        <h2>What is a vault-backed floor?</h2>
        <p>
          A bvaDEMO-backed position promises a number of vault receipts. The
          underlying aDEMO those receipts redeem for can change. There is no
          fixed dollar guarantee, and bvaDEMO is not a stablecoin.
        </p>
      </div>
    </>
  );
}
export function Legal() {
  return (
    <>
      <PageTitle
        eyebrow="TERMS & RISKS"
        title="An experiment with clear limits."
        description="Alpine is an unaudited, valueless testnet prototype. It is not insurance, a guaranteed return or a production investment product."
      />
      <div className="field-note">
        <h2>Use test assets only</h2>
        <p>
          All contracts are gated to Fuji or local test chains. aDEMO, awAVAX,
          vaDEMO and bvaDEMO are Alpine test assets. Nothing here represents
          Circle USDC, BENQI sAVAX, canonical WAVAX or redeemable dollars.
        </p>
        <h2>Economic and technical risks</h2>
        <p>
          Providers may lose their backing. Holder protection is limited to a
          fixed token-unit claim and depends on contract correctness. Oracle
          prices may be unavailable or stale; an asset exit can fail while a
          backing claim remains possible. Smart-contract errors, wallet errors
          and network interruptions are possible. At maturity, forced settlement
          forfeits remaining asset upside.
        </p>
        <h2>Browser data</h2>
        <p>
          The app stores transaction hashes, account addresses and labels
          locally in your browser for its Activity journal. It does not store
          private keys or recovery phrases. The RPC provider and your wallet
          receive requests needed to read and transact.
        </p>
        <h2>Production readiness</h2>
        <p>
          Source tests and local demonstrations do not replace an independent
          security audit, live contract verification or production integration
          review. Review contract addresses and network status before signing.
        </p>
      </div>
    </>
  );
}
