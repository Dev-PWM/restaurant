"use strict";
/**
 * Artillery processor for MasaFlow. The first virtual user plays the POS cashier
 * (accept → ready → paid for every ticket that reaches the board); every other
 * one is a phone placing orders. All of them speak the real Socket.io protocol.
 *
 * Why socket.io-client instead of Artillery's built-in `emit` steps: orders must
 * carry the live shiftId (read from init_data), acks have to be timed, and the
 * cashier has to react to whatever tickets arrive.
 *
 * Each virtual phone presents its own address in x-forwarded-for. The server only
 * honors that header from loopback (the same way it trusts the Vite proxy), so the
 * per-IP rate limits are exercised realistically instead of throttling a single IP.
 */
const { randomUUID } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { io } = require("socket.io-client");

const HOLD_MS = Number(process.env.HOLD_SECONDS || 40) * 1000;
const ORDERS_PER_CLIENT = Number(process.env.ORDERS_PER_CLIENT || 1);
const ACK_TIMEOUT_MS = 8000;
let arrivals = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Unique, valid private address per virtual user. */
const address = (n) => `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;

/** @param {string} shiftId @param {string} sessionId @param {{id: string}[]} menuItems @param {number} n */
function buildOrder(shiftId, sessionId, menuItems, n) {
  return {
    orderId: randomUUID(),
    sessionId,
    shiftId,
    customerName: `Carga ${n}`,
    items: [
      {
        menuItemId: menuItems[n % menuItems.length].id,
        quantity: 1 + (n % 3),
        modifierIds: [],
      },
    ],
  };
}

function connect(target, auth, ip) {
  return new Promise((resolve, reject) => {
    const socket = io(target, {
      auth,
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: { "x-forwarded-for": ip },
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("connect timeout"));
    }, 10000);
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.once("init_data", (snapshot) => {
      clearTimeout(timer);
      resolve({ socket, snapshot });
    });
  });
}

/** Emits with an ack, records latency, and counts ok / rejected / timed-out. */
async function timed(socket, event, payload, events, metric) {
  const started = performance.now();
  try {
    const reply = await socket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck(event, payload);
    events.emit("histogram", metric, performance.now() - started);
    events.emit(
      "counter",
      reply.ok ? "masaflow.acked" : "masaflow.rejected",
      1,
    );
    if (!reply.ok)
      events.emit("counter", `masaflow.rejected.${reply.code || "unknown"}`, 1);
    return reply;
  } catch {
    events.emit("counter", "masaflow.ack_timeout", 1);
    return { ok: false, code: "ACK_TIMEOUT" };
  }
}

async function phone(events, n) {
  const target = process.env.LOADTEST_TARGET;
  const sessionId = randomUUID();
  const { socket, snapshot } = await connect(
    target,
    { sessionId, token: "" },
    address(n),
  );
  events.emit("counter", "masaflow.connected", 1);
  const sentAt = new Map();
  socket.on("state_updated", (next) => {
    for (const order of next.activeOrders) {
      const sent = sentAt.get(order.id);
      if (sent === undefined) continue;
      sentAt.delete(order.id);
      events.emit(
        "histogram",
        "masaflow.state_update_ms",
        performance.now() - sent,
      );
    }
  });
  const started = Date.now();
  for (let i = 0; i < ORDERS_PER_CLIENT; i++) {
    await sleep(500 + Math.random() * 2500);
    const order = buildOrder(
      snapshot.shiftId,
      sessionId,
      snapshot.menuItems,
      n + i,
    );
    sentAt.set(order.orderId, performance.now());
    await timed(
      socket,
      "submit_client_order",
      order,
      events,
      "masaflow.submit_ack_ms",
    );
  }
  await sleep(Math.max(0, HOLD_MS - (Date.now() - started)));
  socket.close();
}

async function cashier(events, n) {
  const pin = process.env.MASAFLOW_STAFF_PIN;
  if (!pin)
    throw new Error("MASAFLOW_STAFF_PIN is required for the POS virtual user");
  const { socket } = await connect(
    process.env.LOADTEST_TARGET,
    { sessionId: randomUUID(), token: "" },
    address(n),
  );
  const login = await socket
    .timeout(ACK_TIMEOUT_MS)
    .emitWithAck("staff_login", pin);
  if (!login.ok) throw new Error(`staff login rejected: ${login.error}`);
  const inFlight = new Set();
  const next = { review: "cooking", cooking: "ready" };
  const work = (snapshot) => {
    for (const order of snapshot.activeOrders) {
      const key = `${order.id}:${order.status}`;
      if (inFlight.has(key)) continue;
      inFlight.add(key);
      if (order.status === "ready") {
        const tendered = Math.ceil(order.totalCents / 10000) * 10000;
        void timed(
          socket,
          "pos_order_paid",
          { orderId: order.id, tenderedCents: tendered },
          events,
          "masaflow.pos_ack_ms",
        );
      } else if (next[order.status]) {
        void timed(
          socket,
          "pos_update_status",
          { orderId: order.id, status: next[order.status] },
          events,
          "masaflow.pos_ack_ms",
        );
      }
    }
  };
  // Logging in makes the server send a fresh, staff-scoped init_data.
  socket.on("init_data", work);
  socket.on("state_updated", work);
  await sleep(HOLD_MS + 20000);
  socket.close();
}

/** Artillery flow function: `flow: - function: "virtualUser"`. */
function virtualUser(context, events, done) {
  const n = arrivals++;
  for (const counter of [
    "acked",
    "rejected",
    "ack_timeout",
    "connected",
    "vu_error",
  ])
    events.emit("counter", `masaflow.${counter}`, 0);
  (n === 0 ? cashier(events, n) : phone(events, n)).then(
    () => done(),
    (error) => {
      events.emit("counter", "masaflow.vu_error", 1);
      process.stderr.write(`virtual user ${n} failed: ${error.message}\n`);
      done();
    },
  );
}

module.exports = { virtualUser, address, buildOrder };
