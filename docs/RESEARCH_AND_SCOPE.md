# YieldShield Flare — research and scope

Checked on **19 October 2026** against Flare's official documentation and direct reads from the public Coston2 RPC. Every address below was read on-chain that day (commands at the end). Nothing here claims funding, a partnership with Flare or any asset issuer, an independent audit, user adoption or mainnet readiness.

## Network: Flare Testnet Coston2

| Item | Value | How it was checked |
|---|---|---|
| Chain ID | `114` | Docs; `eth_chainId` returned 114 |
| Gas token | C2FLR, 18 decimals, no monetary value | Docs; viem `flareTestnet` |
| Public RPC | `https://coston2-api.flare.network/ext/C/rpc` (WSS `wss://coston2-api.flare.network/ext/C/ws`) | Docs; used for every read below |
| Explorer | `https://coston2-explorer.flare.network` (Blockscout, `/address/<a>` and `/tx/<h>`) | Docs; explorer API answered |
| Systems explorer | `https://coston2-systems-explorer.flare.network` | Docs |
| Faucet | `https://faucet.flare.network/coston2`: 100 C2FLR, 10 USDT0 and 10 FXRP per address per 24 hours | Faucet page text |
| Faucet protection | **Google reCAPTCHA** (site key embedded in the page, badge shown) | Page source and screenshot. A bot check, so funding is an owner-only step |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11`; runtime code hash equals the canonical Multicall3 on Fuji | `eth_getCode` on both chains |
| EVM | Docs say opcodes up to and including Cancun are supported | Docs; contracts compile with `evm_version = cancun` |
| Block time | about 1.8 s | Docs |
| Fees observed | base fee 500 gwei on five consecutive blocks; `eth_maxPriorityFeePerGas` 150 gwei; `eth_gasPrice` 650 gwei | `eth_feeHistory` |

The template's deployment plan used about 25M gas; it is remeasured on a chain-114 rehearsal (see OPERATIONS). At those fees that costs roughly 16–25 C2FLR including headroom. One 100 C2FLR faucet claim covers the deployment, the native inventory it sends, and a funded journey wallet.

## FTSOv2 on Coston2

| Item | Value |
|---|---|
| FlareContractRegistry | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` (the same constant on every Flare network, per `ContractRegistry.sol` in `@flarenetwork/flare-periphery-contracts` 0.1.53) |
| `FtsoV2` (resolved via `getContractAddressByName("FtsoV2")`) | `0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d` |
| `FeeCalculator` | `0x88A9315f96c9b5518BBeC58dC6a914e13fAb13e2` |
| `FastUpdater` | `0x0B162CA3acf3482d3357972e12d794434085D839` |
| `Relay` / `FdcHub` / `FdcVerification` | `0x5017728F117501A24EF9C3756C07f0d564598596` / `0x48aC463d7975828989331F4De43341627b9c5f1D` / `0x906507E0B64bcD494Db73bd0459d1C667e14B933` |
| FTSO protocol id | 100 |
| Supported block-latency feeds | 62 ids returned by `getSupportedFeedIds()` |

**Reading a feed from a contract.**

- The registry exposes `getContractAddressByName(string)` and `getContractAddressByHash(bytes32)`, both `view`. Flare recommends resolving `FtsoV2` through the registry rather than hard-coding it.
- `FtsoV2Interface.getFeedById(bytes21)` returns `(uint256 value, int8 decimals, uint64 timestamp)`. `getFeedsById(bytes21[])` and `getFeedByIdInWei(bytes21)` (18 decimals) also exist.
- In the production interface these reads are declared **`payable`**: a fee from the `FeeCalculator` "may need to be paid".
- `TestFtsoV2Interface` declares the same functions **`view`**. The periphery library's `getTestFtsoV2()` resolves the **same `FtsoV2` address** as `getFtsoV2()` and only types it as a view interface, so a call through it is a zero-value `STATICCALL`. Flare's docs call this interface testing-only.
- `calculateFeeById(FLR/USD)` and `calculateFeeById(XRP/USD)` both returned **0** today, and the docs describe block-latency feeds as free to query.
- Feed decimals must not be hard-coded: the docs warn they can change. The value is `value / 10^decimals`.
- The timestamp is the time of the last update. Over six samples taken four seconds apart, the FLR/USD timestamp **equalled the latest block's timestamp** every time.

