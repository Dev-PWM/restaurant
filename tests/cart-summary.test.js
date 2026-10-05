"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeCart } = require("../shared/ui/cart-summary");

test("customer cart rows, item count, and total use the same priced projection", () => {
  const cart = [
    { menuItemId: "huarache", quantity: 1, modifierIds: ["dough"] },
    { menuItemId: "sope", quantity: 1, modifierIds: [] },
    { menuItemId: "pambazo", quantity: 1, modifierIds: [] },
  ];
  const menuItems = [
    { id: "huarache", name: "Huarache", priceCents: 8500 },
    { id: "sope", name: "Sope", priceCents: 3500 },
    { id: "pambazo", name: "Pambazo", priceCents: 5000 },
  ];
  const modifiers = [{ id: "dough", name: "White Dough", priceCents: 3000 }];

  const summary = summarizeCart(cart, menuItems, modifiers);

  assert.deepEqual(
    summary.lines.map(({ itemName, lineTotalCents }) => ({
      itemName,
      lineTotalCents,
    })),
    [
      { itemName: "Huarache", lineTotalCents: 11500 },
      { itemName: "Sope", lineTotalCents: 3500 },
      { itemName: "Pambazo", lineTotalCents: 5000 },
    ],
  );
  assert.equal(summary.itemCount, 3);
  assert.equal(summary.totalCents, 20000);
  assert.equal(
    summary.totalCents,
    summary.lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
  );
});
