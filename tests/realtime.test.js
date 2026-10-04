"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { io } = require("socket.io-client");
const { createEngine, writeAtomic } = require("../shared/realtime/engine");
const { createService } = require("../server");
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-v3-"));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return { directory, engine: createEngine({ directory, ...options }) };
}
const input = (engine, extra = {}) => ({
  orderId: randomUUID(),
  sessionId: randomUUID(),
  shiftId: engine.getState().shiftId,
  customerName: "Ana",
  items: [
    {
      menuItemId: "huarache",
      quantity: 2,
      modifierIds: ["blue", "cheese", "no-onion"],
    },
  ],
  ...extra,
});
function submit(engine, extra) {
  const data = input(engine, extra);
  engine.dispatch("submit_client_order", data);
  return data;
}
function pay(engine, orderId, tenderedCents = 20000) {
  return engine.dispatch("pos_order_paid", { orderId, tenderedCents });
}
function complete(engine, orderId) {
  engine.dispatch("pos_update_status", { orderId, status: "ready" });
  engine.dispatch("pos_update_status", { orderId, status: "completed" });
}

test("cash is recognized only on payment, exactly once, with server prices and immutable centavos", (t) => {
  const { engine } = fixture(t);
  const order = submit(engine, { totalCents: 1 });
  assert.equal(engine.getState().salesMetrics.revenueCents, 0);
  assert.equal(engine.getState().activeOrders[0].totalCents, 19000);
  assert.throws(() => pay(engine, order.orderId, 18999), /no cubre/);
  assert.throws(() => pay(engine, order.orderId, 20000.5), /centavos/);
  assert.throws(() => pay(engine, order.orderId, "20000"), /centavos/);
  pay(engine, order.orderId);
  const revision = engine.getState().revision;
  pay(engine, order.orderId);
  assert.equal(engine.getState().revision, revision);
  assert.equal(engine.getState().activeOrders[0].status, "cooking");
  const m = engine.getState().salesMetrics;
  assert.equal(m.revenueCents, 19000);
  assert.equal(m.tenderedCents, 20000);
  assert.equal(m.changeCents, 1000);
  assert.equal(m.paidOrders, 1);
  assert.equal(m.itemPerformance.length, 0);
  assert.throws(() => pay(engine, order.orderId, 50000), /otro importe/);
  complete(engine, order.orderId);
  assert.deepEqual(engine.getState().salesMetrics.itemPerformance, [
    { id: "huarache", name: "Huarache", quantity: 2, revenueCents: 19000 },
  ]);
  assert.equal(
    engine.getState().salesMetrics.favoriteCombinations[0].quantity,
    2,
  );
  assert.equal(engine.getState().salesMetrics.revenueCents, 19000);
});
test("no-show leaves the queue, remains in history, never contributes to cash or performance", (t) => {
  const { engine } = fixture(t);
  const order = submit(engine);
  engine.dispatch("pos_mark_noshow", { orderId: order.orderId });
  engine.dispatch("pos_mark_noshow", { orderId: order.orderId });
  const state = engine.getState();
  assert.equal(state.activeOrders.length, 0);
  assert.equal(state.completedOrders.length, 1);
  assert.equal(state.completedOrders[0].status, "no_show");
  assert.equal(state.salesMetrics.noShows, 1);
  assert.equal(state.salesMetrics.revenueCents, 0);
  assert.equal(state.salesMetrics.itemPerformance.length, 0);
  assert.throws(() => pay(engine, order.orderId), /por pagar/);
});
test("transition validation prevents unpaid cooking, skipping handoff, and deleting a paid ticket", (t) => {
  const { engine } = fixture(t);
  const { orderId } = submit(engine);
  assert.throws(
    () => engine.dispatch("pos_update_status", { orderId, status: "ready" }),
    /Transición/,
  );
  pay(engine, orderId);
  assert.throws(
    () =>
      engine.dispatch("pos_update_status", { orderId, status: "completed" }),
    /Transición/,
  );
  assert.throws(
    () => engine.dispatch("pos_mark_noshow", { orderId }),
    /sin pagar/,
  );
  complete(engine, orderId);
  complete(engine, orderId);
  assert.equal(engine.getState().completedOrders.length, 1);
});
test("order idempotency survives restart, stock changes, and pause; conflicts reject", (t) => {
  const { engine, directory } = fixture(t);
  const order = submit(engine);
  engine.dispatch("admin_toggle_stock", {
    id: "blue",
    kind: "modifier",
    available: false,
  });
  engine.dispatch("pos_toggle_accepting_orders", { acceptingOrders: false });
  const recovered = createEngine({ directory });
  recovered.dispatch("submit_client_order", order);
  assert.equal(recovered.getState().activeOrders.length, 1);
  assert.throws(
    () =>
      recovered.dispatch("submit_client_order", {
        ...order,
        customerName: "Other",
      }),
    /otros datos/,
  );
  assert.throws(
    () => recovered.dispatch("submit_client_order", input(recovered)),
    /tope/,
  );
});
test("sold-out modifiers, missing required masa and malformed carts fail at the server boundary", (t) => {
  const { engine } = fixture(t);
  engine.dispatch("admin_toggle_stock", {
    id: "blue",
    kind: "modifier",
    available: false,
  });
  assert.throws(() => submit(engine), /agotado/);
  engine.dispatch("admin_toggle_stock", {
    id: "blue",
    kind: "modifier",
    available: true,
  });
  for (const items of [
    [],
    [{ menuItemId: "huarache", quantity: 1, modifierIds: [] }],
    [{ menuItemId: "huarache", quantity: -1, modifierIds: ["white"] }],
    [{ menuItemId: "huarache", quantity: 1, modifierIds: ["white", "blue"] }],
    [{ menuItemId: "huarache", quantity: 1, modifierIds: ["white", "hacked"] }],
  ])
    assert.throws(() => submit(engine, { items }));
  engine.dispatch("admin_toggle_stock", {
    id: "huarache",
    kind: "item",
    available: false,
  });
  assert.throws(() => submit(engine), /agotado/);
  assert.equal(engine.getState().activeOrders.length, 0);
});
test("failed durable payment leaves state, revision and receipt unchanged", (t) => {
  let fail = false;
  const { engine, directory } = fixture(t, {
    persist: (file, state) => {
      if (fail) throw Object.assign(new Error("full"), { code: "ENOSPC" });
      writeAtomic(file, state);
    },
  });
  const { orderId } = submit(engine),
    before = engine.getState();
  fail = true;
  assert.throws(() => pay(engine, orderId), /full/);
  assert.deepEqual(engine.getState(), before);
  assert.deepEqual(createEngine({ directory }).getState(), before);
});
test("close shift archives exact paid/no-show totals, resets, preserves menu, and is retry safe", (t) => {
  const { engine, directory } = fixture(t);
  const paid = submit(engine);
  pay(engine, paid.orderId);
  complete(engine, paid.orderId);
  const absent = submit(engine);
  engine.dispatch("pos_mark_noshow", { orderId: absent.orderId });
  engine.dispatch("admin_toggle_stock", {
    kind: "modifier",
    id: "blue",
    available: false,
  });
  const before = engine.getState(),
    request = { shiftId: before.shiftId, expectedRevision: before.revision };
  const result = engine.dispatch("pos_close_shift", request);
  const archive = JSON.parse(
    fs.readFileSync(path.join(directory, result.archive)),
  );
  assert.deepEqual(archive.salesMetrics, before.salesMetrics);
  assert.equal(archive.completedOrders.length, 2);
  const next = engine.getState();
  assert.equal(next.salesMetrics.revenueCents, 0);
  assert.equal(next.completedOrders.length, 0);
  assert.equal(next.activeOrders.length, 0);
  assert.notEqual(next.shiftId, before.shiftId);
  assert.equal(next.modifiers.find((m) => m.id === "blue").available, false);
  const restart = createEngine({ directory });
  const reply = restart.dispatch("pos_close_shift", request);
  assert.equal(reply.archive, result.archive);
  assert.equal(restart.getState().shiftId, next.shiftId);
  assert.throws(
    () => restart.dispatch("submit_client_order", paid),
    /turno cambió/,
  );
});
test("close shift rejects stale totals and active tickets, and never resets after archive/save failure", (t) => {
  let failure = "";
  const { engine } = fixture(t, {
    persist: (file, state) => {
      if (failure && file.endsWith(failure)) throw new Error("disk failure");
      writeAtomic(file, state);
    },
  });
  const order = submit(engine),
    before = engine.getState();
  assert.throws(
    () =>
      engine.dispatch("pos_close_shift", {
        shiftId: before.shiftId,
        expectedRevision: before.revision - 1,
      }),
    /turno cambió/,
  );
  assert.throws(
    () =>
      engine.dispatch("pos_close_shift", {
        shiftId: before.shiftId,
        expectedRevision: before.revision,
      }),
    /todos los pedidos/,
  );
  engine.dispatch("pos_mark_noshow", { orderId: order.orderId });
  const clear = engine.getState();
  failure = `${clear.shiftId}.json`;
  const close = { shiftId: clear.shiftId, expectedRevision: clear.revision };
  assert.throws(() => engine.dispatch("pos_close_shift", close), /disk/);
  assert.deepEqual(engine.getState(), clear);
  failure = "data.json";
  assert.throws(() => engine.dispatch("pos_close_shift", close), /disk/);
  assert.deepEqual(engine.getState(), clear);
  failure = "";
  assert.ok(engine.dispatch("pos_close_shift", close).ok);
});
test("recovery rejects corrupt paid receipts without overwriting the original data", (t) => {
  const { engine, directory } = fixture(t);
  const order = submit(engine);
  pay(engine, order.orderId);
  const corrupt = engine.getState();
  corrupt.activeOrders[0].transaction.changeCents++;
  const file = path.join(directory, "data.json");
  fs.writeFileSync(file, JSON.stringify(corrupt));
  const bytes = fs.readFileSync(file, "utf8");
  assert.throws(() => createEngine({ directory }), /inconsistente/);
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
});
async function serviceFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-socket-"));
  const sockets = [];
  const service = await createService({
    dataDirectory: directory,
    pin: "2468",
  });
  await new Promise((resolve) =>
    service.server.listen(0, "127.0.0.1", resolve),
  );
  t.after(async () => {
    for (const socket of sockets) socket.disconnect();
    await service.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });
  const url = `http://127.0.0.1:${service.server.address().port}`;
  const connect = async (sessionId = randomUUID(), token = "") => {
    const socket = io(url, {
      autoConnect: false,
      auth: { sessionId, token },
      reconnection: false,
    });
    sockets.push(socket);
    const initial = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Initial snapshot timed out")),
        4000,
      );
      socket.once("init_data", (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      socket.once("connect_error", reject);
    });
    socket.connect();
    return { socket, initial: await initial, sessionId };
  };
  return { ...service, url, connect, directory };
}
const ack = (socket, event, data) =>
  socket.timeout(2000).emitWithAck(event, data);
