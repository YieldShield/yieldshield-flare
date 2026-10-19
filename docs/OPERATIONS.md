# Operations

## Coston2 deployment: deployed and verified (19 October 2026)

**Deployment.** `coston2-2026-10-19T07-50-55Z-34db01` is `deployed-and-verified`:

- 25 transactions from source commit `2fcea40`;
- blocks 36792295–36792333;
- 25,107,922 gas used;
- no reverted steps.

Factory [`0xd6488c73f25663f3ba252aab053932cb5fae1f3c`](https://coston2-explorer.flare.network/address/0xd6488c73f25663f3ba252aab053932cb5fae1f3c), exchange [`0xc453cd991c48c920e6191219939e0a1bc61a4694`](https://coston2-explorer.flare.network/address/0xc453cd991c48c920e6191219939e0a1bc61a4694). Every other address is in the [README](../README.md#addresses) and [config/deployment.json](../config/deployment.json).

**Next action: replace the featured markets.** They accept protection until **18 November 2026, 07:51 UTC**. Run the replacement round from 11 November (see [Monthly featured-market replacement](#monthly-featured-market-replacement)) and put it in the calendar.

**Signer.** The dedicated Coston2-only test signer is `0x2b7EEEAEc982E59F18621650FedFf8C3723B5226`:

- created with `cast wallet new`;
- private key only in the ignored `.secrets/coston2-test-signer.json` (mode 600), never in source, browser code, logs or commits;
- funded once by the owner from Flare's faucet, https://faucet.flare.network/coston2, which needs a reCAPTCHA.

After deploying, funding the journey tester and the journey's transfer exit, it held about 33.6 C2FLR. That covers about two replacement rounds at today's fees (14.45M gas each, about 14 C2FLR with headroom). Only faucet-funded test C2FLR may ever be sent to it.

**Gas finding (fixed in `b74576a`).** The first journey attempt's native protection, [`0x2cf5…a9ee`](https://coston2-explorer.flare.network/tx/0x2cf501cc27882a6e60f44e7e424ba66ec120a1ba55a67b7995f1ceb530f2a9ee):

- was sent with an exact `eth_estimateGas` limit;
- used all 341,025 gas, ending in `ReentrancySentryOOG` after `Protected`.

An exact estimate is not safe for transactions that read FTSOv2. The app's transaction path (`src/state.tsx`) and `scripts/coston2-journey.mjs` now send 1.3× the estimate. The retry used 334,550 gas.

The deploy and replacement scripts sign intents through viem's `prepareTransactionRequest`, which estimates gas. Their FTSOv2-reading steps (reference-market creations) succeeded in the deployment and the rehearsal. If one ever runs out of gas, it is recorded under `failedTransactions`; resume with `--retry-reverted <label>`.

**Plan gas.** The deployment used 25.11M gas, about 2% above the preflight's `PLAN_GAS` estimate of 24.6M. The 30% headroom covered it. Update `PLAN_GAS` to about 25.2M before any fresh deployment.

### How the deployment was run

1. Build and verify the exact checkout: `npm ci --ignore-scripts`, `npm run test:contracts`, `npm test`, `npm run build`.
2. `npm run deploy:coston2` runs a read-only preflight. It checks:
   - the chain ID;
   - that the manifest names Flare's canonical `FlareContractRegistry`;
   - that the registry's `WNat` is the manifest's WC2FLR (`WC2FLR`, 18 decimals);
   - that `FtsoV2` resolves to code;
   - that the FLR/USD read fee is zero and the feed is fresh (`maxPriceAge` 300 s);
   - the signer's balance, the git commit and artifact freshness.

   Each failure is printed as a reason, and nothing is sent ([pre-funding evidence](evidence/coston2-preflight.json)).
3. `npm run deploy:coston2 -- --broadcast` executes the 25-step plan. The required balance is `PLAN_GAS` × `maxFeePerGas` × 1.3, plus the 20 C2FLR the plan sends (10 wrapped into WC2FLR for exchange inventory, 10 as native inventory).
4. `npm run verify:coston2` reads back:
   - every deployed contract's runtime code against `contracts/out`, with immutables masked;
   - the factory wiring, including `wrapper` = the registry's WNat;
   - the adapter's `registry()`, `feedId()`, `maxAge()` and `ftsoV2()`;
   - asset identities and featured terms, and that each featured market still accepts protection;
   - the vault seeds, creation receipts and exchange funding.

   It then marks the manifest `deployed-and-verified`, the only status for which the website enables writes. It can be re-run at any time; it reads the chain only and updates `verifiedAt`.
5. `npm run journey:coston2` ran the public journey from a second fresh wallet ([evidence](evidence/coston2-e2e.json); [failed first attempt](evidence/coston2-e2e-attempt1.json)). Journey wallet keys stay in the ignored `.secrets/`.

Still open:
- one real wallet-extension transaction;
- publishing the website ([HOSTING](HOSTING.md));
- optional source verification on the Coston2 explorer.

The scripts have no mainnet mode. Every contract also rejects any chain other than 114 or the local 31337.

### Signed intents, resuming and starting over

The intent rules are the template's, bound to chain 114:

- The first broadcast gives the manifest a `deploymentId` and records `source`: the commit, compiler and the bytecode hashes of every planned artifact.
- Each transaction is signed and saved as an intent in `.secrets/transactions/<deploymentId>/<label>.json` before it is sent. The intent is bound to the chain, signer, nonce, payload hash and, for creations, the artifact's bytecode hash.
- A rerun resumes each intent according to its chain state:
  - **mined:** recorded;
  - **pending:** waited for, never replaced;
  - **unknown with its nonce unused:** rebroadcast unchanged, and re-signed only near its deadline;
  - **reverted:** recorded under `failedTransactions`, and the run stops. Resume with `--broadcast --retry-reverted <label>` after fixing the cause.
- Never edit or delete an intent that may be pending or mined, and never send other transactions from the signer during a deployment.

To start over, restore the pre-deployment manifest: every contract field `null`, `transactions: []`, and no `deploymentId`.

## Deployment plan

The plan lives in `scripts/setup-markets.mjs`.

1. **Contracts.** It deploys:
   - sDEMO;
   - the scenario oracle;
   - `ShieldFtsoV2Oracle(registry, FLR/USD, 300)`;
   - vsDEMO and bvsDEMO;
   - the vault oracle;
   - the factory, which also creates the bvsDEMO-unit backing oracles;
   - the exchange.

   The factory's `wrapper` is the canonical WC2FLR, so no wrapper is deployed.
2. **Vault seeds.** The deployer claims 10,000 sDEMO and seeds each vault with 1,000 sDEMO through `depositBounded`. Each seed must mint exactly one sDEMO's worth of shares per sDEMO; a donation front-run makes the step fail instead of minting dust.
3. **Markets.** The factory then creates the five featured markets. Each seeds 500 units of its backing and credits the creator's provider shares.
4. **Exchange inventory.** The exchange receives 1,000 sDEMO, 10 WC2FLR, 100 vsDEMO and 10 C2FLR.

No holder positions are seeded. The creator and protocol fee recipients are the test signer.

**Factory limits:**
- 32 markets, 10 of them reserved for the protocol account (featured markets and their replacements);
- at most two community markets per wallet;
- 100 concurrently open positions per market;
- a 0.01 backing-unit minimum entry claim, which is about 1.6 C2FLR at FLR/USD 0.0064.

### Monthly featured-market replacement

Epochs last 30 days and cannot be extended, so each verified deployment needs a replacement round every month. Put a calendar entry about seven days before the earliest maturity that `verify:coston2` prints.

1. `npm run deploy:coston2 -- --replace-featured` runs a read-only preflight. It checks that the deployment is verified, the closing date, free factory slots, feed freshness and the test C2FLR for 14.45M gas.
2. `npm run deploy:coston2 -- --replace-featured --broadcast` opens round `n` and signs `r<n>-…` intents.
3. `npm run verify:coston2`, then republish the website.

Each round spends five of the 32 lifetime slots, so earlier runs need `--force`. The chain-114 rehearsal ran one full round: 7 transactions, 14.06M gas, verified.

## Oracle configuration

- Feed: FTSOv2 block-latency FLR/USD, `0x01464c522f55534400000000000000000000000000`.
- Resolution: `FtsoV2` is looked up through `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` on every read, so a Flare upgrade of FtsoV2 is followed automatically.
- Maximum age: 300 s, about 160 blocks. On 19 October the feed's timestamp equalled the latest block's.
- Read fee: required to be zero. If Flare ever charges for reads, prices fail closed: protection, asset exits, trades and reference-market creation revert, and backing exits continue.
- Feed ID renames, which `getFeedIdChanges` reports, are not followed. A renamed feed would also fail closed and need a new adapter and new markets.

The scenario oracle is synthetic and labeled as such everywhere. No failed reference read ever falls back to it.

## Rehearsal and probe

Two read-only checks run without spending gas:

- `npm run probe:coston2` simulates the entire plan in one `eth_call` against live Coston2. It places the test-only `Coston2PlanProbe` runtime at an unused address through a state override.
- `npm run rehearse:coston2` needs `anvil --host 127.0.0.1 --port 8557 --chain-id 114`. It:
  - installs the Flare stand-ins from `contracts/test/mocks` at the canonical registry, FtsoV2 and WC2FLR addresses;
  - funds Anvil's publicly known development account 0 with exactly 100 C2FLR;
  - runs `deploy-coston2 --local` and `verify-coston2 --local`, a stale-feed check and a replacement round.

  The rehearsal keeps its manifest and intents in `.local/rehearsal/`, and Anvil's fees are not Coston2's. `npm run journey:coston2 -- --local` then runs the public journey against it.

## Local evidence

- **Solidity:** 57 tests, including four 256-run fuzz tests. 17 cover the FTSOv2 adapter, with mocks: normalization, zero and dust values, stale, future and zero timestamps, decimal bounds, read fees, unknown feeds, registry replacement, static-call enforcement, fail-closed markets and factory admission. The rest are the template's fairness, expiry, partial-exit, reward-solvency, slot-limit, vault, exchange and deadline cases.
- **JavaScript:** 14 tests, including FTSOv2 normalization parity with the Solidity vectors.
- **Browser:** 6 public tests, plus 3 local-chain tests (`SHIELD_LOCAL_E2E=1`): the signed lifecycle, the stale-quote race, and the status page judging fresh and stale feeds.
- **Local journey:** 57 confirmed transactions plus 3 expected `STALE_PRICE` reverts on chain 31337 ([evidence](evidence/local-journey.json)).

Start Anvil on 8557, run `node scripts/local-journey.mjs --browser-ready`, then `node scripts/local-web.mjs` (127.0.0.1:5194). Local state and `.local/` are ignored.
