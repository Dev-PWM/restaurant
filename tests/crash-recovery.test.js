"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { fork } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { io } = require("socket.io-client");
const { createService } = require("../server");
const input = (shiftId) => ({
  orderId: randomUUID(),
  sessionId: randomUUID(),
  shiftId,
  customerName: "Crash QA",
  items: [
    { menuItemId: "huarache-bistec", quantity: 1, modifierIds: ["prep-comal"] },
  ],
});
function event(emitter, name, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const done = (...args) => {
      clearTimeout(timer);
      resolve(args);
    };
    const timer = setTimeout(() => {
      emitter.off(name, done);
      reject(Error(`Missing ${name}`));
    }, timeout);
    emitter.once(name, done);
  });
}
async function connect(port) {
  const socket = io(`http://127.0.0.1:${port}`, {
    autoConnect: false,
    auth: { sessionId: randomUUID() },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  const ready = event(socket, "init_data");
  socket.connect();
  const [snapshot] = await ready;
  return { socket, snapshot };
}
for (const stage of ["after_write", "after_rename", "after_commit"]) {
  test(
    `SIGKILL ${stage} preserves acknowledged receipts and retries the uncertain payment once`,
    { timeout: 15000 },
    async (t) => {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), "masaflow-crash-"),
      );
      let resumed;
      const clients = [];
      const child = fork(
        path.join(__dirname, "fixtures/realtime-crash-child.cjs"),
        [directory],
        { stdio: ["ignore", "ignore", "pipe", "ipc"] },
      );
      t.after(async () => {
        for (const c of clients) c.close();
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
        if (resumed) await resumed.close();
        fs.rmSync(directory, { recursive: true, force: true });
      });
      const [ready] = await event(child, "message");
      assert.equal(ready.type, "ready");
      const client = await connect(ready.port);
      clients.push(client.socket);
      await client.socket.timeout(3000).emitWithAck("staff_login", "9276");
      async function createReady() {
        const data = input(client.snapshot.shiftId);
        data.sessionId = client.socket.auth.sessionId;
        assert.equal(
          (
            await client.socket
              .timeout(3000)
              .emitWithAck("submit_client_order", data)
          ).ok,
          true,
        );
        for (const status of ["cooking", "ready"])
          assert.equal(
            (
              await client.socket
                .timeout(3000)
                .emitWithAck("pos_update_status", {
                  orderId: data.orderId,
                  status,
                })
            ).ok,
            true,
          );
        return data;
      }
      const previous = await createReady();
      assert.equal(
        (
          await client.socket
            .timeout(3000)
            .emitWithAck("pos_order_paid", {
              orderId: previous.orderId,
              tenderedCents: 10000,
            })
        ).ok,
        true,
      );
      const uncertain = await createReady();
      const armed = event(child, "message");
      child.send({ type: "arm", stage });
      assert.equal((await armed)[0].type, "armed");
      const stopped = event(child, "exit");
      const ack = client.socket
        .timeout(500)
        .emitWithAck("pos_order_paid", {
          orderId: uncertain.orderId,
          tenderedCents: 10000,
        })
        .catch(() => null);
      const [, signal] = await stopped;
      assert.equal(signal, "SIGKILL");
      assert.equal(await ack, null);
      const saved = JSON.parse(
        fs.readFileSync(path.join(directory, "data.json"), "utf8"),
      );
      assert.ok(
        saved.completedOrders.some(
          (o) => o.id === previous.orderId && o.transaction,
        ),
      );
      resumed = await createService({ dataDirectory: directory, pin: "9276" });
      await new Promise((r) => resumed.server.listen(0, "127.0.0.1", r));
      const fresh = await connect(resumed.server.address().port);
      clients.push(fresh.socket);
      await fresh.socket.timeout(3000).emitWithAck("staff_login", "9276");
      const request = { orderId: uncertain.orderId, tenderedCents: 10000 };
      assert.equal(
        (
          await fresh.socket
            .timeout(3000)
            .emitWithAck("pos_order_paid", request)
        ).ok,
        true,
      );
      assert.equal(
        (
          await fresh.socket
            .timeout(3000)
            .emitWithAck("pos_order_paid", request)
        ).ok,
        true,
      );
      const state = resumed.engine.getState();
      assert.equal(state.completedOrders.length, 2);
      assert.equal(
        new Set(state.completedOrders.map((o) => o.transaction.id)).size,
        2,
      );
      assert.equal(state.salesMetrics.revenueCents, 18000);
      assert.equal(
        fs
          .readdirSync(directory)
          .filter(
            (name) => name.startsWith("data.json.") && name.endsWith(".tmp"),
          ).length,
        0,
      );
    },
  );
}
