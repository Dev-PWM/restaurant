"use strict";
/** Frozen receipt lines predate per-line IDs. Content identity survives snapshot
 * replacement and reordering, while repeated identical lines get unique IDs.
 * @param {import('../types/realtime').Order} order */
function orderLineRows(order) {
  const copies = new Map();
  return order.items.map((line) => {
    const identity = JSON.stringify([
      order.id,
      line.menuItemId,
      line.name,
      line.quantity,
      line.modifiers,
      line.toppingChoices,
      line.unitPriceCents,
      line.lineTotalCents,
    ]);
    const occurrence = (copies.get(identity) || 0) + 1;
    copies.set(identity, occurrence);
    return { id: `${identity}#${occurrence}`, line };
  });
}
module.exports = { orderLineRows };