const nextState = (socket) =>
  new Promise((resolve) => socket.once("state_updated", resolve));

test("Socket.io PIN gates every staff event and protects other customers and financial data", async (t) => {
  const { connect, engine, url } = await serviceFixture(t);
  const customer = await connect(),
    outsider = await connect(),
    staff = await connect();
  assert.equal(customer.initial.staff, false);
  assert.equal(customer.initial.salesMetrics, null);
  for (const event of [
    "pos_order_paid",
    "pos_update_status",
    "pos_mark_noshow",
    "admin_toggle_stock",
    "pos_toggle_accepting_orders",
    "pos_close_shift",
  ])
    assert.equal((await ack(customer.socket, event, {})).code, "UNAUTHORIZED");
  assert.equal((await ack(staff.socket, "staff_login", "0000")).ok, false);
  assert.equal((await ack(staff.socket, "staff_login", "2468")).ok, true);
  const order = input(engine, { sessionId: customer.sessionId });
  const staffState = nextState(staff.socket),
    otherState = nextState(outsider.socket);
  assert.equal(
    (await ack(customer.socket, "submit_client_order", order)).ok,
    true,
  );
  assert.equal((await staffState).activeOrders.length, 1);
  const other = await otherState;
  assert.equal(other.activeOrders.length, 0);
  assert.equal(other.salesMetrics, null);
  assert.ok(!JSON.stringify(other).includes("Ana"));
  assert.equal(
    (
      await ack(staff.socket, "pos_order_paid", {
        orderId: order.orderId,
        tenderedCents: 20000,
      })
    ).ok,
    true,
  );
  const response = await fetch(`${url}/api/recent-orders`);
  assert.equal(response.status, 404);
  assert.equal(
    (await fetch(`${url}/api/cash-drawer/kick`, { method: "POST" })).status,
    404,
  );
  assert.equal(
    (
      await ack(customer.socket, "submit_client_order", {
        ...order,
        orderId: randomUUID(),
        sessionId: outsider.sessionId,
      })
    ).ok,
    false,
  );
});
test("reconnect snapshots reconcile missed tickets and menu updates; logout revokes the token", async (t) => {
  const { connect, engine } = await serviceFixture(t);
  const customer = await connect(),
    staff = await connect();
  const login = await ack(staff.socket, "staff_login", "2468");
  const order = input(engine, { sessionId: customer.sessionId });
  await ack(customer.socket, "submit_client_order", order);
  customer.socket.disconnect();
  await ack(staff.socket, "admin_toggle_stock", {
    kind: "modifier",
    id: "blue",
    available: false,
  });
  await ack(staff.socket, "pos_order_paid", {
    orderId: order.orderId,
    tenderedCents: 20000,
  });
  const reconnect = await connect(customer.sessionId);
  assert.equal(reconnect.initial.activeOrders[0].status, "cooking");
  assert.equal(
    reconnect.initial.modifiers.find((m) => m.id === "blue").available,
    false,
  );
  const resumedStaff = await connect(randomUUID(), login.token);
  assert.equal(resumedStaff.initial.staff, true);
  await staff.socket.timeout(2000).emitWithAck("staff_logout");
  assert.equal(
    (
      await ack(resumedStaff.socket, "pos_mark_noshow", {
        orderId: order.orderId,
      })
    ).code,
    "UNAUTHORIZED",
  );
});
test("PIN attempts are bounded across fresh sockets; server refuses missing PIN and concurrent writer", async (t) => {
  await assert.rejects(createService({ pin: "" }), /4 dígitos/);
  const { connect, directory } = await serviceFixture(t);
  await assert.rejects(
    createService({ dataDirectory: directory, pin: "2468" }),
    /in use/,
  );
  const a = await connect();
  for (let i = 0; i < 8; i++)
    assert.equal(
      (await ack(a.socket, "staff_login", "0000")).code,
      "INVALID_PIN",
    );
  const b = await connect();
  assert.equal(
    (await ack(b.socket, "staff_login", "2468")).code,
    "RATE_LIMITED",
  );
});

