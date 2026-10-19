# YieldShield Alpine — research and scope

> Implementation update, 11 October 2026: the initial bounded plan below has since been expanded to include dedicated holder/provider workflows, partial exits, transfers, indexed fee claims, factory creation, a funded exchange, awAVAX and ERC-4626 demo vaults. Current behavior and explicit test-token identities are documented in README.md and OPERATIONS.md. The research notes below are historical planning context. Fuji contracts were deployed on 12 October 2026; there is still no real sAVAX or USDC integration.


Research date: 11 October 2026. No funding, partnership, independent audit, user adoption or mainnet readiness claimed.

## Why Avalanche

The first pilot is a small, independently deployable Fuji C-Chain application: an AVAX exposure position can exit in its remaining AVAX, after gain-sharing fees, or surrender the AVAX for a pre-reserved amount of six-decimal demo backing tokens. Junior capital receives first-loss exposure and 10% of realized positive gains. Creator and protocol receive 1% each. There is no fixed APY, premium or insurance guarantee. Existing YieldShield/Monad split-risk product semantics inform this deliberately smaller implementation; no Monad deployment or credentials are reused.

## Token decisions

| Asset                      | Identity and role                                         | Status                                                                                |
| -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Fuji AVAX                  | Native gas and protected exposure, chain 43113            | Pilot asset, no monetary value                                                        |
| Alpine Demo Dollar (aDEMO) | Newly deployed 6-decimal faucet token                     | Pilot backing; not Circle USDC, not USD redeemable                                    |
| Circle Fuji USDC           | `0x5425890298aed601595a70AB815c96711a31Bc65`              | Exact official test token; separate reference identity, not substituted by demo token |
| Native Avalanche USDC      | `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E`, chain 43114 | Production research only, not activated                                               |
| BENQI sAVAX                | `0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE`, chain 43114 | Future research; requires redemption-rate, liquidity and exit-delay analysis          |

No YieldShield governance token or incentives are needed. Avoid a new token's liquidity and tokenomics dependencies. A future native-USDC pilot needs issuer/blacklist risk assessment and independent security review; sAVAX must never be valued as one AVAX or treated as instantly redeemable. Native AVAX avoids a custom wrapper masquerading as canonical WAVAX in the first pilot.

## Architecture and limits

An immutable fixed-epoch market (featured markets use the 30-day maximum; factory markets choose 1–30 days; maximum 100 open positions, 0.01 backing-unit minimum entry claim) with per-position entry floors, 150% backing admission ratio, 60-second protected exit delay, 120-second junior withdrawal notice, positive-gain fees, and no privileged asset withdrawal. Junior entry and withdrawals are disabled whenever protected exposure remains open. This avoids transferring unrealized option losses between entering/exiting junior holders. At maturity anyone can settle each remaining position: ALL AVAX becomes junior inventory and the owner receives a fixed entry-backing credit, even if AVAX rose. Owners must exit before maturity to retain AVAX upside. Credited but unclaimed backing is segregated from junior capital. This bounds junior locking and avoids requiring owner cooperation. The 120-second notice is not a guaranteed redemption time. The independently verified Fuji AVAX/USD feed is `0x5498BB86BC934c8D34FDA08E81D444153d0D06aD`, heartbeat 600s; the adapter allows at most 1,200s age. A live Chainlink feed adapter checks timestamp, positive answers and round completion. A separately deployed scenario oracle supports deterministic onchain integration testing; synthetic and reference markets must be clearly separated. No bridge, lending leverage, price guarantee, auto trading or AI feature.

Front end: Vite/React static build, direct public RPC reads, injected EIP-1193 wallet, explicit Fuji switching, previews and mined receipt links. No signer or privileged backend. Unavailable deployment or stale price disables dependent writes and is shown truthfully.

## Sources

- Avalanche C-Chain identity: https://build.avax.network/docs/primary-network — Fuji 43113, public RPC `https://api.avax-test.network/ext/bc/C/rpc`.
- Circle identities: https://developers.circle.com/stablecoins/usdc-contract-addresses — testnet tokens have no financial value; mainnet and Fuji addresses above.
- Chainlink official documentation and its linked directory: https://docs.chain.link/data-feeds/price-feeds/addresses and https://reference-data-directory.vercel.app/feeds-avalanche-fuji-testnet.json. Onchain chain ID, feed round and Circle USDC decimals were checked on 11 October 2026.
- BENQI sAVAX identity: https://docs.benqi.fi/resources/contracts/liquid-staking.
- Faucet: https://build.avax.network/console/primary-network/faucet — dedicated new test signer only; no mainnet funds.
