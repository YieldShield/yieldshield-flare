import test from "node:test";
import assert from "node:assert/strict";
import { createLatestRead } from "../src/lifecycle.mjs";
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test("late background reads cannot overwrite the confirmed position refresh", async () => {
  const gate = createLatestRead(),
    oldRead = deferred(),
    confirmedRead = deferred();
  let displayed = { balance: 0, openPositions: 0 },
    loading = false;
  const refresh = async (request) => {
    const current = gate.begin();
    loading = true;
    const data = await request.promise;
    if (current()) {
      displayed = data;
      loading = false;
    }
  };
  const beforeTx = refresh(oldRead),
    afterTx = refresh(confirmedRead);
  confirmedRead.resolve({ balance: 900, openPositions: 1 });
  await afterTx;
  oldRead.resolve({ balance: 1000, openPositions: 0 });
  await beforeTx;
  assert.deepEqual(displayed, { balance: 900, openPositions: 1 });
  assert.equal(loading, false);
});

import { createReviewScope } from "../src/lifecycle.mjs";
test("approval completed after leaving the route cannot submit the hidden deposit", async () => {
  const scope = createReviewScope();
  scope.update("holder:wrapped:1");
  const assertCurrent = scope.capture(),
    approval = deferred();
  let depositWrites = 0;
  const confirmation = async () => {
    assertCurrent();
    await approval.promise;
    assertCurrent();
    depositWrites++;
  };
  const pending = confirmation();
  scope.dispose();
  approval.resolve();
  await assert.rejects(pending, /left this workflow/);
  assert.equal(depositWrites, 0);
});
test("changing asset away and back cannot resurrect an in-flight quote", () => {
  const scope = createReviewScope();
  scope.update("wrapped");
  const assertCurrent = scope.capture();
  scope.update("vault");
  scope.update("wrapped");
  assert.throws(assertCurrent, /changed/);
});

import { consumeReview } from "../src/lifecycle.mjs";
test("submitted but unknown transactions cannot replay the same reviewed intent", async () => {
  const scope = createReviewScope(),
    assertCurrent = scope.capture(),
    receipt = deferred();
  let broadcasts = 0;
  async function confirm() {
    consumeReview(assertCurrent);
    broadcasts++;
    await receipt.promise;
    throw new Error("Receipt unknown; inspect Activity hash");
  }
  const pending = confirm();
  await assert.rejects(confirm(), /already submitted/);
  assert.equal(broadcasts, 1);
  receipt.resolve();
  await assert.rejects(pending, /Receipt unknown/);
  await assert.rejects(confirm(), /already submitted/);
  assert.equal(broadcasts, 1);
});

test("route change during final timestamp or simulation preflight stops the write", async () => {
  for (const boundary of ["timestamp", "simulation"]) {
    const scope = createReviewScope();
    scope.update("holder:1");
    const assertReview = scope.capture();
    const rpc = deferred();
    let writes = 0;
    const submit = async () => {
      consumeReview(assertReview);
      await rpc.promise;
      assertReview();
      writes++;
    };
    const pending = submit();
    scope.dispose();
    rpc.resolve({ boundary });
    await assert.rejects(pending, /left this workflow/);
    assert.equal(writes, 0, boundary);
  }
});
