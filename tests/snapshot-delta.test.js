"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { mergeDelta } = require("../shared/ui/snapshot-state");
const base = {
  shiftId: "shift",
  staff: true,
  revision: 4,
  completedOrders: [{ id: "paid-1" }],
  activeOrders: [{ id: "pending" }],
  salesMetrics: { revenueCents: 9000 },
};
test("delta updates retain full historical export data and deduplicate retries", () => {
  const update = {
    ...base,
    revision: 5,
    activeOrders: [],
    completedOrders: [{ id: "paid-2" }],
    salesMetrics: { revenueCents: 18000 },
  };
  const merged = mergeDelta(base, update);
  assert.deepEqual(
    merged.completedOrders.map((o) => o.id),
    ["paid-1", "paid-2"],
  );
  assert.equal(merged.salesMetrics.revenueCents, 18000);
  assert.equal(merged.activeOrders.length, 0);
  assert.deepEqual(mergeDelta(merged, update), merged);
  assert.deepEqual(base.completedOrders, [{ id: "paid-1" }]);
});
test("scope and shift changes discard old staff receipts; stale deltas cannot roll back state", () => {
  const expired = {
    ...base,
    staff: false,
    revision: 5,
    completedOrders: [],
    salesMetrics: null,
  };
  assert.equal(mergeDelta(base, expired), expired);
  const shift = { ...base, shiftId: "next", revision: 5, completedOrders: [] };
  assert.equal(mergeDelta(base, shift), shift);
  assert.equal(mergeDelta(base, { ...base, revision: 3 }), base);
});
