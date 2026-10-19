# Flare Grants Program: YieldShield Flare

**Status: draft, not submitted.** Prepared 19 October 2026. Nothing has been entered into the form, no terms have been accepted and nothing has been posted. The contracts are **deployed and verified on Coston2**: deployment `coston2-2026-10-19T07-50-55Z-34db01`, factory `0xd6488c73f25663f3ba252aab053932cb5fae1f3c`. A fresh test wallet completed a 19-transaction journey there. The code lives in [`YieldShield/yieldshield-flare`](https://github.com/YieldShield/yieldshield-flare), which is private. The website is not published yet, and no real wallet-extension transaction has been made. Proposed request: **$40,000 equivalent in FLR, paid per milestone.**

- **Program page:** https://flare.network/resources/grants
- **Form (Airtable):** https://airtable.com/appyfl68ek3SOoCLh/shrqTkjFHruvr3dMk

The form was read on 19 October 2026 without entering anything; see [RESEARCH_AND_SCOPE](../RESEARCH_AND_SCOPE.md#flare-grants-program-re-verified-19-october-2026).

## What changed

This section compares the draft with the 17 October application plan and the 14 October grants research. Both live in the main repository under `docs/` and are not published.

**Since the first version of this draft (also 19 October):**
- **Deployed and verified.** The owner funded the test signer from the faucet. Deployment `coston2-2026-10-19T07-50-55Z-34db01` broadcast 25 transactions from source `2fcea40` (25.11M gas). `verify:coston2` passed, and passed again on a read-only rerun.
- **Public journey done.** Fresh tester `0x9E90…4113` completed 19 confirmed transactions on Coston2: faucet, provider capital, C2FLR and WC2FLR protection, a partial asset exit and a backing exit, a position transfer, a trade, a vault deposit, provider redemption and an unwrap.
- **Gas finding fixed.** A first attempt stopped when a protection sent with an exact gas estimate ran out of gas (341,025 used of 341,025). The app and the journey script now add a 30% margin to transactions that read FTSOv2 (commit `b74576a`). The contracts are unchanged.
- **Market dates.** The featured markets accept protection until **18 November 2026, 07:51 UTC** and must be replaced before then.

**Program and form:**
- **The form has no amount field.** Costs go inside the Milestones answer. The plan expected a requested-amount field.
- **The 1-year commitment is a checkbox, not marked required.** The earlier research had it as a requirement.
- **There are no character limits.** No field shows one; Airtable long-text fields accept up to 100,000 characters. The answers below are kept short anyway.
- **KYC is still unverified.** Neither the page nor the form mentions it. A grant agreement is step 4 of Flare's process.
- **Confirmed unchanged:** rolling intake, token grants without a published size, Google Cloud credits (up to $200k, $350k for AI), and FTSO/FDC use as a selection criterion.

**Assets:**
- **sFLR is out of the testnet scope.** The plan said "FXRP/FAssets and sFLR markets". Coston2 has no sFLR, and the sFLR/USD FTSO custom feed exists only on Flare mainnet, so sFLR moves to mainnet readiness.
- **FXRP becomes the first funded milestone.** Coston2's FTestXRP has 6 decimals, but the shared pool accepts only 18-decimal protected assets, so FXRP needs a core accounting change. The built testnet scope is native C2FLR and Flare's canonical WC2FLR, priced by live FTSOv2 FLR/USD, plus a deterministic scenario market.
- **An official test stablecoin exists.** Test USDT0 (`testUSDT0`, 6 decimals) is minted only by governance and handed out by the reCAPTCHA faucet at 10 per day. Seeding the markets needs about 5,500, so the build uses a labeled demo dollar (sDEMO, "not USDT0, no value"). testUSDT0 backing is part of milestone 1.

## Check before submitting

- [x] **Fund and deploy.** Done on 19 October: faucet gas, deployment, `verify:coston2` and the 19-transaction journey. On the day you submit, rerun `npm run verify:coston2`. It only reads the chain and updates `verifiedAt` in the manifest.
- [ ] **Publish the site.** Make https://flare.yieldshield.ai live ([HOSTING](../HOSTING.md)), or remove it from Links.
- [ ] **Repository access.** It is private. Either make it public (MIT) and enable private vulnerability reporting, or share access with the committee. The Links answer currently assumes a public repo.
- [ ] **Pitch deck.** The page asks for one. Add its link, or remove that line.
- [ ] **Wallet-extension test.** Still open. Do one real MetaMask transaction on the deployed Coston2 markets, ideally on the published site. Every recorded run so far used scripted keys or an injected test provider. Then update the Project Description sentence that says so.
- [ ] **1-year commitment.** Decide the checkbox (see David-only actions). The answer must not contradict the Taiko ("early launch chain"), Circle ("Arc central") or Arbitrum Security Program (possible exclusivity) answers.
- [ ] **Funding register.** The disclosure must still be true on the day. Add this application ($40,000, milestones M1–M5) to `docs/grants/FUNDING_REGISTER.md` in the main repo, and make sure no milestone below is billed elsewhere.
- [ ] **Monthly markets.** The featured markets close for new protection on **18 November 2026, 07:51 UTC**. Run `npm run deploy:coston2 -- --replace-featured --broadcast` from 11 November, verify, then republish the site. If you submit after 18 November, replace them first. The deployer has about 33.6 C2FLR, enough for about two rounds.
- [ ] **Cookie banner.** The form shows one; choose "Reject All, Except Strictly Necessary".

## Form fields

**Project Name** *

```
YieldShield Flare
```

**Contact First Name** *

```
David
```

**Contact Last Name** *

```
Hawig
```

**Email** *

```
david@yieldshield.ai
```

**Links** (website, pitch deck, product demo, GitHub, LinkedIn)

```
Website (Coston2 testnet app): https://flare.yieldshield.ai
GitHub (MIT): https://github.com/YieldShield/yieldshield-flare
Live contracts on Coston2 (factory): https://coston2-explorer.flare.network/address/0xd6488c73f25663f3ba252aab053932cb5fae1f3c
Public test journey (19 transactions): https://github.com/YieldShield/yieldshield-flare/blob/main/docs/evidence/coston2-e2e.json
Pitch deck: [add link]
Earlier live testnet prototypes (separate work, not billed): https://avalanche.yieldshield.ai and https://stellar.yieldshield.ai
David Hawig: https://www.linkedin.com/in/david-hawig-206a44b1/
Santiago Balaguer: https://www.linkedin.com/in/santiagobalaguer/
```

**Project Description** *

```
YieldShield Flare is a split-risk protocol prototype built for Flare, with FTSOv2 as its pricing core.

How it works
- A holder protects C2FLR or wrapped FLR (and, in milestone 1, FAssets FXRP) against a fixed backing claim. The claim is valued at entry by FTSOv2 and reserved at 150% by separately funded capital providers.
- After a short delay, the holder chooses an exit:
  - keep the asset and pay 12% of any realized gain (10% to providers, 1% to the market creator, 1% to the protocol);
  - or surrender the asset for the fixed claim.
- Providers earn those fees and the surrendered assets, and they bear the loss.
- Anyone can settle positions after maturity.
Every reserve, exit and fee is enforced on-chain. There is no token and no promised yield.

State on 19 October 2026
YieldShield Flare is deployed and verified on Coston2, from a dedicated MIT repository:
- an FTSOv2 adapter that resolves FtsoV2 through the FlareContractRegistry, requires a zero read fee, rejects stale, zero or future readings and normalizes decimals;
- Flare's canonical WC2FLR as the wrapped asset;
- five featured markets, a factory, a funded exchange and demo vaults;
- 57 Solidity tests (four of them fuzz tests), 14 JavaScript tests and 9 browser tests, all passing.

The deployment was 25 transactions. A verify script read back every contract's runtime code, the FTSOv2 and WC2FLR wiring, the terms, the seeds and every receipt.

A second, fresh test wallet then completed 19 transactions on Coston2:
- provided capital;
- protected C2FLR and WC2FLR;
- took a partial asset exit and a backing exit;
- transferred a position;
- traded, used the vault, and redeemed its provider shares.

The first attempt stopped when a transaction sent with an exact gas estimate ran out of gas. We now add a 30% gas margin to transactions that read FTSOv2, and the retry passed.

Before the broadcast, the whole plan was also rehearsed on a disposable test chain and simulated against live Coston2 state. Every transaction so far was signed by scripts; a real wallet-extension test and the public website are next.

What we do not claim
All assets are test tokens with no value; the demo backing token (sDEMO) is not USDT0. We claim no users, revenue or TVL, and test activity is not traction. The code is unaudited and was written with substantial AI assistance. A Flare mainnet release happens only after a separately funded independent audit and legal review.

Team
YieldShield is built by two cofounders through Hawig Ventures UG (haftungsbeschränkt), Germany:
- David Hawig, Founder and Managing Director, full-time on YieldShield. He was Director of Ecosystem at Web3 Foundation and has founded and exited two startups.
- Santiago Balaguer, Cofounder and Product Lead, with 15 years of product experience, five of them in crypto.
AI agents are development tools, not team members. The founders review the work and validate claims.
```

**Legal Entity & Domicile**

```
Hawig Ventures UG (haftungsbeschränkt), a German limited-liability company (UG), incorporated and domiciled in Germany.
```

**Unique Traits**

```
- An explicit option instead of a pooled promise. Each position carries one fixed backing claim and two exits that the holder chooses between. Providers see exactly what is reserved, what they earn and when they absorb a loss.
- Oracle failure never traps a holder. Prices are needed only to enter, to take an asset exit or to trade. If FTSOv2 is stale, has an invalid reading or starts charging for reads, those actions revert (fail closed), while the fixed backing exit and maturity settlement keep working.
- No arbitrage between providers. Provider entry and redemption freeze while any protection is open, and the fixed 1–30 day epochs settle permissionlessly. Unrealized losses therefore cannot be pushed onto newer providers.
- Tokenless, with no emissions. Fees come only from realized gains.
- Evidence-first engineering. Every deployment is gated by a read-only preflight, rehearsed on a disposable chain-114 test chain with Flare stand-ins, simulated against live Coston2 state before any gas is spent, and read back by a verify script afterwards. The Coston2 deployment passed that verification and a 19-transaction journey from a fresh wallet.
- Audit once, deploy many. One small, immutable EVM core plus a small chain-specific adapter. A single audit of that core can cover each chain that funds a deployment.
```

**Flare Ecosystem Value Add**

```
- FTSOv2 at the centre of each trade. Every protection, asset exit and exchange trade reads FTSOv2 through the FlareContractRegistry. The adapter is open source, so any team pricing positions on Flare can reuse a fail-closed FTSOv2 pattern that has tests behind it.
- A use for FXRP. Milestone 1 lets FXRP holders keep XRP exposure with a defined backing claim, and gives stablecoin holders a provider role paid from realized gains. This adds demand for FAssets, which already rely on Flare's FDC.
- Native assets, not wrappers. The build uses Flare's canonical WNat (WC2FLR, later WFLR) and the official test stablecoin, not look-alikes.
- Public tooling for Flare builders. All of it is MIT-licensed: Coston2 deploy and verify scripts with signed-intent resume, a chain-114 rehearsal with Flare stand-ins at the canonical addresses, and an eth_call probe that tests a full deployment against live Coston2.
- A cautious path to mainnet. Small caps, verified contracts, public monitoring, and a launch only after audit and legal review.
```

**Growth Strategy**

```
We have no users yet and do not count our own test activity as traction. The plan is staged and evidence-led:
1. Public Coston2 pilot. Recruit 10 external testers from the Flare and FXRP communities and our network, using their own wallets. The target is 30 complete journeys covering both exits, provider claims and maturity settlement. We publish the findings and fix them.
2. Integration content. Publish short guides and examples: protecting FXRP, providing testUSDT0 backing, and reading the public monitoring page. We would welcome Flare co-marketing for pilot recruitment.
3. Capped mainnet. Launch on Flare mainnet with low per-market caps after audit and legal review, and raise the caps only on observed behaviour.
4. Partners, not promotions. We will approach FXRP and USD₮0 venues and wallets for integrations only after the pilot shows the product works.
There is no paid acquisition, airdrop, points programme or token incentive. Everything above is a target, not a current number.
```

**Flare Native Protocol Integrations**

```
- FTSOv2 block-latency feeds. Built and tested: FLR/USD prices native C2FLR and WC2FLR markets. Milestone 1 adds XRP/USD for FXRP. The adapter resolves FtsoV2 through the FlareContractRegistry on every read, requires a zero read fee, and checks freshness (300 s), zero values, timestamps and decimals.
- FTSOv2 Scaling (anchor) feeds. Milestone 2: exits and settlement are cross-checked against the 90-second anchor values, verified on-chain with Merkle proofs (verifyFeedData), with a bounded deviation from the block-latency price.
- FAssets. Milestone 1: FXRP becomes a protected asset. FXRP minting and redemption rely on the FDC.
- FlareContractRegistry and WNat. Built: canonical WC2FLR on Coston2, WFLR on mainnet.
- FDC. Not used directly in this plan. We would welcome guidance on whether an FDC attestation adds real value here (for example, proofs for cross-chain positions) rather than adding one for its own sake.
- Songbird. Not planned.
```

**Milestones**

```
Five milestones over about 16 weeks after acceptance. Total $40,000 (400 hours at a blended $100/hour), paid in FLR at the payment-date rate, one installment per completed milestone. The deployed and verified Coston2 prototype is prior work and is not billed.

M1. Real Flare assets on Coston2: FXRP and testUSDT0. Weeks 1–4, 120 h, $12,000.
- Generalize the pool to 6-decimal protected assets (FXRP), with new fuzz and invariant tests.
- Add an FXRP market priced by FTSOv2 XRP/USD.
- Add Flare's testUSDT0 as an approved backing option.
- Link FAssets mint and redeem steps in the app.
Evidence: verified Coston2 addresses, passing tests, and an FXRP journey from a fresh wallet.

M2. FTSOv2 hardening and monitoring. Weeks 5–7, 100 h, $10,000.
- Cross-check exits and settlement against FTSOv2 Scaling anchor values verified by Merkle proof.
- Bound the deviation between anchor and block-latency prices.
- Publish a threat model.
- Run a public monitoring page for reserves, feed age and market maturity.
Evidence: tests, the published threat model, and the live monitoring page.

M3. Independent testnet pilot. Weeks 8–10, 80 h, $8,000.
- 10 external testers using their own wallets complete 30 journeys across both exits, provider claims and maturity settlement.
- Fix the usability and recovery issues found.
These are targets, not current traction.
Evidence: a pilot report with public transaction links, and the fix commits.

M4. Mainnet readiness. Weeks 11–13, 50 h, $5,000.
- Freeze an audit revision and write its audit scope.
- Write the Flare mainnet runbook with verified WFLR, FXRP and USD₮0 identities and caps.
- Write the incident procedures.
- Assess sFLR through its FTSO custom feed.
Evidence: the tagged revision and the published documents.

M5. Capped Flare mainnet release. Weeks 14–16, 50 h, $5,000.
- Deploy the audited revision to Flare mainnet with low caps, verified contracts, monitoring and published evidence.
This milestone depends on a separately funded independent audit and legal review. If either is missing, it is a blocker or an agreed scope change, not a completed milestone.

Excluded: the audit itself, liquidity incentives, any token, and Songbird. No deliverable is billed to another program.
```

**Other Integrations**

```
- Wallets: MetaMask and other EIP-1193 wallets. Testing with a Flare-native wallet such as Bifrost is part of the M3 pilot; not yet tested.
- Stablecoin: USD₮0 on Flare mainnet. Its contract identity will be verified against an official listing before M5.
- Liquid staking: Sceptre sFLR and its FTSO custom feed. Mainnet research only, in M4.
- Explorer: Flare's Blockscout explorers, for contract verification and transaction links.
- Hosting: a static Vercel site. No backend, database or server-side signer.
```

**Other Partnerships**

```
None. YieldShield has no partnerships or announcements with Flare, Flare ecosystem projects or asset issuers.

Self-funded; no grants or investment received to date. Pending applications: Avalanche Team1 Mini Grant (submitted 13 October 2026) and Stellar Community Fund #46 (interest form submitted 13 October 2026). Each chain deployment is separate work; shared core work is listed as already built and is not billed.
```

**How did you find the Flare grants program?** *

```
Our own research into ecosystem grant programs, through the Flare grants page (flare.network/resources/grants).
```

**Other Requirements**

```
- Technical review. We would value a review of our FTSOv2 integration: view-typed reads with a zero-fee check, and the planned Scaling proof verification.
- Testnet assets for the pilot. Seeding markets and the pilot needs about 5,000 testUSDT0 and some FXRP, beyond the faucet's 10 per day.
- Grant terms. Please clarify KYC/KYB, the grant token and any vesting, so we can plan the milestones.
- Auditors. Introductions to auditors familiar with Flare. The audit is not part of this request.
- Co-marketing. Help recruiting external testers for the M3 pilot.
- Google Cloud credits. Not needed now: the app is static.
```

**Can you commit to developing and supporting this project on Flare for at least 1 year** (checkbox)

```
[ ] Left for David to decide. See "David-only actions".
```

## Development plan

**Request.** $40,000 equivalent in FLR for 400 hours at a blended $100/hour, over about 16 weeks after acceptance. It is paid per milestone, following Flare's milestone check-ins. The FLR amount is fixed at each payment date.

**Rationale:**
- **Not billed.** The protocol core and the Coston2 port already exist and are not billed. The request pays only for Flare-specific work that does not exist yet:
  - FXRP, which needs a core change for 6-decimal assets;
  - testUSDT0 backing;
  - anchor-feed hardening;
  - an independent pilot;
  - a capped mainnet.
- **No double billing.** No deliverable overlaps the Avalanche or Stellar applications: each chain's assets, oracles and deployments are separate.
- **Audit not included.** It is excluded and funded separately, so the grant does not pay for an audit it cannot control.

**Already built, not billed:**
- **Shared core:** the immutable pool, factory, exchange, ERC-4626 demo vaults, epochs and settlement, fee and reward accounting, and their 40 Solidity tests.
- **Flare adapter:** `ShieldFtsoV2Oracle` with 17 tests, Flare mocks and canonical WC2FLR wiring.
- **Coston2 scripts:**
  - the preflight-gated deploy, verify and replacement scripts;
  - the chain-114 rehearsal;
  - the live Coston2 plan probe;
  - the fresh-wallet journey script.
- **App:** Coston2 chain config, asset catalog, branding, a status page that reads FTSOv2 live, and the 30% gas margin for transactions that read FTSOv2.
- **Coston2 deployment:** `coston2-2026-10-19T07-50-55Z-34db01`, 25 transactions, verified, plus the 19-transaction fresh-wallet journey ([evidence](../evidence/coston2-e2e.json)).
- **Docs:** research, operations, security, E2E, hosting and provenance.

| Milestone | Additional work | Acceptance evidence | Effort, budget |
|---|---|---|---|
| M1. FXRP and testUSDT0 on Coston2 (weeks 1–4) | 6-decimal protected assets in the pool with fuzz and invariant tests; FXRP market on FTSOv2 XRP/USD; testUSDT0 approved backing; FAssets mint and redeem links | Verified Coston2 addresses and passing `verify:coston2`; FXRP journey from a fresh wallet with public hashes; test counts | 120 h, $12,000 |
| M2. FTSOv2 hardening (weeks 5–7) | Scaling anchor-value cross-check with Merkle proof (`verifyFeedData`); deviation bound; threat model; public monitoring of reserves, feed age and maturities | Tests including proof verification against Coston2 roots; published threat model; live monitoring page | 100 h, $10,000 |
| M3. Independent pilot (weeks 8–10) | 10 external testers, 30 complete journeys including maturity settlement; fixes | Pilot report with explorer links; fix commits; redeployed markets | 80 h, $8,000 |
| M4. Mainnet readiness (weeks 11–13) | Frozen audit revision and scope; mainnet runbook with verified WFLR, FXRP and USD₮0 identities and caps; incident procedures; sFLR custom-feed assessment | Tagged revision; published scope, runbook and assessment | 50 h, $5,000 |
| M5. Capped Flare mainnet (weeks 14–16) | Deploy the audited revision with low caps, verified contracts, monitoring and evidence | Verified mainnet addresses, monitoring page, deployment evidence. **Conditional on a separately funded independent audit and legal review**; without them this is a blocker or an agreed scope change, not a completed milestone | 50 h, $5,000 |

No paid acquisition, giveaways or incentives are included. Test activity is never reported as TVL or adoption.

## David-only actions

These are owner steps; an agent must not do them.

1. **KYC/KYB.** Complete whatever Flare's grant agreement requires (unverified so far), and ask about it in screening.
2. **The 1-year commitment checkbox.** A suggested reading that fits "mainnet goes to whoever funds it": check it only if you accept two things:
   - keep the Flare deployment live and maintained for at least 12 months after acceptance (monitoring, monthly market replacement, security fixes);
   - if Flare funds M5 and it launches, maintain the capped mainnet deployment for at least 12 months.

   This is not exclusivity. Before checking it, compare it with the Taiko, Circle Arc and Arbitrum Security Program answers. Leave it unchecked if you cannot commit.
3. **Wallet-extension test.** Do one real MetaMask (or other extension) transaction on the Coston2 deployment, then update this draft.
4. **Submission.** Review every field, then click Submit yourself. Submitting may accept Airtable or Flare terms.

Related owner steps:
- the featured-market replacement before 18 November 2026, 07:51 UTC (more faucet C2FLR after about two rounds);
- publishing `flare.yieldshield.ai`;
- deciding whether to make the repository public;
- updating the main repo's funding register.
