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
    avaxOut: amount - junior - 2n * recipient,
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
  TransferFailed: "The AVAX transfer to the recipient failed.",
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