test("fractional peso prices and modifiers retain every centavo through payment and archive", (t) => {
  const { engine, directory } = fixture(t);
  const seed = engine.getState();
  seed.menuItems[0].priceCents = 8501;
  seed.modifiers.find((m) => m.id === "cheese").priceCents = 1007;
  writeAtomic(path.join(directory, "data.json"), seed);
  const store = createEngine({ directory });
  const order = submit(store);
  pay(store, order.orderId, 20001);
  complete(store, order.orderId);
  const state = store.getState();
  assert.equal(state.salesMetrics.revenueCents, 19016);
  assert.equal(state.salesMetrics.changeCents, 985);
  const result = store.dispatch("pos_close_shift", {
    shiftId: state.shiftId,
    expectedRevision: state.revision,
  });
  const archive = JSON.parse(
    fs.readFileSync(path.join(directory, result.archive)),
  );
  assert.equal(
    archive.salesMetrics.revenueCents + archive.salesMetrics.changeCents,
    archive.salesMetrics.tenderedCents,
  );
});

test("anonymous logout is local and successful PIN entries do not exhaust the failure allowance", async (t) => {
  const { connect } = await serviceFixture(t);
  const customer = await connect(),
    other = await connect();
  let expired = 0;
  other.socket.on("staff_expired", () => expired++);
  await customer.socket.timeout(2000).emitWithAck("staff_logout");
  await other.socket.timeout(2000).emitWithAck("request_init");
  assert.equal(expired, 0);
  for (let i = 0; i < 12; i++)
    assert.equal((await ack(customer.socket, "staff_login", "2468")).ok, true);
});
test("proxy identity trusts only loopback and the last appended, valid client address", () => {
  const { clientAddress } = require("../server");
  assert.equal(
    clientAddress("127.0.0.1", "203.0.113.99, 192.168.1.20"),
    "192.168.1.20",
  );
  assert.equal(clientAddress("192.168.1.20", "203.0.113.99"), "192.168.1.20");
  assert.equal(clientAddress("127.0.0.1", "forged-header"), "127.0.0.1");
  assert.equal(
    clientAddress("::1", "::ffff:192.168.1.21"),
    "::ffff:192.168.1.21",
  );
});

