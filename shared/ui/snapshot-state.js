"use strict";
/** @typedef {import('../types/realtime').Snapshot} Snapshot */
/** A delta carries the full live queue and only newly closed tickets. History
 * remains available for filtering/export, and a shift or access change resets it.
 * @param {Snapshot | null} previous @param {Snapshot} next @returns {Snapshot} */
function mergeDelta(previous, next) {
  if (
    !previous ||
    previous.shiftId !== next.shiftId ||
    previous.staff !== next.staff
  )
    return next;
  if (next.revision < previous.revision) return previous;
  if (!next.completedOrders.length)
    return { ...next, completedOrders: previous.completedOrders };
  const history = new Map(
    previous.completedOrders.map((order) => [order.id, order]),
  );
  for (const order of next.completedOrders) history.set(order.id, order);
  return { ...next, completedOrders: [...history.values()] };
}
module.exports = { mergeDelta };
