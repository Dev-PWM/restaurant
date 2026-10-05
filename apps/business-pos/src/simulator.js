"use strict";

/**
 * @typedef {import("../../../shared/types/realtime").Order} Order
 */

/** @param {Date} [now] @returns {Order} */
export function createDemoOrder(now = new Date()) {
  return {
    id: "demo-order-001",
    sessionId: "demo-session",
    shiftId: "demo-shift",
    fingerprint: "demo-order",
    number: 1,
    customerName: "María (Demo)",
    status: "review",
    items: [
      {
        menuItemId: "demo-sope-asada",
        name: "Sopes de asada",
        quantity: 2,
        modifiers: [],
        unitPriceCents: 4000,
        lineTotalCents: 8000,
      },
    ],
    totalCents: 8000,
    createdAt: now.toISOString(),
    acceptedAt: null,
    paidAt: null,
    readyAt: null,
    completedAt: null,
    transaction: null,
  };
}

/**
 * @param {Order} order
 * @param {Date} [now]
 * @returns {Order}
 */
export function advanceDemoOrder(order, now = new Date()) {
  if (order.status === "review") {
    return { ...order, status: "cooking", acceptedAt: now.toISOString() };
  }
  if (order.status === "cooking") {
    return { ...order, status: "ready", readyAt: now.toISOString() };
  }
  throw new Error(`Cannot advance demo order from ${order.status}.`);
}

/**
 * @param {Order} order
 * @param {number} tenderedCents
 * @param {Date} [now]
 * @returns {Order}
 */
export function payDemoOrder(order, tenderedCents, now = new Date()) {
  if (order.status !== "ready")
    throw new Error("Only a ready demo order can be paid.");
  if (!Number.isSafeInteger(tenderedCents) || tenderedCents < order.totalCents)
    throw new Error("Demo tender must cover the order total.");
  const paidAt = now.toISOString();
  return {
    ...order,
    status: "completed",
    paidAt,
    completedAt: paidAt,
    transaction: {
      id: "demo-payment-001",
      orderId: order.id,
      paidAt,
      totalCents: order.totalCents,
      tenderedCents,
      changeCents: tenderedCents - order.totalCents,
      method: "cash",
      currency: "MXN",
    },
  };
}

/** @param {Order} order @returns {Order} */
export function markDemoNoShow(order) {
  if (order.status !== "review" && order.status !== "ready")
    throw new Error(`Cannot mark demo order ${order.status} as a no-show.`);
  return { ...order, status: "no_show" };
}