test("keep-the-change tips reconcile separately from revenue, survive restart, and archive then reset", (t) => {
  const { engine, directory } = fixture(t);
  const { orderId } = submit(engine);
  const request = { orderId, tenderedCents: 20000, tipCents: 1000 };
  engine.dispatch("pos_order_paid", request);
  engine.dispatch("pos_order_paid", request);
  let s = engine.getState();
  assert.equal(s.activeOrders[0].transaction.changeCents, 0);
  assert.equal(s.salesMetrics.revenueCents, 19000);
  assert.equal(s.salesMetrics.tipsCents, 1000);
  assert.equal(s.salesMetrics.cashHeldCents, 20000);
  assert.throws(
    () => engine.dispatch("pos_order_paid", { ...request, tipCents: 0 }),
    (error) => error.code === "PAYMENT_CONFLICT",
  );
  const restarted = createEngine({ directory });
  complete(restarted, orderId);
  const noShow = submit(restarted);
  restarted.dispatch("pos_mark_noshow", { orderId: noShow.orderId });
  s = restarted.getState();
  assert.equal(s.salesMetrics.voidCount, 1);
  assert.equal(s.salesMetrics.noShows, 1);
  assert.equal(s.salesMetrics.averageTicketCents, 19000);
  assert.equal(s.salesMetrics.itemPerformance[0].revenueCents, 19000);
  const closed = restarted.dispatch("pos_close_shift", {
    shiftId: s.shiftId,
    expectedRevision: s.revision,
  });
  const archive = JSON.parse(
    fs.readFileSync(path.join(directory, closed.archive)),
  );
  assert.deepEqual(archive.salesMetrics, s.salesMetrics);
  const next = restarted.getState();
  for (const field of [
    "revenueCents",
    "tipsCents",
    "cashHeldCents",
    "voidCount",
  ])
    assert.equal(next.salesMetrics[field], 0);
});
test("partial tips and centavos calculate exact residual change; invalid tips never create a receipt", (t) => {
  const { engine } = fixture(t);
  const { orderId } = submit(engine);
  const before = engine.getState();
  for (const tipCents of [
    -1,
    0.5,
    "500",
    null,
    NaN,
    1002,
    Number.MAX_SAFE_INTEGER,
  ]) {
    assert.throws(() =>
      engine.dispatch("pos_order_paid", {
        orderId,
        tenderedCents: 20001,
        tipCents,
      }),
    );
    assert.deepEqual(engine.getState(), before);
  }
  engine.dispatch("pos_order_paid", {
    orderId,
    tenderedCents: 20001,
    tipCents: 551,
  });
  const t1 = engine.getState().activeOrders[0].transaction;
  assert.equal(t1.changeCents, 450);
  assert.equal(t1.totalCents + t1.tipCents + t1.changeCents, t1.tenderedCents);
});
test("older v3 receipts migrate missing tips to zero and corrupted tip equations fail recovery", (t) => {
  const { engine, directory } = fixture(t);
  const { orderId } = submit(engine);
  pay(engine, orderId);
  const previous = engine.getState();
  delete previous.activeOrders[0].transaction.tipCents;
  writeAtomic(engine.file, previous);
  const restored = createEngine({ directory });
  assert.equal(restored.getState().activeOrders[0].transaction.tipCents, 0);
  assert.equal(restored.getState().salesMetrics.cashHeldCents, 19000);
  const corrupt = restored.getState();
  corrupt.activeOrders[0].transaction.tipCents = 1;
  writeAtomic(engine.file, corrupt);
  assert.throws(() => createEngine({ directory }), /inconsistente/);
});
test("failed tip persistence leaves no cash receipt or kitchen dispatch", (t) => {
  let fail = false;
  const { engine } = fixture(t, {
    persist: (file, state) => {
      if (fail) throw new Error("disk full");
      writeAtomic(file, state);
    },
  });
  const { orderId } = submit(engine);
  const before = engine.getState();
  fail = true;
  assert.throws(
    () =>
      engine.dispatch("pos_order_paid", {
        orderId,
        tenderedCents: 20000,
        tipCents: 1000,
      }),
    /disk full/,
  );
  assert.deepEqual(engine.getState(), before);
});
test("initialization floods are bounded and rejected requests do not broadcast", async (t) => {
  const { connect } = await serviceFixture(t);
  const client = await connect();
  for (let i = 0; i < 60; i++)
    assert.equal(
      (await client.socket.timeout(2000).emitWithAck("request_init")).ok,
      true,
    );
  assert.equal(
    (await client.socket.timeout(2000).emitWithAck("request_init")).code,
    "RATE_LIMITED",
  );
});
test("legacy startup refuses passwordless wildcard network binding", () => {
  const { spawnSync } = require("node:child_process");
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "..", "legacy-server.cjs")],
    {
      env: {
        ...process.env,
        MASAFLOW_HOST: "0.0.0.0",
        MASAFLOW_STAFF_PASSWORD: "",
      },
      encoding: "utf8",
      timeout: 3000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Set MASAFLOW_STAFF_PASSWORD/);
});

