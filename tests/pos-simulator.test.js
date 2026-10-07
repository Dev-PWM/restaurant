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
  assert.equal(review.totalCents, 18500);
  assert.equal(review.items[0].quantity, 3);
  assert.deepEqual(
    review.items[0].modifiers.map((modifier) => modifier.name),
    ["Sin queso", "Extra salsa"],
  );

  const cooking = advanceDemoOrder(review, accepted);
  const ready = advanceDemoOrder(cooking, readyAt);
  const completed = payDemoOrder(ready, 20000, paidAt);

  assert.equal(cooking.status, "cooking");
  assert.equal(ready.status, "ready");
  assert.equal(completed.status, "completed");
  assert.equal(completed.transaction.tenderedCents, 20000);
  assert.equal(completed.transaction.changeCents, 1500);
  assert.equal(review.status, "review");
  assert.equal(review.transaction, null);
});

test("rush challenge creates five distinct local training tickets", async () => {
  const { createRushOrders } = await simulator;
  const orders = createRushOrders(new Date("2026-10-05T12:00:00.000Z"));

  assert.equal(orders.length, 5);
  assert.equal(new Set(orders.map((order) => order.id)).size, 5);
  assert.ok(orders.every((order) => order.status === "review"));
  assert.ok(
    orders.every((order) =>
      order.items[0].modifiers.some(
        (modifier) => modifier.name === "Sin queso",
      ),
    ),
  );
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

test("rush grading requires every ticket paid inside the time limit", async () => {
  const { evaluateRush, RUSH_LIMIT_SECONDS, RUSH_TICKET_COUNT } =
    await simulator;
  assert.equal(RUSH_TICKET_COUNT, 5);
  assert.equal(RUSH_LIMIT_SECONDS, 60);
  assert.equal(evaluateRush({ paid: 5, noShows: 0, elapsedSeconds: 42 }), true);
  assert.equal(
    evaluateRush({ paid: 5, noShows: 0, elapsedSeconds: 60 }),
    true,
    "the time limit is inclusive",
  );
  assert.equal(
    evaluateRush({ paid: 4, noShows: 1, elapsedSeconds: 30 }),
    false,
  );
  assert.equal(
    evaluateRush({ paid: 5, noShows: 0, elapsedSeconds: 61 }),
    false,
  );
});

test("the undo window and hesitation timing match the training spec", async () => {
  const { UNDO_WINDOW_SECONDS, HESITATION_MS } = await simulator;
  assert.equal(UNDO_WINDOW_SECONDS, 5);
  assert.equal(HESITATION_MS, 5000);
});
