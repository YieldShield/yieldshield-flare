import test from "node:test";
import assert from "node:assert/strict";
import {
  exitPreview,
  maxNewFloor,
  minimumOutput,
  safeError,
  WAD,
} from "../src/math.mjs";
test("exits use only realized positive gains and precise units", () => {
  assert.deepEqual(exitPreview(WAD, 25_000000n, 50_000000n), {
    avaxOut: 940000000000000000n,
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
