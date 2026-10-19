/** Exact integer accounting, matching the immutable pool. */
export const WAD = 10n ** 18n;
export function exitPreview(amount, floor, price) {
  if (amount < 0n || floor < 0n || price <= 0n)
    throw new Error("Invalid quote");
  const value = (amount * price) / WAD;
  const gain = value > floor ? ((value - floor) * WAD) / price : 0n;
  const junior = (gain * 1000n) / 10000n;
  const recipient = (gain * 100n) / 10000n;
  return {
    assetOut: amount - junior - 2n * recipient,
    fee: junior + 2n * recipient,
    backingOut: floor,
  };
}
export function maxNewFloor(backing, reserved) {
  const maximum = (backing * 10000n) / 15000n;
  return maximum > reserved ? maximum - reserved : 0n;
}
/** Ceil the minimum so sub-unit rounding never exceeds the advertised 0.5% loss. */
export function minimumOutput(quote) {
  if (quote < 0n) throw new Error("Invalid output quote");
  return (quote * 995n + 999n) / 1000n;
}
/** Decimals of ShieldFtsoV2Oracle.price(): the pools' six-decimal backing units. */
export const PRICE_DECIMALS = 6;
/**
 * Mirrors ShieldFtsoV2Oracle.price() for a raw FTSOv2 reading, including its checks and revert
 * reasons, so the interface can explain a reading before any contract is deployed.
 */
export function ftsoPrice({ value, decimals, timestamp }, now, maxAge) {
  if (value <= 0n) throw new Error("ZERO_PRICE");
  if (timestamp <= 0n || timestamp > now) throw new Error("INVALID_TIMESTAMP");
  if (now - timestamp > maxAge) throw new Error("STALE_PRICE");
  if (decimals < -18 || decimals > 18) throw new Error("FEED_DECIMALS");
  const shift = PRICE_DECIMALS - decimals;
  const price =
    shift >= 0 ? value * 10n ** BigInt(shift) : value / 10n ** BigInt(-shift);
  if (price <= 0n) throw new Error("ZERO_PRICE");
  return price;
}
/** A feed value as a decimal string: value / 10^decimals, for any decimal count. */
export function feedValue(value, decimals) {
  if (decimals <= 0) return String(value * 10n ** BigInt(-decimals));
  const digits = String(value).padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
/** Plain-language explanations for decoded contract errors (viem only reports "reverted."). */
const knownErrors = {
  ERC20InsufficientBalance:
    "Your token balance is too low for this transaction.",
  ERC20InsufficientAllowance:
    "The token approval is lower than this transaction needs. Review again.",
  InvalidAmount: "This amount is outside the market's allowed range.",
  InsufficientBacking: "Not enough unreserved backing for this entry claim.",
  Slippage: "The result moved outside your reviewed limit. Review again.",
  NotReady:
    "Not ready yet: the exit delay or withdrawal notice is still running.",
  NotOwner: "Only the current position owner can do this.",
  TransferFailed: "The native C2FLR transfer to the recipient failed.",
  ActiveExposure:
    "Provider entry and redemption are frozen while protected positions are open.",
  EpochClosed: "This market's epoch has ended.",
  PositionLimit: "This market already has 100 open positions.",
};
function revertName(error) {
  for (let e = error, depth = 0; e && depth < 8; e = e.cause, depth++)
    if (e.data?.errorName) return e.data.errorName;
  return undefined;
}
export function safeError(error) {
  const known = knownErrors[revertName(error)];
  if (known) return known;
  const message =
    error?.shortMessage ||
    error?.message ||
    "The request could not be completed.";
  return message
    .replace(/0x[a-fA-F0-9]{128,}/g, "[transaction data]")
    .slice(0, 280);
}