**Observed values (19 Oct 2026, about 07:00 UTC):**

| Feed | Feed ID | Value | Decimals | Docs risk rating |
|---|---|---|---:|---|
| FLR/USD | `0x01464c522f55534400000000000000000000000000` | 639928 → 0.00639928 | 8 | 🟢 |
| XRP/USD | `0x015852502f55534400000000000000000000000000` | 1313551 → 1.313551 | 6 | 🟢 |
| sFLR/USD (custom feed, Sceptre) | `0x2173464c522f555344000000000000000000000000` | Coston2 FtsoV2 reverts "custom feed id not supported"; available on Flare mainnet only | — | Custom feeds carry their own contract risk |

**Adapter consequence.** YieldShield's pool reads `price()` as a `view`. The new `ShieldFtsoV2Oracle` therefore calls `getFeedById` through a view-typed interface, as `getTestFtsoV2()` does. This works while the read fee is zero. To make that explicit rather than implicit, the adapter also requires `calculateFeeById(feedId) == 0`. If Flare ever introduces a fee, reference prices **fail closed**: protection and asset exits revert, and backing exits, which never read the oracle, keep working. A fee-paying, state-changing price path would change the core market interface, so it is listed as mainnet hardening, not built here.

The adapter also:
- resolves `FtsoV2` through the registry on every read;
- rejects a zero value, a zero result after normalization, a timestamp of zero, a future timestamp, decimals outside −18…18 and an age above `maxAge`;
- normalizes any decimal count, including negative ones, to the 6-decimal backing units the pool uses.

The feed's value type is unsigned, so a negative value cannot occur.

`maxAge` is **300 s**. Block-latency feeds update every block (about 1.8 s), so this is roughly 160 missed blocks.

## Candidate assets on Coston2

| Asset | Coston2 address | Decimals | Finding | Decision for this build |
|---|---|---:|---|---|
| C2FLR (native) | — | 18 | Gas token, faucet-distributed | **Protected asset**, priced by FTSOv2 FLR/USD as a reference price |
| WC2FLR ("Wrapped Coston2Flare", WNat) | `0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273` | 18 | Registry `WNat`; verified `WNat` source with `deposit`/`withdraw`; also FAssets pool collateral | **Protected asset (canonical, not a YieldShield wrapper)**, priced by FLR/USD |
| FTestXRP (FAssets FXRP) | `0x0b6A3645c240605887a5532109323A3E12273dc7` (`AssetManagerFXRP` `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA`, controller `0x1C772F700308aF4c13897cc7b9c41EFfB82c50C0`) | **6** | EIP-1967 `FAssetProxy`; faucet gives 10 per day; matches docs | **Not in this build.** The template pool only accepts 18-decimal protected assets. Supporting 6-decimal FXRP changes core accounting and is the first funded milestone |
| Test USDT0 (`testUSDT0`) | `0x21709E63fC7F264F329e0826Ea82197694B82775` | 6 | FAssets vault collateral; `FakeERC20` whose `mintAmount` is `onlyGovernance`; 174 holders; faucet gives 10 per day behind reCAPTCHA | **Official test stablecoin exists, but is not the backing here.** Seeding five markets, two vaults and the exchange needs about 5,500 units, and the only source is a CAPTCHA faucet at 10 per day. It becomes an approved backing option in a funded milestone |
| sFLR (Sceptre) | none on Coston2 (mainnet `0x12e605bc104e93B45e1aD99F9e555f659051c2BB`) | 18 | No code at the mainnet address on Coston2; custom feed mainnet-only | Mainnet research only |
| stXRP (Firelight) | mainnet custom feed only | — | Docs list a mainnet custom feed | Out of scope |

