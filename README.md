![YieldShield Flare: C2FLR exposure priced by FTSOv2, with explicit first-loss backing.](.github/assets/banner.png)

# YieldShield Flare

Split-risk markets on Flare Testnet Coston2. Holders protect C2FLR or WC2FLR exposure against a fixed backing claim, valued at entry by Flare's enshrined FTSOv2 oracle and reserved at 150% by separately funded capital providers. Every reserve, exit and fee is enforced and visible on-chain.

**Planned site:** https://flare.yieldshield.ai (not yet published; see [HOSTING](docs/HOSTING.md)). **License:** [MIT](LICENSE).

> Testnet only and unaudited. No asset here has monetary value. sDEMO is not USDT0 or Flare's testUSDT0. FTSOv2 FLR/USD is used as a reference price for C2FLR, which has no value. Do not use this code with real funds.

## Status: 19 October 2026

**The code is ready for Coston2, but nothing is deployed there yet. The deployment is waiting for testnet gas.**

- **Deployer.** The dedicated test signer is `0x2b7EEEAEc982E59F18621650FedFf8C3723B5226`. It holds no C2FLR.
- **Funding.** Flare's only official faucet, https://faucet.flare.network/coston2, is protected by Google reCAPTCHA, so funding is an owner step. One claim of 100 C2FLR covers the 43.985 C2FLR the [preflight](docs/evidence/coston2-preflight.json) requires.
- **Preflight.** It already passes every other check against live Coston2: the canonical registry, WNat = WC2FLR, FtsoV2 resolution, a zero read fee and a fresh FLR/USD feed.

| Evidence | Where | What it shows |
|---|---|---|
| Live Coston2 plan probe | [coston2-plan-probe.json](docs/evidence/coston2-plan-probe.json) | A read-only `eth_call` with a state override deploys every contract on Coston2's EVM. Against the **real** FtsoV2 and WC2FLR, it creates all five markets and opens native and WC2FLR protection at FLR/USD 0.00641. Nothing was broadcast. |
| Chain-114 rehearsal | [coston2-rehearsal.json](docs/evidence/coston2-rehearsal.json) | On a disposable Anvil with Coston2's chain ID and Flare stand-ins at the canonical addresses: `deploy-coston2` (25 transactions, 24.26M gas), `verify-coston2`, a stale feed failing closed, a 7-transaction featured-market replacement, and verification again. |
| Rehearsed public journey | [coston2-rehearsal-journey.json](docs/evidence/coston2-rehearsal-journey.json) | `coston2-journey.mjs` from a second fresh wallet: 19 confirmed transactions on the rehearsal chain. |
| Local journey | [local-journey.json](docs/evidence/local-journey.json) | 57 transactions and 3 expected `STALE_PRICE` reverts on chain 31337, using the real FTSOv2 adapter with a mock FtsoV2. |
| Local browser journey | [browser-receipts.json](docs/evidence/e2e/browser-receipts.json) | 10 browser-signed transactions through the real app (Playwright with an injected test provider). |

**Tests:**
- 57 Solidity tests, including four 256-run fuzz tests;
- 14 JavaScript tests;
- 9 browser tests (6 public, 3 local-chain).

Test activity is not traction. There are no users, no revenue and no TVL. The code was written with substantial AI assistance and has had no independent audit.

## What is built

**Assets.** There are three protected assets and two backing choices.

| Token | Role | Decimals | What it is |
|---|---|---:|---|
| C2FLR | Native protected asset, exchange asset, gas | 18 | Coston2's native test asset. No value |
| WC2FLR | Wrapped protected asset | 18 | **Flare's canonical** Wrapped Coston2Flare (`WNat`, `0xC67D…9273`), 1:1 C2FLR. Not a YieldShield contract |
| vsDEMO | Protected vault receipts | 18 | ERC-4626 claims on sDEMO actually held by its vault |
| sDEMO | Backing and exchange settlement | 6 | YieldShield faucet token, 10,000 per address per hour. **Not USDT0, no value** |
| bvsDEMO | Selectable backing | 6 | Separate funded ERC-4626 sDEMO vault |

**Markets.** There are five featured markets, all with 30-day epochs:

| Market | Asset | Price source |
|---|---|---|
| FLR reference | C2FLR | FTSOv2 FLR/USD |
| Wrapped FLR | WC2FLR | FTSOv2 FLR/USD |
| Funded vault | vsDEMO | Vault redemption value |
| FLR · vault collateral | C2FLR | FTSOv2 FLR/USD, backed by bvsDEMO |
| FLR scenario lab | C2FLR | Deterministic scenario, 0.0060 → 0.0084 → 0.0036 sDEMO |

**FTSOv2 adapter** ([`ShieldFtsoV2Oracle`](contracts/src/ShieldFtsoV2Oracle.sol)):

