# Security and economic boundaries

## Reporting a vulnerability

Please report suspected vulnerabilities privately, not in a public issue: use **Report a vulnerability** on this repository's Security tab (GitHub private vulnerability reporting), or email david@yieldshield.ai. Include the affected contract and function or page, steps to reproduce and the expected impact. Never send private keys or seed phrases. This is unaudited testnet software that holds no assets of monetary value; there is no bug bounty.

## Scope

This is unaudited testnet software. Asset-moving contracts accept only local chain 31337 or Fuji43113. No asset of monetary value belongs here.

## Accounting properties

- All protected assets use 18 decimals; both approved backing choices use 6 decimals. Addresses, oracle and term configuration are immutable.
- Backing admission uses a ceil-rounded collateral requirement (default 150%, configurable 125–300%). Partial exits release only the corresponding proportional entry claim; rounding leaves the residual claim attached to the remaining asset.
- Provider entry/redemption is frozen while any protected exposure remains. This closes an unrealized-shortfall NAV-arbitrage route. Epochs last 1–30 days, with at most 100 open positions (closed positions free their slot), a 0.01 backing-unit minimum entry claim so dust cannot occupy every slot, and a final-exit-delay admission cutoff.
- Permissionless per-position expiry does not call the owner. It segregates a fixed backing credit outside provider NAV and reserves; the owner subsequently pulls that credit. Forced expiry forfeits remaining asset upside.
- Protected principal, surrendered provider inventory, indexed provider fee inventory, creator/protocol fee inventory, and unclaimed backing are distinct liabilities. New provider deposits do not inherit old earned fees; provider redemption does not withdraw fee inventory.
- Partial exits charge realized gains on the selected slice only. Ownership transfers preserve entry basis, opening time and maturity, and revoke the old owner's control.
- Gain-fee recipients use pull payments. Failed fee-recipient calls cannot block holder exit. Callers may direct earned-fee payouts to another nonzero recipient.
- Slippage minima/maxima and deadlines bind reviewed asset entries/exits, provider deposits/redemptions, exchange trades, vault conversions and factory creation. Native wrapping is exactly 1:1.

## Funded assets and oracle units

awAVAX mints only against deposited native Fuji AVAX. Both ERC-4626 vaults hold actual aDEMO; their receipt value can rise only through funded assets such as donations. The exchange transfers finite actual inventory and never invents balances or fills. A stale reference feed blocks trading; no fallback uses the separate synthetic scenario.

The bvaDEMO oracle converts an aDEMO-denominated protected-asset quote into six-decimal vault-share units. A protected floor is therefore a fixed **number of backing receipts**, not a fixed number of underlying aDEMO or dollars. Oracle round validation rejects nonpositive, stale, future and incomplete Chainlink rounds.

Factory creation validates approved combinations, bounds terms, atomically seeds the new market and credits the creator's provider ownership. Unsuccessful funding leaves no registered market. No arbitrary token can be admitted through this factory.

## Remaining limitations

There is no continuous provider liquidity, automatic rollover, bridge, leverage, insurance guarantee, token launch, external yield strategy or fixed APY. Providers can lose capital. Surrendered assets carry directional risk. Very small reward-index rounding dust can remain in reward inventory; it cannot be taken as protected principal or provider capital. Native transfers to a nonpayable holder can fail; that holder can transfer its still-live position to a compatible address before maturity or choose a backing exit.

Browser/RPC reliability, user signing and Fuji testnet availability remain external dependencies. Tests and local signed demonstrations do not substitute for an independent audit, real-world liquidity/oracle assessment, production governance or economic validation. Circle USDC and BENQI sAVAX are reference research only.