**Flare mainnet references** (read-only, for later milestones): WFLR `0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d`, FXRP `0xAd552A648C74D49E10027AB8a618A3ad4901c5bE` (6 decimals, via mainnet `AssetManagerFXRP`), mainnet `FtsoV2` `0x7BDE3Df0624114eDB3A67dFe6753e62f4e7c1d20`, sFLR/USD custom feed (returned 1.21 USD-scaled value with 8 decimals today). `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` reports symbol `USD₮0` with 6 decimals on mainnet, but **no official Flare or Tether listing confirming it was found**, so confirm it before any mainnet work.

## Scope chosen

**Five featured markets.** Each is opened by the factory with the template's terms: 150% backing, 10% provider, 1% creator and 1% protocol share of realized gains, a 30-day epoch, a 60 s exit delay and 120 s provider notice.

| Market | Protected asset | Price source | Backing |
|---|---|---|---|
| FLR reference | Native C2FLR | **Live FTSOv2 FLR/USD** via `ShieldFtsoV2Oracle` | sDEMO |
| Wrapped FLR | **Canonical WC2FLR** | Live FTSOv2 FLR/USD | sDEMO |
| Funded vault | vsDEMO vault receipts | Vault redemption value | sDEMO |
| FLR · vault collateral | Native C2FLR | FTSOv2 FLR/USD expressed in bvsDEMO receipts | bvsDEMO |
| FLR scenario lab | Native C2FLR | **Deterministic scenario oracle**: 0.0060 → 0.0084 → 0.0036 sDEMO, rotating every 120 s | sDEMO |

**Demo assets.** They are named so they cannot be mistaken for real ones:

- **sDEMO**, "Shield Demo Dollar": 6 decimals, 10,000 per address per hour from its own faucet. **Not USDT0, not testUSDT0, no value.**
- **vsDEMO**, "Shield Demo Vault Receipts": an 18-decimal ERC-4626 vault over sDEMO.
- **bvsDEMO**, "Shield Backing Vault": a 6-decimal ERC-4626 vault over sDEMO, used as selectable backing.

The prices are reference prices only. C2FLR has no value. Borrowing the FLR/USD feed exercises the real FTSOv2 integration path; it does not make test assets valuable.

**Chain differences that force changes.**

1. Every testnet guard now accepts chain 114 (Coston2) or 31337 (local Anvil) instead of 43113.
2. The template's own wrapper contract is not deployed: WC2FLR already exists and has the same `deposit`/`withdraw` interface.
3. The Chainlink adapter is replaced by `ShieldFtsoV2Oracle`.
4. Scenario prices are rescaled to FLR's price level.

The pool's economic logic, limits and fees are unchanged.

**Out of scope for this build:**
- FXRP and other 6-decimal protected assets;
- testUSDT0 backing;
- sFLR;
- FDC attestations;
- FTSOv2 Scaling (anchor) feeds verified by Merkle proof;
- fee-paying oracle reads;
- Songbird;
- any mainnet deployment.

These are candidates for the grant milestones in `docs/grants/`.

## Flare Grants Program (re-verified 19 October 2026)

Page: https://flare.network/resources/grants. The application form is an Airtable form: https://airtable.com/appyfl68ek3SOoCLh/shrqTkjFHruvr3dMk. Both were read, and nothing was entered or submitted. The form's cookie banner was left untouched.

**Earlier research vs. today:**

| Earlier research | Today |
|---|---|
| Rolling | **Confirmed in practice.** No deadline or cohort dates appear on the page or the form |
| Token grants, size not published | **Confirmed.** "Token Grants", with no amount, range or token named. The form has **no amount field**; costs go in Milestones |
| Google Cloud credits up to $200k ($350k for AI) | **Confirmed**, offered "as Google's blockchain partner" |
| Form asks legal entity, domicile, 4–5 costed milestones "to deploy onto Flare", 1-year commitment | **Confirmed.** "Legal Entity & Domicile"; Milestones asks for 4–5 milestones "including costs and timelines, to deploy onto Flare and/or Songbird"; the 1-year commitment is a **checkbox, not marked required** |
| Selection favors FTSO/FDC | **Confirmed.** One of five criteria is integration of the "enshrined data oracles": FTSO for time series, FDC for data from other chains and the internet |
| KYC unverified | **Still unverified.** Neither page mentions KYC/KYB. The process includes a signed grant agreement (step 4), so ask during screening |

