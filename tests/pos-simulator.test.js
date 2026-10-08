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

test("tour board has one ticket per lane and the first one carries a «SIN» request", async () => {
  const { createTourOrders, needsAcknowledgement } = await simulator;
  const orders = createTourOrders(new Date("2026-10-05T12:00:00.000Z"));

  assert.deepEqual(
    orders.map((order) => order.status),
    ["review", "cooking", "ready"],
  );
  assert.equal(new Set(orders.map((order) => order.id)).size, 3);
  assert.ok(orders.every((order) => order.totalCents === 18500));
  assert.ok(orders.every(needsAcknowledgement));
  assert.equal(orders[0].acceptedAt, null);
  assert.ok(orders[1].acceptedAt);
  assert.ok(orders[2].readyAt);
});

test("cash demo ticket is big enough that $300 falls short and $500 settles it", async () => {
  const { createCashDemoOrder, payDemoOrder } = await simulator;
  const ready = createCashDemoOrder(new Date("2026-10-05T12:00:00.000Z"));

  assert.equal(ready.status, "ready");
  assert.equal(ready.totalCents, 37000);
  assert.throws(() => payDemoOrder(ready, 30000), /cover the order total/);
  const paid = payDemoOrder(ready, 50000);
  assert.equal(paid.transaction.changeCents, 13000);
  assert.equal(payDemoOrder(ready, 37000).transaction.changeCents, 0);
});

test("kitchen orders are all cooking and have no «SIN» requests to read", async () => {
  const { createKitchenOrders, needsAcknowledgement } = await simulator;
  const orders = createKitchenOrders(new Date("2026-10-05T12:00:00.000Z"));

  assert.equal(orders.length, 3);
  assert.ok(orders.every((order) => order.status === "cooking"));
  assert.ok(orders.every((order) => !needsAcknowledgement(order)));
  assert.equal(new Set(orders.map((order) => order.number)).size, 3);
  assert.equal(new Set(orders.map((order) => order.id)).size, 3);
});

test("history orders give the practice summary known numbers", async () => {
  const { createHistoryOrders, calculatePracticeMetrics } = await simulator;
  const orders = createHistoryOrders(new Date("2026-10-05T12:00:00.000Z"));
  const metrics = calculatePracticeMetrics(orders);

  assert.equal(orders.length, 4);
  assert.equal(metrics.paidOrders, 3);
  assert.equal(metrics.noShows, 1);
  assert.equal(metrics.revenueCents, 74000);
  assert.equal(metrics.tenderedCents, 90000);
  assert.equal(metrics.changeCents, 16000);
  assert.deepEqual(
    metrics.itemPerformance.map((item) => [item.name, item.quantity]),
    [
      ["Gordita de Chicharrón", 12],
      ["Sope Sencillo", 4],
    ],
  );
});

test("practice tables start with one seated table and flip locally without touching the input", async () => {
  const { createPracticeTables, togglePracticeTable } = await simulator;
  const now = new Date("2026-10-05T12:00:00.000Z");
  const tables = createPracticeTables(now);
  assert.deepEqual(
    tables.map(({ number, status }) => [number, status]),
    [[1, "available"], [2, "occupied"], [3, "available"]],
  );
  assert.equal(tables[1].occupiedSince, "2026-10-05T11:35:00.000Z");
  const snapshot = JSON.stringify(tables);

  const seated = togglePracticeTable(tables, 1, now);
  assert.equal(seated[0].status, "occupied");
  assert.equal(seated[0].occupiedSince, now.toISOString());
  const freed = togglePracticeTable(seated, 2, now);
  assert.equal(freed[1].status, "available");
  assert.equal(freed[1].occupiedSince, null);
  // The original array is never mutated, and an unknown table changes nothing.
  assert.equal(JSON.stringify(tables), snapshot);
  assert.equal(togglePracticeTable(tables, 99, now), tables);
});

test("a practice SPEI transfer is the exact total with no change, and counts apart from cash", async () => {
  const { createDemoOrder, payDemoOrder, calculatePracticeMetrics } = await simulator;
  const ready = { ...createDemoOrder(), status: "ready" };
  assert.throws(() => payDemoOrder(ready, ready.totalCents + 1000, new Date(), "spei"), /exact total/);
  const transfer = payDemoOrder(ready, ready.totalCents, new Date(), "spei");
  assert.equal(transfer.transaction.method, "spei");
  assert.equal(transfer.transaction.changeCents, 0);
  const cash = payDemoOrder({ ...ready, id: "demo-order-cash" }, 50000);
  const metrics = calculatePracticeMetrics([transfer, cash]);
  assert.equal(metrics.speiCents, ready.totalCents);
  assert.equal(metrics.speiOrders, 1);
  assert.equal(metrics.cashCents, ready.totalCents);
  assert.equal(metrics.tenderedCents, 50000);
  assert.equal(metrics.revenueCents, metrics.cashCents + metrics.speiCents);
});
