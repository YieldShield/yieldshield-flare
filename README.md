![YieldShield Flare: C2FLR exposure priced by FTSOv2, with explicit first-loss backing.](.github/assets/banner.png)

# YieldShield Flare

Split-risk markets on Flare Testnet Coston2. Holders protect C2FLR or WC2FLR exposure against a fixed backing claim, valued at entry by Flare's enshrined FTSOv2 oracle and reserved at 150% by separately funded capital providers. Every reserve, exit and fee is enforced and visible on-chain.

**Live site:** https://flare.yieldshield.ai (published 19 October 2026; see [HOSTING](docs/HOSTING.md)). **Network:** Flare Testnet Coston2, chain 114. **License:** [MIT](LICENSE).

> Testnet only and unaudited. No asset here has monetary value. sDEMO is not USDT0 or Flare's testUSDT0. FTSOv2 FLR/USD is used as a reference price for C2FLR, which has no value. Do not use this code with real funds.

## Status: 19 October 2026

**Deployed and verified on Coston2.**

- **Deployment.** `coston2-2026-10-19T07-50-55Z-34db01`: 25 transactions from source commit `2fcea40`, blocks 36792295–36792333, 25.11M gas.
- **Verification.** `npm run verify:coston2` passed. It checked:
  - runtime code against the build, with immutables masked;
  - FTSOv2 and WC2FLR wiring;
  - asset identities and terms;
  - open 30-day epochs, vault and creation seeds, and exchange funding;
  - every deployment receipt.

  It was re-run read-only later the same day and passed again.