**Other page content.**

- Support offered: partnership introductions, co-marketing, technical assistance and advisory help.
- "What to include": a company pitch deck, and "Why Flare" with how the team will use the enshrined oracles.
- Initial submission should show methodology, a tech-architecture map, a roadmap with measurable goals, budget and impact. A video walkthrough is welcome.
- The process runs: initial submission → screening (shortlisted teams get an intro call) → milestone definition with committee feedback → contract → milestone check-ins with funds paid per milestone → completion.
- Selection criteria: uniqueness; benefit to the Flare ecosystem; ability to execute, including go-to-market and roadmap; FTSO/FDC integration; previous blockchain and go-to-market experience.

**Form fields, in order.** No character limits are shown and no `maxlength` attributes exist. Airtable long-text fields allow up to 100,000 characters.

1. Project Name * (single line)
2. Contact First Name * (single line)
3. Contact Last Name * (single line)
4. Email * (email)
5. Links: plain multi-line text, "website, pitch deck, product demo, GitHub and Linkedin profile"
6. Project Description * (rich text)
7. Legal Entity & Domicile (single line)
8. Unique Traits (rich text)
9. Flare Ecosystem Value Add (rich text)
10. Growth Strategy (rich text)
11. Flare Native Protocol Integrations (rich text)
12. Milestones (rich text)
13. Other Integrations (rich text)
14. Other Partnerships (rich text)
15. How did you find the Flare grants program? * (single line)
16. Other Requirements (rich text)
17. Can you commit to developing and supporting this project on Flare for at least 1 year (checkbox)

## Sources

- Network configuration: https://dev.flare.network/network/overview
- FTSOv2 getting started and test-interface warning: https://dev.flare.network/ftso/getting-started
- Block-latency and custom feed lists, decimals warning: https://dev.flare.network/ftso/feeds
- Feed risk ratings: https://dev.flare.network/ftso/feed-stability-and-risks
- Scaling (anchor feeds, 90 s): https://dev.flare.network/ftso/scaling/overview
- Interfaces: `@flarenetwork/flare-periphery-contracts` 0.1.53, `coston2/FtsoV2Interface.sol`, `coston2/TestFtsoV2Interface.sol`, `coston2/ContractRegistry.sol` (read via unpkg)
- FAssets reference: https://dev.flare.network/fassets/reference
- Faucet: https://faucet.flare.network/coston2
- Coston2 explorer API: verified `WNat`, `FakeERC20` (testUSDT0) and `FAssetProxy` (FXRP) sources
- Grants: https://flare.network/resources/grants and the Airtable form linked from it

On-chain reads (all `cast`, public RPC):

```sh
RPC=https://coston2-api.flare.network/ext/C/rpc
REG=0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019
cast chain-id --rpc-url $RPC
cast call $REG "getContractAddressByName(string)(address)" FtsoV2 --rpc-url $RPC
cast call $REG "getContractAddressByName(string)(address)" WNat --rpc-url $RPC
FTSO=$(cast call $REG "getContractAddressByName(string)(address)" FtsoV2 --rpc-url $RPC)
cast call $FTSO "getFeedById(bytes21)(uint256,int8,uint64)" 0x01464c522f55534400000000000000000000000000 --rpc-url $RPC
cast call $FTSO "calculateFeeById(bytes21)(uint256)" 0x01464c522f55534400000000000000000000000000 --rpc-url $RPC
cast call 0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA "fAsset()(address)" --rpc-url $RPC
cast rpc eth_feeHistory 5 latest '[50]' --rpc-url $RPC
```