test("lunch-rush concurrent retries reconcile 40 tickets without duplicate cash or tips", async (t) => {
  const { connect, engine, directory } = await serviceFixture(t);
  const customer = await connect(),
    staff = await connect();
  assert.equal((await ack(staff.socket, "staff_login", "2468")).ok, true);
  const requests = Array.from({ length: 40 }, (_, i) =>
    input(engine, {
      sessionId: customer.sessionId,
      customerName: `Rush ${i + 1}`,
      items: [
        {
          menuItemId: "huarache",
          quantity: 1,
          modifierIds: ["blue", "cheese"],
        },
      ],
    }),
  );
  const responses = await Promise.all(
    requests.map((data) => ack(customer.socket, "submit_client_order", data)),
  );
  assert.ok(responses.every((reply) => reply.ok));
  assert.equal(engine.getState().activeOrders.length, 40);
  const paid = requests.filter((_, i) => i % 5 !== 0),
    absent = requests.filter((_, i) => i % 5 === 0);
  const payments = await Promise.all(
    paid.flatMap((order) =>
      Array.from({ length: 2 }, () =>
        ack(staff.socket, "pos_order_paid", {
          orderId: order.orderId,
          tenderedCents: 10000,
          tipCents: 500,
        }),
      ),
    ),
  );
  assert.ok(payments.every((reply) => reply.ok));
  for (const status of ["ready", "completed"])
    assert.ok(
      (
        await Promise.all(
          paid.map((order) =>
            ack(staff.socket, "pos_update_status", {
              orderId: order.orderId,
              status,
            }),
          ),
        )
      ).every((reply) => reply.ok),
    );
  assert.ok(
    (
      await Promise.all(
        absent.map((order) =>
          ack(staff.socket, "pos_mark_noshow", { orderId: order.orderId }),
        ),
      )
    ).every((reply) => reply.ok),
  );
  const s = engine.getState();
  assert.equal(s.activeOrders.length, 0);
  assert.equal(s.completedOrders.length, 40);
  assert.equal(s.salesMetrics.revenueCents, 304000);
  assert.equal(s.salesMetrics.tipsCents, 16000);
  assert.equal(s.salesMetrics.cashHeldCents, 320000);
  assert.equal(s.salesMetrics.changeCents, 0);
  assert.equal(s.salesMetrics.paidOrders, 32);
  assert.equal(s.salesMetrics.voidCount, 8);
  assert.deepEqual(
    createEngine({ directory }).getState().salesMetrics,
    s.salesMetrics,
  );
});

