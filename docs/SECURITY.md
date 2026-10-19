# Security and economic boundaries

## Reporting a vulnerability

Please report suspected vulnerabilities privately, never in a public issue or pull request.

- **Now:** email david@yieldshield.ai with the subject "YieldShield Flare security". Include:
  - the affected contract and function, or the page;
  - steps to reproduce;
  - the expected impact.
- **Once the repository is public:** use **Report a vulnerability** on its Security tab. GitHub private vulnerability reporting only exists for public repositories, so the owner enables it when publishing.

Never send private keys or seed phrases. This is unaudited testnet software that holds no assets of monetary value. There is no bug bounty.

## Scope

This is unaudited testnet software, written with substantial AI assistance. Every asset-moving contract and the oracle adapter accept only Flare Testnet Coston2 (chain 114) or local chain 31337. No asset of monetary value belongs here.

## FTSOv2 price boundary

`ShieldFtsoV2Oracle` is the only new contract compared with the template.

- **Resolution.** It reads `FtsoV2` through the canonical `FlareContractRegistry` on every call, and trusts both. They are Flare governance contracts.
- **Static reads.** `getFeedById` is called through a view interface: a zero-value `STATICCALL` to the production contract, as Flare's `getTestFtsoV2()` does. A non-compliant FtsoV2 that writes state on read reverts, which the tests cover.
- **Fees.** `calculateFeeById` must be zero, so a future fee makes prices fail closed rather than misbehave.
- **Validation.** The adapter rejects:
  - a zero value, or a value that normalizes to zero;
  - a zero or future timestamp;
  - an age above `maxAge` (300 s, bounded to at most 1 hour at construction);
  - decimals outside −18…18.

  Normalization to six decimals uses checked arithmetic.
- **Consequence of failure.** An invalid or stale feed blocks protection, asset exits, exchange quotes and reference-market creation. Backing exits and maturity settlement never read a price.
- **What it does not defend against.** Block-latency feeds can move within a block and are not manipulation-proof for large positions. For mainnet, settlement against FTSOv2 Scaling (anchor) feeds verified by Merkle proof is planned. FLR/USD is a reference price for valueless C2FLR on testnet.

## Accounting properties

The pool is unchanged from the template:

- **Decimals and immutability.** Protected assets use 18 decimals and backing uses 6. Addresses, oracle and terms are immutable.
- **Admission.** Backing admission uses a ceil-rounded requirement: 150% by default, 125–300% allowed. Partial exits release only the proportional entry claim.
- **Freeze while exposed.** Provider entry and redemption are frozen while any protected exposure remains, which closes the unrealized-shortfall arbitrage route.
- **Bounded epochs.** Epochs last 1–30 days. A market holds at most 100 open positions, with a 0.01 backing-unit minimum entry claim and an admission cutoff at the final exit delay.
- **Permissionless expiry.** Anyone can settle an expired position. A fixed backing credit is set aside outside provider NAV, and the owner pulls it later. Forced expiry forfeits the remaining upside.
- **Separate liabilities.** Protected principal, surrendered inventory, provider fees, creator and protocol fees, and unclaimed backing are distinct.
- **Fees.** Partial exits charge only the exited slice's realized gain, and fee payouts are pull-based.
- **Transfers.** Ownership transfers keep the entry basis, opening time and maturity.
- **Bounds.** Slippage limits and deadlines bind every reviewed write. WC2FLR wrapping is Flare's own 1:1 WNat.

## Demo assets

- **sDEMO.** A YieldShield faucet token. It is not USDT0 or Flare's testUSDT0, and its on-chain name says so.
- **Vaults.** Both vaults hold actual sDEMO.
- **Exchange.** It moves only finite, funded inventory.
- **bvsDEMO floors.** A bvsDEMO-backed floor is a fixed number of receipts, not a fixed amount of sDEMO or dollars.
- **WC2FLR.** Flare's canonical contract, not ours.

## Remaining limitations

There is:

- no continuous provider liquidity;
- no automatic rollover;
- no bridge, leverage or token launch;
- no external yield strategy and no fixed or promised return.

Providers can lose their capital, and surrendered assets carry directional risk. Native transfers to a holder contract that cannot receive C2FLR can fail. That holder can transfer the position or choose a backing exit.

These are not done yet:

- FXRP (6 decimals), testUSDT0 backing, sFLR, FDC attestations and anchor-feed settlement;
- any real wallet-extension test;
- maturity settlement on Coston2, which is covered locally and by the Solidity suite.

The Coston2 deployment and a scripted public journey are done ([E2E_REPORT](E2E_REPORT.md)).

Tests, local journeys, the rehearsal and the probe do not replace an independent audit, economic review or legal review. Any mainnet release depends on all three.
