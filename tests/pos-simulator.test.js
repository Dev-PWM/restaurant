"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const simulator = import("../apps/business-pos/src/simulator.js");

test("demo order advances and settles entirely as local sample data", async () => {
  const { advanceDemoOrder, createDemoOrder, payDemoOrder } = await simulator;
  const created = new Date("2026-10-05T12:00:00.000Z");
  const accepted = new Date("2026-10-05T12:01:00.000Z");
  const readyAt = new Date("2026-10-05T12:10:00.000Z");
  const paidAt = new Date("2026-10-05T12:11:00.000Z");

  const review = createDemoOrder(created);
  assert.equal(review.status, "review");
  assert.equal(review.totalCents, 8000);
  assert.equal(review.items[0].quantity, 2);

  const cooking = advanceDemoOrder(review, accepted);
  const ready = advanceDemoOrder(cooking, readyAt);
  const completed = payDemoOrder(ready, 20000, paidAt);

  assert.equal(cooking.status, "cooking");
  assert.equal(ready.status, "ready");
  assert.equal(completed.status, "completed");
  assert.equal(completed.transaction.tenderedCents, 20000);
  assert.equal(completed.transaction.changeCents, 12000);
  assert.equal(review.status, "review");
  assert.equal(review.transaction, null);
});

test("demo settlement rejects unpaid and under-tendered orders", async () => {
  const { advanceDemoOrder, createDemoOrder, payDemoOrder } = await simulator;
  const review = createDemoOrder();
  assert.throws(() => payDemoOrder(review, 20000), /ready demo order/);

  const ready = advanceDemoOrder(advanceDemoOrder(review));
  assert.throws(() => payDemoOrder(ready, 7999), /cover the order total/);
  assert.throws(() => advanceDemoOrder(ready), /Cannot advance demo order/);
});

test("demo no-shows remain local and are allowed only before cooking", async () => {
  const { advanceDemoOrder, createDemoOrder, markDemoNoShow } = await simulator;
  const noShow = markDemoNoShow(createDemoOrder());
  assert.equal(noShow.status, "no_show");
  assert.throws(
    () => markDemoNoShow(advanceDemoOrder(createDemoOrder())),
    /Cannot mark demo order cooking/,
  );
});