test("uncertain directory flush blocks mutations and restart recovers the payment once", (t) => {
  let fail = false;
  const { engine, directory } = fixture(t, {
    persist: (file, state) => {
      writeAtomic(file, state);
      if (fail) throw Object.assign(new Error("flush uncertain"), { code: "PERSISTENCE_UNCERTAIN" });
    },
  });
  const { orderId } = submit(engine);
  fail = true;
  assert.throws(() => pay(engine, orderId), { code: "PERSISTENCE_UNCERTAIN" });
  assert.equal(engine.getState().salesMetrics.revenueCents, 19000);
  assert.throws(() => pay(engine, orderId), { code: "PERSISTENCE_UNCERTAIN" });
  assert.throws(() => submit(engine), { code: "PERSISTENCE_UNCERTAIN" });
  const recovered = createEngine({ directory });
  const before = recovered.getState();
  pay(recovered, orderId);
  assert.deepEqual(recovered.getState(), before);
});

test("uncertain archive flush keeps the active shift and prevents reset until restart", (t) => {
  const { engine, directory } = fixture(t, {
    persist: (file, state) => {
      writeAtomic(file, state);
      if (path.basename(file).startsWith("archive_")) throw Object.assign(new Error("flush uncertain"), { code: "PERSISTENCE_UNCERTAIN" });
    },
  });
  const order = submit(engine);
  engine.dispatch("pos_mark_noshow", { orderId: order.orderId });
  const before = engine.getState();
  const command = { shiftId: before.shiftId, expectedRevision: before.revision };
  assert.throws(() => engine.dispatch("pos_close_shift", command), { code: "PERSISTENCE_UNCERTAIN" });
  assert.deepEqual(engine.getState(), before);
  assert.throws(() => submit(engine), { code: "PERSISTENCE_UNCERTAIN" });
  const recovered = createEngine({ directory });
  assert.equal(recovered.dispatch("pos_close_shift", command).ok, true);
  assert.equal(recovered.getState().completedOrders.length, 0);
});

test("writer lock recovers a recycled current PID but rejects a second live writer", async (t) => {
  const { acquireLock } = require("../shared/realtime/lock");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-lock-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const lock = path.join(directory, ".writer-lock");
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, hostname: os.hostname(), token: randomUUID() }));
  const release = await acquireLock(directory);
  await assert.rejects(acquireLock(directory), { code: "DATA_IN_USE" });
  await release();
  await release();
  const releaseAgain = await acquireLock(directory);
  await assert.rejects(acquireLock(directory), { code: "DATA_IN_USE" });
  await releaseAgain();
});
