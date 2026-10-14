"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { orderLineRows } = require("../shared/ui/order-line-rows");
const line = (prep) => ({
  menuItemId: "huarache",
  name: "Huarache",
  quantity: 1,
  unitPriceCents: 9000,
  lineTotalCents: 9000,
  modifiers: [{ id: prep, name: prep, priceCents: 0, kind: "prep" }],
});
test("receipt row identity survives cloned snapshots and dish reordering", () => {
  const order = { id: "ticket-a", items: [line("comal"), line("frito")] };
  const initial = orderLineRows(order).map((row) => row.id);
  assert.deepEqual(
    orderLineRows(JSON.parse(JSON.stringify(order))).map((row) => row.id),
    initial,
  );
  assert.deepEqual(
    orderLineRows({ ...order, items: [...order.items].reverse() }).map(
      (row) => row.id,
    ),
    initial.toReversed(),
  );
});
test("identical receipt lines remain unique without positional React keys", () => {
  const item = line("comal"),
    order = {
      id: "ticket-a",
      items: [item, structuredClone(item), line("frito")],
    };
  const rows = orderLineRows(order);
  assert.equal(new Set(rows.map((row) => row.id)).size, 3);
  assert.deepEqual(
    orderLineRows(structuredClone(order)).map((row) => row.id),
    rows.map((row) => row.id),
  );
  assert.notEqual(
    orderLineRows({ ...order, id: "ticket-b" })[0].id,
    rows[0].id,
  );
});