- It resolves `FtsoV2` through the `FlareContractRegistry` on every read, as Flare recommends.
- It reads `getFeedById` as a zero-value static call, which is what Flare's `getTestFtsoV2()` does, and requires `calculateFeeById` to be zero.
- It rejects a zero value, zero or future timestamps, an age above 300 s, and decimals outside −18…18.
- It normalizes any decimal count to 6-decimal backing units.

When the feed fails, protection, asset exits and trades revert. Backing exits never read a price, so they keep working.

**Workflows.** The app has:

- direct routes for markets, protection, provider capital, positions, trading, market creation, portfolio, activity, faucet, assets, status, the guide and legal terms;
- a status page that reads FLR/USD live through the registry and judges each reading with the adapter's own rules, even before any deployment.

## Economics

These are identical to the MIT [`yieldshield-avalanche`](docs/PROVENANCE.md) template:

- A holder's entry claim is the asset's FTSOv2 value at entry.
- After a 60 s delay the holder chooses between two exits:
  - **asset exit:** keep the asset minus 12% of realized gains (10% to providers, 1% to the creator, 1% to the protocol);
  - **backing exit:** surrender the asset for the fixed claim.
- Providers earn those fees and the surrendered assets, and bear the loss.
- Provider entry and redemption freeze while any position is open.
- Anyone can settle a position after maturity. Settlement surrenders the remaining asset and its upside for the fixed claim.

There is no promised yield. A bvsDEMO-backed claim is a fixed number of receipts, not a fixed dollar amount.

## Addresses

The Flare system contracts used here are canonical. They were read on 19 October 2026:

| Contract | Coston2 address |
|---|---|
| FlareContractRegistry | [`0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`](https://coston2-explorer.flare.network/address/0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019) |
| FtsoV2 (resolved by the adapter on every read) | [`0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d`](https://coston2-explorer.flare.network/address/0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d) |
| WC2FLR (WNat) | [`0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273`](https://coston2-explorer.flare.network/address/0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273) |
| FLR/USD feed ID | `0x01464c522f55534400000000000000000000000000` |

YieldShield's own contracts get their addresses when the deployment is broadcast. [config/deployment.json](config/deployment.json) will then record every address, transaction and the source commit.

## Run and verify

Requirements: Node.js 22+ and [Foundry](https://getfoundry.sh).

```sh
npm ci --ignore-scripts
npm run dev                 # 127.0.0.1:5191, reading live Coston2 (writes stay disabled until deployed)
npm run build               # static output: dist/
npm test                    # JavaScript arithmetic, lifecycle and FTSOv2 normalization tests
npm run test:contracts      # Solidity tests, including fuzz cases
npm run test:browser        # public routes, mobile, wallet and context regressions
npm run probe:coston2       # read-only simulation of the whole plan against live Coston2
npm run deploy:coston2      # read-only preflight; --broadcast needs the funded test signer
```

Rehearsal on a disposable chain-114 Anvil, where nothing reaches Coston2:

```sh
anvil --host 127.0.0.1 --port 8557 --chain-id 114 --silent
npm run rehearse:coston2
npm run journey:coston2 -- --local
```

Local journey and browser tests on chain 31337:

```sh
anvil --host 127.0.0.1 --port 8557 --silent
node scripts/local-journey.mjs --browser-ready
node scripts/local-web.mjs   # local-chain app at 127.0.0.1:5194
SHIELD_LOCAL_E2E=1 npm run test:browser -- tests/browser/local-lifecycle.spec.ts
node scripts/capture-local-e2e.mjs
```

Browser tests use Anvil's publicly known development accounts through an injected test provider. No private keys are embedded in the app or committed, and production builds cannot enable the local-chain configuration.

Deploying needs a dedicated Coston2 test signer in the ignored `.secrets/` directory; see [OPERATIONS](docs/OPERATIONS.md). Never use a key that holds real funds.

Further reading:
- [operations](docs/OPERATIONS.md);
- [security](docs/SECURITY.md);
- [end-to-end evidence](docs/E2E_REPORT.md);
- [research and scope](docs/RESEARCH_AND_SCOPE.md);
- [feature parity](docs/FEATURE_PARITY.md);
- [hosting](docs/HOSTING.md);
- [provenance](docs/PROVENANCE.md).

## Contributing and security

Please run `npm test`, `npm run test:contracts` and `npm run build` before proposing changes. Report suspected vulnerabilities privately as described in [SECURITY](docs/SECURITY.md), not in public issues.

## License

[MIT](LICENSE), copyright Hawig Ventures UG (haftungsbeschränkt), which develops YieldShield. Derived from the company's own MIT `yieldshield-avalanche` template ([PROVENANCE](docs/PROVENANCE.md)). OpenZeppelin, React, React Router, viem and Vite keep their upstream licenses. No keys or deployment registries were copied from other YieldShield projects.
