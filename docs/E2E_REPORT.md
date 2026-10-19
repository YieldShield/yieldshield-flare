# End-to-end verification

Date: 19 October 2026.

This is functional verification, not a security audit. Each check below names its environment, because local, rehearsal and simulated results are not Coston2 activity, and scripted test activity is not traction.

| Environment | What runs there |
|---|---|
| **Coston2** | The verified deployment `coston2-2026-10-19T07-50-55Z-34db01` and a scripted journey from a fresh wallet |
| **Live Coston2, read-only** | Direct reads, the preflight and one `eth_call` simulation, run before the broadcast |
| **Chain-114 rehearsal** | A disposable Anvil with Coston2's chain ID and Flare stand-ins at the canonical addresses |
| **Local chain 31337** | A disposable Anvil with stand-ins; the scripted journey and the browser tests |

## Coston2 deployment and journey, 19 October 2026

**Deployment.** The faucet-funded test signer `0x2b7E…5226` broadcast the 25-step plan from source commit `2fcea40`:

- blocks 36792295–36792333;
- 25,107,922 gas;
- no reverted steps.

`npm run verify:coston2` then marked it `deployed-and-verified`. A read-only re-run the same day passed again. It reported FTSOv2 FLR/USD at 6397 sDEMO micro-units per C2FLR, all five featured markets open until 18 November 2026, 07:51 UTC, and live exchange inventory of 10 C2FLR, 9 WC2FLR, 100 vsDEMO and 1,000.006414 sDEMO after the journey's trade. Addresses are in the [README](../README.md#addresses) and [config/deployment.json](../config/deployment.json).

**Journey** ([evidence](evidence/coston2-e2e.json)). `npm run journey:coston2` created a fresh tester, `0x9E90302037a8fE591dFd3ffAa704Ea893b164113`. The deployer funded it with 15 C2FLR. It completed **19 confirmed transactions** in blocks 36792442–36792579, at a reference price of 0.006394 sDEMO per C2FLR:

| Path | Result |
|---|---|
| Faucet and provider capital | 10,000 sDEMO claimed; 500 sDEMO provided to the scenario market |
| Protection | 5 C2FLR protected in the FLR reference market (334,550 gas); 3 C2FLR wrapped into WC2FLR and protected in the wrapped market (565,653 gas) |
| Exits | After the 60 s delay: a 2.5 C2FLR partial asset exit, then a backing exit for the remainder |
| Transfer | The WC2FLR position was transferred to the deployer, who took the backing exit |
| Exchange and vault | 1 WC2FLR bought from funded inventory; 10 sDEMO deposited for vsDEMO receipts |
| Provider | Notice, then full redemption of the tester's shares after the 120 s notice |
| Unwrap | The remaining WC2FLR unwrapped to C2FLR |

The tester ended with 8.86 C2FLR, 9,990.009571 sDEMO and 10 vsDEMO. All five featured markets ended with no open positions, so provider entry stays open.

FLR/USD barely moved during the journey, so no gain fee was charged on Coston2. Gain fees are covered by the Solidity suite, the local journey and the local browser test.

