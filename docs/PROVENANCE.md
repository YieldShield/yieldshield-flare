# Provenance

YieldShield Flare is derived from the MIT `yieldshield-avalanche` template ("YieldShield Alpine", `YieldShield/yieldshield-avalanche`) at commit `dfb39a8d4a097f94efe3eb21e3bbc1a6b96f0dc0`. Both repositories have the same owner, Hawig Ventures UG (haftungsbeschränkt), which develops YieldShield.

The import was `git archive HEAD` of that commit, so only tracked files were copied. No keys, signed intents, deployment registries, `.env` files, Vercel metadata, local state, build output or test results came from the template or any other YieldShield project. The template's Fuji manifest, Fuji evidence and Avalanche screenshots were replaced or removed. They remain only in this repository's first commit and in the template's own history.

## What changed from the template

| Area | Change | Why |
|---|---|---|
| Contract names | `Alpine*` → `Shield*` | Branding |
| Chain guards | 43113 → 114 (Coston2); 31337 kept for local runs | Chain difference |
| Price source | Chainlink adapter replaced by `ShieldFtsoV2Oracle`: registry-resolved FtsoV2, zero read fee, freshness, zero-value and decimal checks | Chain difference: FTSOv2 is Flare's enshrined oracle |
| Wrapped asset | The template's own test wrapper removed. The factory uses Coston2's canonical WC2FLR (`WNat`) | Real Coston2 asset exists |
| Demo assets | aDEMO/vaDEMO/bvaDEMO → sDEMO/vsDEMO/bvsDEMO, with "not USDT0, no value" in the on-chain names | Labeling |
| Scenario oracle | 25 → 35 → 15 rescaled to 0.0060 → 0.0084 → 0.0036 | FLR's price level |
| Pool | `exitAvax` renamed `exitAsset` | Naming |
| Exchange inventory | 0.01 AVAX/awAVAX → 10 C2FLR/WC2FLR | FLR's price level |
| Scripts | Fuji deploy/verify ported to Coston2 with FTSOv2 and WNat checks. Added: a chain-114 rehearsal, a live Coston2 plan probe and a public-journey script | Chain difference and evidence |
| App | Coston2 chain config, catalog, branding and images; a live FTSOv2 status card; Flare faucet; ports 5191/5194/4191/8557 | Chain difference |

The pool's economic logic is unchanged:

- terms and bounds;
- fee split (10% providers, 1% creator, 1% protocol on realized gains);
- 150% default backing;
- epochs, freezes, settlement and reward accounting;
- factory limits.

The template's other 40 Solidity tests pass against it. Its Chainlink adapter test was removed. The only other changes are the renames, `MockWNat` standing in for the removed wrapper, and Flare mainnet's chain ID (14) in the mainnet-rejection test.

## Licenses and assistance

The code is MIT-licensed, copyright Hawig Ventures UG (haftungsbeschränkt). OpenZeppelin, React, React Router, viem, Vite and Playwright keep their upstream licenses. The Flare interfaces used by the adapter are minimal subsets written here, matching Flare's MIT-licensed `@flarenetwork/flare-periphery-contracts` 0.1.53 signatures. No Flare code is copied.

The repository was developed with substantial AI assistance. AI agents are development tools, not team members. The founders review the work and validate claims, and will arrange an independent review before any real-asset launch.
