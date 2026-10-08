"use strict";

/**
 * @typedef {import("../../../shared/types/realtime").Order} Order
 */

/** Seconds a cashier can still tap «Deshacer» after confirming a payment. */
export const UNDO_WINDOW_SECONDS = 5;
/** Idle time on a spotlighted control before it starts pulsing. */
export const HESITATION_MS = 5000;
export const RUSH_TICKET_COUNT = 5;
export const RUSH_LIMIT_SECONDS = 60;

/**
 * @param {Date} [now]
 * @param {{number?: number, id?: string, scale?: number}} [options]
 * @returns {Order}
 */
export function createDemoOrder(now = new Date(), options = {}) {
  const number = options.number ?? 1;
  const id = options.id ?? `demo-order-${String(number).padStart(3, "0")}`;
  const itemScale = options.scale ?? 1 + ((number - 1) % 3);
  // Real menu items at real prices: 3 × $50.00 + 1 × $35.00 = $185.00 per unit of scale.
  const items = [
    {
      menuItemId: "gordita-chicharron",
      name: "Gordita de Chicharrón",
      quantity: 3 * itemScale,
      modifiers: [
        {
          id: "demo-no-cheese",
          name: "Sin queso",
          priceCents: 0,
          available: true,
          kind: "omit",
        },
        {
          id: "demo-extra-salsa",
          name: "Extra salsa",
          priceCents: 0,
          available: true,
          kind: "extra",
        },
      ],
      unitPriceCents: 5000,
      lineTotalCents: 5000 * 3 * itemScale,
    },
    {
      menuItemId: "sope-sencillo",
      name: "Sope Sencillo",
      quantity: 1 * itemScale,
      modifiers: [],
      unitPriceCents: 3500,
      lineTotalCents: 3500 * 1 * itemScale,
    },
  ];
  return {
    id,
    sessionId: "demo-session",
    shiftId: "demo-shift",
    fingerprint: "demo-order",
    number,
    customerName: "María (Demo)",
    status: "review",
    items,
    totalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
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
      id: `demo-payment-${order.id}`,
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

/**
 * @param {Date} [now]
 * @returns {Order[]}
 */
export function createRushOrders(now = new Date()) {
  return Array.from({ length: RUSH_TICKET_COUNT }, (_, index) =>
    createDemoOrder(now, {
      number: index + 1,
      id: `rush-order-${String(index + 1).padStart(3, "0")}`,
    }),
  );
}

/** @param {Order} order @returns {Order} */
export function markDemoNoShow(order) {
  if (order.status !== "review" && order.status !== "ready")
    throw new Error(`Cannot mark demo order ${order.status} as a no-show.`);
  return { ...order, status: "no_show" };
}

/**
 * @param {Date} [now]
 * @returns {Order}
 */
export function createPickyEaterDemoOrder(now = new Date()) {
  const order = createDemoOrder(now, {
    number: 1,
    id: "demo-order-picky-002",
  });
  order.number = 2;
  order.customerName = "Carlos (Sin Queso)";
  return order;
}

/**
 * @param {Date} [now]
 * @returns {Order}
 */
export function createNoShowDemoOrder(now = new Date()) {
  const order = createDemoOrder(now, {
    number: 3,
    id: "demo-order-noshow-003",
  });
  order.customerName = "Roberto (No Llegó)";
  order.status = "ready";
  order.acceptedAt = now.toISOString();
  order.readyAt = now.toISOString();
  return order;
}

/**
 * Calculate client-side practice metrics from completed and active demo orders.
 * Completely immune to polluting data.json.
 *
 * @param {Order[]} completedOrders
 * @returns {{
 *   revenueCents: number,
 *   paidOrders: number,
 *   noShows: number,
 *   voidCount: number,
 *   tenderedCents: number,
 *   changeCents: number,
 *   completedOrders: number,
 *   itemPerformance: Array<{id: string, name: string, quantity: number, revenueCents: number}>
 * }}
 */
export function calculatePracticeMetrics(completedOrders = []) {
  let revenueCents = 0;
  let paidOrders = 0;
  let noShows = 0;
  let tenderedCents = 0;
  let changeCents = 0;
  /** @type {Map<string, {id: string, name: string, quantity: number, revenueCents: number}>} */
  const itemMap = new Map();

  for (const order of completedOrders) {
    if (order.status === "completed" && order.transaction) {
      paidOrders += 1;
      revenueCents += order.transaction.totalCents;
      tenderedCents += order.transaction.tenderedCents;
      changeCents += order.transaction.changeCents;
      for (const item of order.items) {
        const existing = itemMap.get(item.menuItemId) || {
          id: item.menuItemId,
          name: item.name,
          quantity: 0,
          revenueCents: 0,
        };
        existing.quantity += item.quantity;
        existing.revenueCents += item.lineTotalCents;
        itemMap.set(item.menuItemId, existing);
      }
    } else if (order.status === "no_show") {
      noShows += 1;
    }
  }

  return {
    revenueCents,
    paidOrders,
    noShows,
    voidCount: noShows,
    tenderedCents,
    changeCents,
    completedOrders: paidOrders,
    itemPerformance: Array.from(itemMap.values()).sort(
      (a, b) => b.quantity - a.quantity,
    ),
  };
}

/**
 * Decides whether a Lunch Rush attempt earns the «Velocidad de Taquero Experto» badge.
 *
 * Grading policy (decided with the owner): every ticket must be *paid*, so the exam
 * proves the full Aceptar → Lista → Cobrar workflow, inside the time limit. A No-Show
 * ends the rush early but never counts toward passing, and finishing at exactly the
 * time limit still passes.
 *
 * @param {{paid: number, noShows: number, elapsedSeconds: number}} result
 * @returns {boolean}
 */
export function evaluateRush({ paid, noShows, elapsedSeconds }) {
  void noShows;
  return paid >= RUSH_TICKET_COUNT && elapsedSeconds <= RUSH_LIMIT_SECONDS;
}

/** @param {Order} order @returns {boolean} Does the ticket carry a «SIN …» request the cook must read? */
export function needsAcknowledgement(order) {
  return order.items.some((item) =>
    item.modifiers.some((modifier) => modifier.kind === "omit"),
  );
}

/**
 * @param {Order} order
 * @param {Order["status"]} status
 * @param {Date} now
 * @returns {Order}
 */
function inStatus(order, status, now) {
  const at = now.toISOString();
  return {
    ...order,
    status,
    acceptedAt: status === "review" ? null : at,
    readyAt: status === "ready" ? at : null,
  };
}

/**
 * «Conoce tu Tablero»: one ticket in each lane, so every lane and the ticket itself
 * have something to point at.
 * @param {Date} [now]
 * @returns {Order[]}
 */
export function createTourOrders(now = new Date()) {
  return [
    {
      ...createDemoOrder(now, { number: 1, id: "tour-order-001", scale: 1 }),
      customerName: "María (Demo)",
    },
    {
      ...inStatus(
        createDemoOrder(now, { number: 2, id: "tour-order-002", scale: 1 }),
        "cooking",
        now,
      ),
      customerName: "Carlos (Demo)",
    },
    {
      ...inStatus(
        createDemoOrder(now, { number: 3, id: "tour-order-003", scale: 1 }),
        "ready",
        now,
      ),
      customerName: "Lupita (Demo)",
    },
  ];
}

/**
 * «Cobros al Centavo»: a ready ticket of $370.00, big enough that $300 falls short.
 * @param {Date} [now]
 * @returns {Order}
 */
export function createCashDemoOrder(now = new Date()) {
  return {
    ...inStatus(
      createDemoOrder(now, { number: 2, id: "demo-order-cash-002", scale: 2 }),
      "ready",
      now,
    ),
    customerName: "Don Pedro (Demo)",
  };
}

/**
 * «La Cocina al Comal»: three tickets already cooking, without «SIN» requests so the
 * module is about the kitchen view and not about reading badges.
 * @param {Date} [now]
 * @returns {Order[]}
 */
export function createKitchenOrders(now = new Date()) {
  return [
    ["Ana (Demo)", 1],
    ["Luis (Demo)", 2],
    ["Sofía (Demo)", 1],
  ].map(([name, scale], index) => {
    const order = inStatus(
      createDemoOrder(now, {
        number: index + 1,
        id: `kitchen-order-00${index + 1}`,
        scale: Number(scale),
      }),
      "cooking",
      now,
    );
    return {
      ...order,
      customerName: String(name),
      items: order.items.map((item) => ({ ...item, modifiers: [] })),
    };
  });
}

/**
 * Finished tickets for the history and close-out modules: three paid and one No-Show.
 * @param {Date} [now]
 * @returns {Order[]}
 */
export function createHistoryOrders(now = new Date()) {
  const paid = [
    ["Ana (Demo)", 1, 20000],
    ["Luis (Demo)", 2, 50000],
    ["Sofía (Demo)", 1, 20000],
  ].map(([name, scale, tendered], index) => ({
    ...payDemoOrder(
      inStatus(
        createDemoOrder(now, {
          number: index + 1,
          id: `history-order-00${index + 1}`,
          scale: Number(scale),
        }),
        "ready",
        now,
      ),
      Number(tendered),
      now,
    ),
    customerName: String(name),
  }));
  return [
    ...paid,
    {
      ...markDemoNoShow(createNoShowDemoOrder(now)),
      customerName: "Roberto (No Llegó)",
    },
  ];
}