- **Journey.** A second, fresh test wallet completed a **19-transaction journey on Coston2** ([evidence](docs/evidence/coston2-e2e.json)). The website is published at https://flare.yieldshield.ai.
- **Market dates.** The featured markets accept protection until **18 November 2026, 07:51 UTC**, and must be replaced before then ([OPERATIONS](docs/OPERATIONS.md#monthly-featured-market-replacement)).

**Gas-margin fix.** The first journey attempt ([evidence](docs/evidence/coston2-e2e-attempt1.json)) stopped when its native protection ([`0x2cf5…a9ee`](https://coston2-explorer.flare.network/tx/0x2cf501cc27882a6e60f44e7e424ba66ec120a1ba55a67b7995f1ceb530f2a9ee)) ran out of gas:

- it was sent with an exact gas estimate;
- it used all 341,025 gas;
- the trace ends in `ReentrancySentryOOG` after `Protected` was emitted.

Exact estimates are not safe for transactions that read FTSOv2. The app and the journey script now send 1.3× the estimate (commit `b74576a`). The contracts are unchanged, and the retry with a fresh wallet succeeded.

| Evidence | Where | What it shows |
|---|---|---|
| Coston2 journey | [coston2-e2e.json](docs/evidence/coston2-e2e.json) | Tester `0x9E90…4113`, funded with 15 C2FLR by the deployer, completed 19 confirmed transactions. See the list below |
| First attempt | [coston2-e2e-attempt1.json](docs/evidence/coston2-e2e-attempt1.json) | 4 transactions, then the out-of-gas protection described above |
| Deployment manifest | [config/deployment.json](config/deployment.json) | Every address, transaction, artifact hash and the source commit |
| Live Coston2 plan probe | [coston2-plan-probe.json](docs/evidence/coston2-plan-probe.json) | A read-only `eth_call` simulation of the whole plan against the real FtsoV2 and WC2FLR, made before the broadcast |
| Chain-114 rehearsal | [coston2-rehearsal.json](docs/evidence/coston2-rehearsal.json) | Deploy, verify, a stale feed failing closed, a featured-market replacement and verification again, on a disposable Anvil |
| Local journey and browser | [local-journey.json](docs/evidence/local-journey.json), [browser-receipts.json](docs/evidence/e2e/browser-receipts.json) | 57 local transactions plus 3 expected `STALE_PRICE` reverts; 10 browser-signed local transactions |

The Coston2 journey covered:

1. sDEMO faucet, then 500 sDEMO provided;
2. 5 C2FLR and 3 WC2FLR protected;
3. a partial asset exit, then a backing exit of the remainder;
4. a position transfer and the new owner's backing exit;
5. an exchange buy and a vault deposit;
6. provider notice and redemption;
7. an unwrap.

**Tests:**
- 57 Solidity tests, including four 256-run fuzz tests;
- 14 JavaScript tests;
- 9 browser tests (6 public, 3 local-chain).

**Not done yet:**
- No real wallet-extension transaction. Every run used scripted keys or an injected test provider.
- The website was only checked by script and browser automation; no person has used it with their own wallet yet.
- Contract sources are not yet verified on the Coston2 explorer.

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

**YieldShield on Coston2 (chain 114).** Deployment `coston2-2026-10-19T07-50-55Z-34db01`, verified:

| Contract | Address |
|---|---|
| Factory | [`0xd6488c73f25663f3ba252aab053932cb5fae1f3c`](https://coston2-explorer.flare.network/address/0xd6488c73f25663f3ba252aab053932cb5fae1f3c) |
| Exchange | [`0xc453cd991c48c920e6191219939e0a1bc61a4694`](https://coston2-explorer.flare.network/address/0xc453cd991c48c920e6191219939e0a1bc61a4694) |
| FLR reference market (C2FLR / sDEMO) | [`0xb92Ba82B221Efc73e5CE9936939aD47c7F800cC6`](https://coston2-explorer.flare.network/address/0xb92Ba82B221Efc73e5CE9936939aD47c7F800cC6) |
| Wrapped FLR market (WC2FLR / sDEMO) | [`0x33A133B04743986581Da486557F42135812A3823`](https://coston2-explorer.flare.network/address/0x33A133B04743986581Da486557F42135812A3823) |
| Funded vault market (vsDEMO / sDEMO) | [`0x0AC5a9865D21589BD8ecf7764a08989822993cA6`](https://coston2-explorer.flare.network/address/0x0AC5a9865D21589BD8ecf7764a08989822993cA6) |
| FLR · vault collateral market (C2FLR / bvsDEMO) | [`0x5FfD8fF08604Fb27FFd20Bc988Ce387fe7F1c94f`](https://coston2-explorer.flare.network/address/0x5FfD8fF08604Fb27FFd20Bc988Ce387fe7F1c94f) |
| FLR scenario lab market (C2FLR / sDEMO) | [`0xFacA576fEA1e10Ef2823066ba498220ABd3c8a73`](https://coston2-explorer.flare.network/address/0xFacA576fEA1e10Ef2823066ba498220ABd3c8a73) |
| FTSOv2 reference oracle (`ShieldFtsoV2Oracle`) | [`0xe2e3fde725dc0f6b1646e7d3b0d750e7a7a9690b`](https://coston2-explorer.flare.network/address/0xe2e3fde725dc0f6b1646e7d3b0d750e7a7a9690b) |
| Scenario oracle | [`0x9be0ee303fc95969d3f0ac331dd3ccd6d0b19606`](https://coston2-explorer.flare.network/address/0x9be0ee303fc95969d3f0ac331dd3ccd6d0b19606) |
| sDEMO (demo backing, not USDT0) | [`0x57f808d4f176278ce5e8bbe49db6745aff5b13b0`](https://coston2-explorer.flare.network/address/0x57f808d4f176278ce5e8bbe49db6745aff5b13b0) |
| vsDEMO vault | [`0xedcf7be107a9e4fbe147a1b54aa62744659388b2`](https://coston2-explorer.flare.network/address/0xedcf7be107a9e4fbe147a1b54aa62744659388b2) |
| bvsDEMO backing vault | [`0x6b6da602f1cec85a0973d83ba34a283382e128e6`](https://coston2-explorer.flare.network/address/0x6b6da602f1cec85a0973d83ba34a283382e128e6) |
| Vault oracle | [`0xc86e147efe8ac68e9a0d8f504cc320534eb39b7a`](https://coston2-explorer.flare.network/address/0xc86e147efe8ac68e9a0d8f504cc320534eb39b7a) |
| Deployer (dedicated test signer) | [`0x2b7EEEAEc982E59F18621650FedFf8C3723B5226`](https://coston2-explorer.flare.network/address/0x2b7EEEAEc982E59F18621650FedFf8C3723B5226) |

**Flare system contracts used.** These are canonical and were read on 19 October 2026:

| Contract | Coston2 address |
|---|---|
| FlareContractRegistry | [`0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`](https://coston2-explorer.flare.network/address/0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019) |
| FtsoV2 (resolved by the adapter on every read) | [`0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d`](https://coston2-explorer.flare.network/address/0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d) |
| WC2FLR (WNat) | [`0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273`](https://coston2-explorer.flare.network/address/0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273) |
| FLR/USD feed ID | `0x01464c522f55534400000000000000000000000000` |

Every transaction hash and the artifact hashes are in [config/deployment.json](config/deployment.json).

## Run and verify

Requirements: Node.js 22+ and [Foundry](https://getfoundry.sh).

```sh
npm ci --ignore-scripts
npm run dev                 # 127.0.0.1:5191, reading the live Coston2 deployment
npm run build               # static output: dist/
npm test                    # JavaScript arithmetic, lifecycle and FTSOv2 normalization tests
npm run test:contracts      # Solidity tests, including fuzz cases
npm run test:browser        # public routes, mobile, wallet and context regressions
npm run probe:coston2       # read-only simulation of the whole plan against live Coston2
npm run verify:coston2      # read back the deployment: runtime code, wiring, terms and receipts
npm run deploy:coston2      # read-only preflight (or --replace-featured preflight); --broadcast needs the test signer
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
