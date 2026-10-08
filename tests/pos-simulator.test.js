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
  // Two cash sales ($185 paid with $200, $370 paid with $500) and one $185 transfer.
  assert.equal(metrics.tenderedCents, 70000);
  assert.equal(metrics.changeCents, 14500);
  assert.equal(metrics.cashCents, 55500);
  assert.equal(metrics.speiCents, 18500);
  assert.equal(metrics.speiOrders, 1);
  assert.equal(metrics.cashCents + metrics.speiCents, metrics.revenueCents);
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

test("practice modifiers are exact copies of the real catalog, so the ticket chips render", async () => {
  const { PRACTICE_MODIFIERS, createSpeiDemoOrder, createTagShowcaseOrder, createTimingOrders } =
    await simulator;
  const catalog = require("../shared/realtime/catalog.js");
  const real = (id) => catalog.MODIFIERS.find((modifier) => modifier.id === id);
  for (const modifier of Object.values(PRACTICE_MODIFIERS))
    assert.deepEqual(modifier, real(modifier.id), `${modifier.id} drifted from catalog.js`);
  // Every modifier on every new lesson ticket is one of them, and every dish is a real, correctly priced dish.
  const now = new Date();
  const tickets = [createSpeiDemoOrder(now), createTagShowcaseOrder(now), ...createTimingOrders(now)];
  for (const ticket of tickets)
    for (const item of ticket.items) {
      const dish = catalog.MENU_ITEMS.find((candidate) => candidate.id === item.menuItemId);
      assert.ok(dish, `${item.menuItemId} is not on the real menu`);
      assert.equal(item.name, dish.name);
      for (const modifier of item.modifiers) {
        assert.deepEqual(modifier, real(modifier.id));
        assert.ok(dish.modifierIds.includes(modifier.id), `${dish.id} does not offer ${modifier.id}`);
      }
      const modifiersCents = item.modifiers.reduce((sum, modifier) => sum + modifier.priceCents, 0);
      assert.equal(item.unitPriceCents, dish.priceCents + modifiersCents);
      assert.equal(item.lineTotalCents, item.unitPriceCents * item.quantity);
    }
  for (const ticket of tickets)
    assert.equal(ticket.totalCents, ticket.items.reduce((sum, item) => sum + item.lineTotalCents, 0));
});

test("the SPEI and tag lesson tickets carry exactly what their lessons point at", async () => {
  const { createSpeiDemoOrder, createTagShowcaseOrder, needsAcknowledgement } = await simulator;
  const spei = createSpeiDemoOrder();
  assert.equal(spei.status, "ready");
  assert.equal(spei.paymentIntent, "spei");
  assert.equal(spei.totalCents, 15500);
  assert.equal(needsAcknowledgement(spei), false);
  const tags = createTagShowcaseOrder();
  assert.equal(tags.status, "review");
  assert.equal(tags.orderType, "dine_in");
  assert.equal(tags.paymentIntent, "spei");
  const ids = tags.items.flatMap((item) => item.modifiers.map((modifier) => modifier.id));
  for (const id of ["prep-comal", "prep-frito", "quesillo-10", "omit-cebolla"])
    assert.ok(ids.includes(id), id);
  // The red tag is what the last step of that lesson asks the trainee to read.
  assert.equal(needsAcknowledgement(tags), true);
  const pieces = (id) =>
    tags.items.filter((item) => item.modifiers.some((modifier) => modifier.id === id)).reduce((sum, item) => sum + item.quantity, 0);
  assert.equal(pieces("prep-comal"), 2);
  assert.equal(pieces("prep-frito"), 1);
});

test("timing tickets are oldest first in each lane and sit well inside their colour windows", async () => {
  const { createTimingOrders, needsAcknowledgement } = await simulator;
  const now = new Date("2026-10-05T12:00:00.000Z");
  const orders = createTimingOrders(now);
  const waited = (order) =>
    (now.getTime() - Date.parse(order.status === "cooking" ? order.acceptedAt : order.createdAt)) / 1000;
  // The same limits as the ticket card: review 2 min amber, 3 min red; cooking 5 min amber, 15 min red.
  const windows = { review: [120, 180], cooking: [300, 900] };
  const colour = (order) => {
    const [amber, red] = windows[order.status];
    const seconds = waited(order);
    return seconds > red ? "red" : seconds >= amber ? "amber" : "none";
  };
  const lane = (status) => orders.filter((order) => order.status === status);
  assert.deepEqual(lane("cooking").map(colour), ["red", "amber"]);
  assert.deepEqual(lane("review").map(colour), ["red", "none"]);
  for (const status of ["cooking", "review"])
    assert.deepEqual(
      lane(status).map(waited),
      [...lane(status).map(waited)].sort((a, b) => b - a),
      `${status} lane must be oldest first, because the lesson spotlights the first button`,
    );
  // Nothing changes colour while someone reads the lesson: at least 90 s of margin on every boundary.
  const margin = (order) => {
    const [amber, red] = windows[order.status];
    const seconds = waited(order);
    return colour(order) === "red" ? Infinity : colour(order) === "amber" ? red - seconds : amber - seconds;
  };
  for (const order of orders) assert.ok(margin(order) >= 90, `${order.customerName} changes colour too soon`);
  // No «SIN» tags, so accepting is not held behind the red-tag exercise.
  assert.ok(orders.every((order) => !needsAcknowledgement(order)));
});
