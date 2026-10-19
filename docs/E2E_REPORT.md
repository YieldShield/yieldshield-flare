# End-to-end verification

Date: 19 October 2026.

This is functional verification, not a security audit. No Coston2 transaction has been sent. The deployment is waiting for testnet gas ([OPERATIONS](OPERATIONS.md)). Each check below names its environment, because local, rehearsal and simulated results are not Coston2 activity.

| Environment | What runs there |
|---|---|
| **Live Coston2, read-only** | Direct reads, a read-only preflight and one `eth_call` simulation. Nothing is signed |
| **Chain-114 rehearsal** | A disposable Anvil with Coston2's chain ID and Flare stand-ins at the canonical addresses. The real scripts sign with Anvil's public development account |
| **Local chain 31337** | A disposable Anvil with stand-ins deployed normally; the scripted journey and the browser tests |

## Live Coston2, read-only

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

- **Coston2 broadcast.** Any Coston2 deployment, verification or public journey waits for faucet gas.
- **Wallet extension.** No real extension (MetaMask or another EIP-1193 wallet) has signed. Every run used scripted keys or an injected test provider.
- **Maturity on Coston2.** Featured epochs last 30 days. Settlement on Coston2 is covered only locally and by the Solidity suite.
- **Gain fees on Coston2.** They depend on FLR/USD rising between entry and exit.
