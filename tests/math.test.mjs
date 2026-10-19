import test from "node:test";
import assert from "node:assert/strict";
import {
  exitPreview,
  ftsoPrice,
  feedValue,
  maxNewFloor,
  minimumOutput,
  safeError,
  WAD,
} from "../src/math.mjs";
test("exits use only realized positive gains and precise units", () => {
  assert.deepEqual(exitPreview(WAD, 25_000000n, 50_000000n), {
    assetOut: 940000000000000000n,
    fee: 60000000000000000n,
    backingOut: 25_000000n,
  });
  assert.equal(exitPreview(WAD, 25_000000n, 15_000000n).fee, 0n);
});
test("entry capacity is conservative under rounding", () => {
  assert.equal(maxNewFloor(1000_000000n, 100_000000n), 566666666n);
  assert.equal(maxNewFloor(100_000000n, 100_000000n), 0n);
});
test("invalid price cannot silently become a live quote", () => {
  assert.throws(() => exitPreview(WAD, 25_000000n, 0n));
});

test("tiny quotes cannot lose more than the stated half percent", () => {
  assert.equal(minimumOutput(2n), 2n);
  assert.equal(minimumOutput(199n), 199n);
  assert.equal(minimumOutput(200n), 199n);
  assert.equal(minimumOutput(201n), 200n);
  for (let quote = 1n; quote <= 1000n; quote++) {
    const min = minimumOutput(quote);
    assert.ok(
      (quote - min) * 1000n <= quote * 5n,
      "accepted minimum exceeds tolerance",
    );
    assert.ok(
      (quote - (min - 1n)) * 1000n > quote * 5n,
      "minimum must be the least safe unit",
    );
    assert.ok(min <= quote, "quote remains executable");
  }
});
test("zero-valued basket legs remain redeemable without allowing negative quotes", () => {
  assert.equal(minimumOutput(0n), 0n);
  assert.throws(() => minimumOutput(-1n));
});
test("decoded contract errors become plain sentences", () => {
  const reverted = {
    shortMessage: 'The contract function "protect" reverted.',
    cause: { data: { errorName: "PositionLimit" } },
  };
  assert.equal(
    safeError(reverted),
    "This market already has 100 open positions.",
  );
  assert.equal(
    safeError({
      cause: { cause: { data: { errorName: "ERC20InsufficientBalance" } } },
    }),
    "Your token balance is too low for this transaction.",
  );
  assert.equal(
    safeError({ shortMessage: "User rejected the request." }),
    "User rejected the request.",
  );
});

// Same vectors as contracts/test/ShieldFtsoV2Oracle.t.sol, so the status page explains a reading
// exactly as ShieldFtsoV2Oracle.price() would judge it.
const now = 1_000_000n,
  maxAge = 300n;
const reading = (value, decimals, timestamp = now) => ({
  value,
  decimals,
  timestamp,
});
test("FTSOv2 readings normalize to six-decimal backing units like the adapter", () => {
  assert.equal(ftsoPrice(reading(639928n, 8), now, maxAge), 6399n);
  assert.equal(ftsoPrice(reading(1313551n, 6), now, maxAge), 1313551n);
  assert.equal(ftsoPrice(reading(12345n, 2), now, maxAge), 123_450000n);
  assert.equal(ftsoPrice(reading(7n, 0), now, maxAge), 7_000000n);
  assert.equal(ftsoPrice(reading(5n, -2), now, maxAge), 500_000000n);
  assert.equal(ftsoPrice(reading(6399280000000000n, 18), now, maxAge), 6399n);
});
test("FTSOv2 readings fail closed with the adapter's reasons", () => {
  const reason = (r) => () => ftsoPrice(r, now, maxAge);
  assert.throws(reason(reading(0n, 8)), /ZERO_PRICE/);
  assert.throws(reason(reading(99n, 8)), /ZERO_PRICE/);
  assert.throws(reason(reading(639928n, 8, 0n)), /INVALID_TIMESTAMP/);
  assert.throws(reason(reading(639928n, 8, now + 1n)), /INVALID_TIMESTAMP/);
  assert.equal(ftsoPrice(reading(639928n, 8, now - 300n), now, maxAge), 6399n);
  assert.throws(reason(reading(639928n, 8, now - 301n)), /STALE_PRICE/);
  assert.throws(reason(reading(639928n, 19)), /FEED_DECIMALS/);
  assert.throws(reason(reading(639928n, -19)), /FEED_DECIMALS/);
});
test("feed values print exactly for any decimal count", () => {
  assert.equal(feedValue(639928n, 8), "0.00639928");
  assert.equal(feedValue(1313551n, 6), "1.313551");
  assert.equal(feedValue(1200n, 2), "12");
  assert.equal(feedValue(5n, -2), "500");
  assert.equal(feedValue(0n, 3), "0");
});
