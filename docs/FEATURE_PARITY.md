# Flare feature parity

Compared on 19 October 2026 with the `yieldshield-avalanche` template it derives from ([PROVENANCE](PROVENANCE.md)).

## Workflows

Every template workflow is present with Flare assets:

| Workflow | Flare implementation |
|---|---|
| Discover and inspect markets | `/markets`, `/pools/:key`: five featured markets, factory-created pools, public terms and price sources |
| Protect an asset | `/protect`: C2FLR, WC2FLR or vsDEMO at the FTSOv2 or vault price, with the entry claim, collateral, maturity and fees reviewed before signing |
| Provide capital | `/provide`: provider shares, notice, partial withdrawal, separate gain-fee claims and settlement controls |
| Manage positions | `/positions`, `/positions/:key`: partial or full asset and backing exits, transfer, segregated maturity claims |
| Buy, sell and convert | `/trade`: funded exchange with a 0.3% fee and signed limits; C2FLR ↔ WC2FLR through Flare's WNat; vault conversions |
| Create a pool | `/create-pool`: approved asset, oracle and backing pairs, with an atomic 500-unit creator seed |
| Fund a journey | `/faucet` (sDEMO faucet and Flare's C2FLR faucet), `/assets`: exact token identities |
| Account and history | `/portfolio`, `/activity`: balances and the browser-local transaction journal |
| Understand readiness | `/status` (now with a live FTSOv2 reading judged by the adapter's rules), `/how-it-works`, `/legal` |

## Deliberate differences

- **Price.** FTSOv2 block-latency FLR/USD, resolved through the FlareContractRegistry on every read, with a 300 s maximum age, replaces Chainlink AVAX/USD with 1,200 s. The read fee must be zero.
- **Wrapper.** WC2FLR is Flare's canonical wrapper, not a YieldShield contract.
- **Scale.** FLR trades near 0.0064 USD, so amounts are larger. The minimum entry claim of 0.01 sDEMO is about 1.6 C2FLR, and the app's quick amounts are 2, 5 and 10 C2FLR.

## Not yet on Flare

These are researched and planned as grant milestones ([research](RESEARCH_AND_SCOPE.md)):

- **FAssets FXRP.** It has 6 decimals; the pool accepts only 18-decimal protected assets.
- **testUSDT0 as backing.** It is governance-minted and faucet-only behind reCAPTCHA.
- **sFLR and its FTSO custom feed.** Both exist on Flare mainnet only.
- **FDC attestations and FTSOv2 Scaling (anchor) feeds.**