**First attempt and the gas-margin fix** ([evidence](evidence/coston2-e2e-attempt1.json)). A first tester, `0x996b617D5de97B05ECB6683C928931b8FeB10f9b`, sent 4 successful transactions. The fifth, `tester-protects-5-c2flr` ([`0x2cf5…a9ee`](https://coston2-explorer.flare.network/tx/0x2cf501cc27882a6e60f44e7e424ba66ec120a1ba55a67b7995f1ceb530f2a9ee)), reverted:

- it was sent with viem's exact gas estimate;
- it used all 341,025 gas;
- `cast run` shows `ReentrancySentryOOG` after `Protected` was emitted, so it ran out at the reentrancy guard's final storage write.

An exact estimate leaves no margin. A transaction that reads FTSOv2 can need more gas when mined than when estimated, most likely because the feed's state changes every block. Commit `b74576a` therefore sends 1.3× the estimate, both in the app's transaction path and in `coston2-journey.mjs`. The contracts did not change. After the fix:

- 14 JavaScript tests, the build, the local journey and all 9 browser tests (including the signed local lifecycle) passed;
- the retry with a fresh wallet completed;
- the transaction that had failed used 334,550 gas.

## Live Coston2, read-only (before the broadcast)

**Plan probe** ([evidence](evidence/coston2-plan-probe.json), block 36791398). `Coston2PlanProbe` was installed by state override and called once. Inside that call, on Coston2's EVM and state:

- every plan contract deployed from the artifacts' creation code and passed the chain-114 guard;
- the adapter resolved the real FtsoV2 and priced FLR/USD 0.00640948 as 6409 sDEMO micro-units per C2FLR;
- the factory accepted the canonical WC2FLR and registered five markets;
- 5 C2FLR and 5 WC2FLR protections opened with 0.032045 sDEMO entry claims;
- plan execution used 23.44M gas, and Coston2's WNat deposit and transfer used 188k and 133k gas.

**Preflight** ([evidence](evidence/coston2-preflight.json)). Every check passed except the balance:

- canonical registry;
- WNat = WC2FLR;
- FtsoV2 resolved;
- read fee 0;
- feed 1 s old.

The required balance is 43.985 C2FLR.

**Status page** ([screenshot](evidence/coston2-status-desktop.png)). It reads FLR/USD through the registry, shows the value, age and fee, judges the reading valid with the adapter's rules, and shows the deployer waiting for faucet gas. [Desktop](evidence/coston2-home-desktop.png) and [390 px](evidence/coston2-home-mobile.png) home views have writes disabled and no horizontal overflow.

## Chain-114 rehearsal

[Evidence](evidence/coston2-rehearsal.json). The deployer was funded with exactly one faucet claim of 100 C2FLR.

| Step | Result |
|---|---|
| `deploy-coston2 --local` preflight | Ready. Required 20.06 C2FLR at Anvil's fees |
| `--broadcast` | 25 transactions, 24,259,374 gas, all receipts successful |
| `verify-coston2 --local` | Runtime code, FTSOv2 and WC2FLR wiring, terms, seeds and funding verified |
| Stale feed | `price()` reverted `STALE_PRICE`; it priced 6399 again after the feed was restored |
| Replacement round 1 (6 days before maturity) | 7 transactions, 14,060,790 gas; five new markets; old ones recorded as retired |
| `verify-coston2 --local` again | Verified against the `r1-` creation receipts |

**Scripted public journey** ([evidence](evidence/coston2-rehearsal-journey.json)). `coston2-journey.mjs --local` used a fresh tester funded with 15 C2FLR by the deployer. It completed 19 confirmed transactions:

1. 10,000 sDEMO claimed and 500 sDEMO provided to the scenario market;
2. 5 C2FLR protected; 3 C2FLR wrapped and protected as WC2FLR;
3. after the exit delay, a 2.5 C2FLR partial asset exit, then a backing exit for the remainder;
4. the WC2FLR position transferred, and the new owner's backing exit;
5. 1 WC2FLR bought from exchange inventory;
6. 10 sDEMO deposited into the vault;
7. provider notice, then full share redemption;
8. the remaining WC2FLR unwrapped.

The same script will run against Coston2 once the deployment is funded.

## Local chain 31337

**Scripted journey** ([evidence](evidence/local-journey.json)): 57 confirmed transactions plus 3 expected reverts. The real `ShieldFtsoV2Oracle` reads a mock FtsoV2 through a mock registry, starting at FLR/USD 639928 with 8 decimals.

| Path | Result |
|---|---|
| Plan | Stand-ins, then the full plan, then five seeded markets |
| Holder | 5 WC2FLR bought and protected. FLR/USD doubled in the mock, then a partial gain exit charged the 12% fee split. The remainder was transferred and the new owner took a backing exit |
| Provider and fees | Earned-fee claim, notice, partial basket redemption, and the creator and protocol fee pull |
| Exchange and vaults | WC2FLR sale; vault redemption; a vault-backed protection paid in bvsDEMO receipts, which were then redeemed |
| Stale feed | Protection, asset exit and exchange buy each reverted `STALE_PRICE`; the backing exit on the same stale feed paid in full |
| Maturity | Scenario-market protection, permissionless settlement, then the holder's segregated claim |

**Browser** ([receipts](evidence/e2e/browser-receipts.json)). These are Playwright tests through the real app, with an injected provider forwarding to Anvil accounts 2 and 3; no wallet extension was involved. The run produced 10 browser-signed transactions, and all succeeded:

1. faucet, then 500 sDEMO provided to the wrapped market;
2. 5 WC2FLR bought and protected;
3. the mock feed doubled, then a 2.5 WC2FLR partial exit;
4. earned-fee claim, the activity journal, then disconnect.

The final state assertions held: one position, 2.5 WC2FLR and its claim still reserved, and no unclaimed fees.

The same run also checked two regressions:

- a delayed exchange quote cannot revive a previous asset review;
- the status page labels a fresh feed valid and a 301 s old feed `Rejected (STALE_PRICE)`.

[Local markets](evidence/local-markets-desktop.png) and [local status](evidence/local-status-desktop.png) screenshots are attached.

## Checks run on 19 October 2026

- `forge test --root contracts`: 57 passed, including four 256-run fuzz tests.
- `npm test`: 14 passed.
- `npm run build`: passed. The production bundle cannot enable local-chain mode.
- `npm run test:browser`: 6 public tests passed. With `SHIELD_LOCAL_E2E=1`, 3 local-chain tests passed.

## Not verified yet

- **Wallet extension.** No real extension (MetaMask or another EIP-1193 wallet) has signed. Every Coston2 and local run used scripted keys or an injected test provider.
- **Website.** Published on 19 October 2026 at https://flare.yieldshield.ai. Only scripted checks of the custom domain exist so far ([HOSTING](HOSTING.md)); no person has used it with their own wallet.
- **Maturity on Coston2.** Featured epochs run until 18 November 2026. Settlement on Coston2 is covered only locally and by the Solidity suite.
- **Gain fees on Coston2.** They depend on FLR/USD rising between entry and exit.
- **Explorer source verification.** The verify script compares runtime code with the build, but sources have not been submitted to the Coston2 explorer.
