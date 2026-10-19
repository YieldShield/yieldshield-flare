# Avalanche workflow parity

Comparison date: 11 October 2026. Reference: the working Base, BNB and current Monad applications, including their market, trading, protection, provider and position journeys. Public release identity and screenshots are recorded in [HOSTING.md](HOSTING.md).

## Implemented workflows

| Workflow | Avalanche implementation |
|---|---|
| Discover and inspect markets | `/markets`, `/pools/:key`; five prepared markets, approved asset/backing pairs, factory-created pool discovery and public terms |
| Protect an asset | `/protect`; exact entry claim, collateral, maturity and fee review; wallet and quote guards; separate confirmed position link |
| Provide capital | `/provide`; public provider shares, partial withdrawal, notice and cancellation, separate gain-fee claims and maturity settlement controls |
| Manage positions | `/positions`, `/positions/:key`; partial/full asset or backing exits, transfer of remaining holder rights, segregated maturity claims |
| Buy, sell and convert | `/trade`; funded exchange with 0.3% fee and signed limits/deadlines; AVAX wrapper plus funded protected and backing vault conversions |
| Create a pool | `/create-pool`; bounded fees, collateral and timing; selectable approved asset/oracle/backing; atomic creation and initial provider funding |
| Fund a journey | `/faucet`, `/assets`; test-token claim, official Fuji faucet and explicit token identities; acquisition links preserve role, market and amount |
| Account and history | `/portfolio`, `/activity`; balances, disconnect and browser-local transaction journal with confirmation status and explorer links |
| Understand readiness | `/status`, `/how-it-works`, `/learn/scenarios`, `/legal`; contract status, unknown-read handling, interactive outcomes and chain-specific terms |

The asset set is native Fuji AVAX, the explicitly named Alpine test wrapper `awAVAX`, funded 18-decimal protected vault receipts `vaDEMO`, six-decimal `aDEMO` and six-decimal backing-vault receipts `bvaDEMO`. These are not canonical WAVAX, USDC or BENQI positions.

## Deliberate native differences

- Pools use bounded fixed epochs. At maturity, remaining protected assets are surrendered for the fixed backing claim, including any remaining upside. Holders can choose an asset exit before maturity.
- Provider entry and redemption freeze while holder liabilities remain. Permissionless maturity settlement releases those liabilities. Gain fees remain separate from acquired principal.
- Holder rights can be transferred by contract method. Provider shares are address-bound balances, not transferable junior NFTs.
- Partial exits realize fees on the exited slice and preserve the remaining position's original timing. This differs from whole-position fee crystallization and receipt reissue in other versions.
- Pool creation requires 500 units of the selected backing as an initial provider deposit. This is credited to creator LP shares; it is not a listing fee or refundable factory bond.
- A claim denominated in `bvaDEMO` fixes receipt units, not dollars. Vault redemption value can change. Activity is limited to transactions recorded in this browser, not a complete indexer.
- The demo deliberately caps factory pools and concurrently open positions per pool (100, each with at least a 0.01 backing-unit entry claim). Those bounds are shown in the interface and keep ownership discovery complete: pools publish their open position ids.

## Release boundary

When this comparison was made, Fuji contracts were not yet deployed and public writes were disabled. They were deployed and verified on 12 October 2026, and the website now enables writes against that deployment; see [OPERATIONS.md](OPERATIONS.md) and the [Fuji E2E](E2E_REPORT.md#fuji-e2e-12-october-2026). Local contract/lifecycle evidence is still not evidence of Fuji activity.

Browser acceptance covered the separate protection/provider pages, direct routes, market selection, funding return context, invalid-pool rejection, wallet-unavailable recovery, and desktop/mobile layouts. The later end-to-end pass completed 44 confirmed transactions through the actual browser application with an isolated local wallet, plus 48 separately scripted local-chain transactions. [E2E_REPORT.md](E2E_REPORT.md) records lifecycle, race and recovery coverage. Actual wallet-extension approval screens remain unverified.
