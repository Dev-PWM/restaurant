"use strict";
const legacyLineIds = new WeakMap();
let nextLegacyId = 0;
/** Old callers without a client row id still get identity, never position-based keys. */
function lineKey(line) {
  if (line.id) return line.id;
  if (!legacyLineIds.has(line)) legacyLineIds.set(line, `cart-row-${++nextLegacyId}`);
  return legacyLineIds.get(line);
}

/**
 * @typedef {import("../types/realtime").OrderInput["items"][number] & { id?: string }} CartItem
 * @typedef {import("../types/realtime").MenuItem} MenuItem
 * @typedef {import("../types/realtime").Modifier} Modifier
 */

/**
 * @param {CartItem[]} cart
 * @param {MenuItem[]} menuItems
 * @param {Modifier[]} modifiers
 */
function summarizeCart(cart, menuItems, modifiers) {
  const lines = cart.map((line, index) => {
    const item = menuItems.find((entry) => entry.id === line.menuItemId);
    const unitPriceCents =
      (item?.priceCents || 0) +
      line.modifierIds.reduce(
        (sum, id) =>
          sum +
          (modifiers.find((modifier) => modifier.id === id)?.priceCents || 0),
        0,
      );
    return {
      key: lineKey(line),
      index,
      line,
      item,
      itemName: item?.name ?? "Platillo",
      quantity: line.quantity,
      unitPriceCents,
      lineTotalCents: unitPriceCents * line.quantity,
    };
  });
  return {
    lines,
    itemCount: cart.reduce((sum, line) => sum + line.quantity, 0),
    totalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
  };
}

module.exports = { summarizeCart };
