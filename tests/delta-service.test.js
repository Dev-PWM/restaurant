"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { randomUUID } = require("node:crypto");
const { io } = require("socket.io-client");
const { createService } = require("../server");
const { mergeDelta } = require("../shared/ui/snapshot-state");
const waitEvent = (socket, event) =>
  new Promise((resolve, reject) => {
    const fn = (data) => {
      clearTimeout(timer);
      resolve(data);
    };
    const timer = setTimeout(() => {
      socket.off(event, fn);
      reject(Error(`Missing ${event}`));
    }, 3000);
    socket.once(event, fn);
  });
test(
  "wire deltas retain cashier history, expose only owned customer receipts and resync completely",
  { timeout: 15000 },
  async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-delta-"));
    const service = await createService({
      dataDirectory: directory,
      pin: "9276",
    });
    const sockets = [];
    t.after(async () => {
      sockets.forEach((s) => s.close());
      await service.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });
    await new Promise((r) => service.server.listen(0, "127.0.0.1", r));
    async function connect() {
      const socket = io(`http://127.0.0.1:${service.server.address().port}`, {
        autoConnect: false,
        auth: { sessionId: randomUUID(), delta: true },
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      sockets.push(socket);
      const initial = waitEvent(socket, "init_data");
      socket.connect();
      return { socket, state: await initial };
    }
    const staff = await connect(),
      a = await connect(),
      b = await connect();
    const login = waitEvent(staff.socket, "init_data");
    await staff.socket.timeout(3000).emitWithAck("staff_login", "9276");
    staff.state = await login;
    const deltaFrames = [];
    for (const c of [staff, a, b])
      c.socket.on("state_delta", (next) => {
        c.state = mergeDelta(c.state, next);
        if (c === staff) deltaFrames.push(next);
      });
    async function settle(customer) {
      const data = {
        orderId: randomUUID(),
        sessionId: customer.socket.auth.sessionId,
        shiftId: customer.state.shiftId,
        customerName: "Private QA",
        items: [
          {
            menuItemId: "huarache-bistec",
            quantity: 1,
            modifierIds: ["prep-comal"],
          },
        ],
      };
      await customer.socket
        .timeout(3000)
        .emitWithAck("submit_client_order", data);
      for (const status of ["cooking", "ready"])
        await staff.socket
          .timeout(3000)
          .emitWithAck("pos_update_status", { orderId: data.orderId, status });
      await staff.socket
        .timeout(3000)
        .emitWithAck("pos_order_paid", {
          orderId: data.orderId,
          tenderedCents: 10000,
        });
      return data.orderId;
    }
    const first = await settle(a),
      second = await settle(b);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(staff.state.completedOrders.length, 2);
    assert.deepEqual(
      a.state.completedOrders.map((o) => o.id),
      [first],
    );
    assert.deepEqual(
      b.state.completedOrders.map((o) => o.id),
      [second],
    );
    assert.equal(a.state.salesMetrics, null);
    assert.equal(b.state.salesMetrics, null);
    assert.ok(deltaFrames.every((frame) => frame.completedOrders.length <= 1));
    const resync = waitEvent(staff.socket, "init_data");
    staff.socket.emit("request_init");
    const full = await resync;
    assert.equal(full.completedOrders.length, 2);
    assert.equal(full.salesMetrics.revenueCents, 18000);
    const closeDelta = waitEvent(staff.socket, "state_delta");
    await staff.socket
      .timeout(3000)
      .emitWithAck("pos_close_shift", {
        shiftId: full.shiftId,
        expectedRevision: full.revision,
      });
    const newShift = await closeDelta;
    assert.notEqual(newShift.shiftId, full.shiftId);
    assert.equal(mergeDelta(full, newShift).completedOrders.length, 0);
  },
);
