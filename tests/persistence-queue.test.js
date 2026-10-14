"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  createEngine,
  writeAtomic,
  writeAtomicAsync,
} = require("../shared/realtime/engine");
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-queue-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, engine: createEngine({ directory, ...options }) };
}
const orderFor = (e) => ({
  orderId: randomUUID(),
  sessionId: randomUUID(),
  shiftId: e.getState().shiftId,
  customerName: "Queue QA",
  items: [
    { menuItemId: "huarache-bistec", quantity: 1, modifierIds: ["prep-comal"] },
  ],
});

test("queued writes publish nothing before durability and snapshot the caller's payload", async (t) => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { engine } = fixture(t, {
    persistAsync: async (file, state) => {
      await gate;
      await writeAtomicAsync(file, state);
    },
  });
  const input = orderFor(engine);
  const operation = engine.dispatchAsync("submit_client_order", input);
  input.customerName = "Mutated caller";
  await new Promise((r) => setImmediate(r));
  assert.equal(engine.getState().activeOrders.length, 0);
  assert.throws(
    () => engine.dispatch("pos_set_table", { number: 1, status: "occupied" }),
    { code: "COMMAND_PENDING" },
  );
  release();
  assert.equal((await operation).ok, true);
  assert.equal(engine.getState().activeOrders[0].customerName, "Queue QA");
});

test("queued concurrent retries use the latest durable state and never duplicate revenue", async (t) => {
  const { engine, directory } = fixture(t);
  const inputs = Array.from({ length: 20 }, () => orderFor(engine));
  const submitted = await Promise.all(
    inputs.flatMap((input) => [
      engine.dispatchAsync("submit_client_order", input),
      engine.dispatchAsync("submit_client_order", input),
    ]),
  );
  assert.ok(submitted.every((r) => r.ok));
  for (const status of ["cooking", "ready"])
    await Promise.all(
      inputs.map((input) =>
        engine.dispatchAsync("pos_update_status", {
          orderId: input.orderId,
          status,
        }),
      ),
    );
  await Promise.all(
    inputs.flatMap((input, i) =>
      Array.from({ length: 3 }, () =>
        engine.dispatchAsync("pos_order_paid", {
          orderId: input.orderId,
          method: i % 2 ? "spei" : "cash",
          tenderedCents: i % 2 ? 9000 : 10000,
        }),
      ),
    ),
  );
  const s = engine.getState();
  assert.equal(s.completedOrders.length, 20);
  assert.equal(s.salesMetrics.cashCents, 90000);
  assert.equal(s.salesMetrics.speiCents, 90000);
  assert.equal(s.salesMetrics.revenueCents, 180000);
  assert.deepEqual(createEngine({ directory }).getState(), s);
});

test("a disk failure rolls back the queued command without poisoning later safe retries", async (t) => {
  let fail = true;
  const { engine } = fixture(t, {
    persistAsync: async (file, state) => {
      if (fail) throw Object.assign(Error("full"), { code: "ENOSPC" });
      await writeAtomicAsync(file, state);
    },
  });
  const input = orderFor(engine);
  const before = engine.getState();
  await assert.rejects(engine.dispatchAsync("submit_client_order", input), {
    code: "ENOSPC",
  });
  assert.deepEqual(engine.getState(), before);
  fail = false;
  assert.equal(
    (await engine.dispatchAsync("submit_client_order", input)).ok,
    true,
  );
  assert.equal(engine.getState().activeOrders.length, 1);
});

test("shutdown refuses new commands and drains the durable writer before resolving", async (t) => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { engine } = fixture(t, {
    persistAsync: async (file, state) => {
      await gate;
      await writeAtomicAsync(file, state);
    },
  });
  const input = orderFor(engine);
  const operation = engine.dispatchAsync("submit_client_order", input);
  const close = engine.close();
  let closed = false;
  close.then(() => (closed = true));
  await assert.rejects(
    engine.dispatchAsync("submit_client_order", orderFor(engine)),
    { code: "RATE_LIMITED" },
  );
  assert.equal(closed, false);
  release();
  await operation;
  await close;
  assert.equal(closed, true);
});

test("cleanup errors cannot mask the original failed atomic write", (t) => {
  const { directory } = fixture(t);
  const file = path.join(directory, "failed.json");
  const originalWrite = fs.writeFileSync,
    originalRm = fs.rmSync;
  try {
    fs.writeFileSync = () => {
      throw Object.assign(Error("disk full"), { code: "ENOSPC" });
    };
    fs.rmSync = () => {
      throw Object.assign(Error("cleanup permission"), { code: "EACCES" });
    };
    assert.throws(() => writeAtomic(file, {}), { code: "ENOSPC" });
  } finally {
    fs.writeFileSync = originalWrite;
    fs.rmSync = originalRm;
  }
});

test("corrupted ticket numbers, receipt identities and menu IDs fail closed without overwriting evidence", (t) => {
  const { engine, directory } = fixture(t);
  for (let i = 0; i < 2; i++) {
    const input = orderFor(engine);
    engine.dispatch("submit_client_order", input);
    for (const status of ["cooking", "ready"])
      engine.dispatch("pos_update_status", { orderId: input.orderId, status });
    engine.dispatch("pos_order_paid", {
      orderId: input.orderId,
      tenderedCents: 10000,
    });
  }
  const good = engine.getState(),
    file = path.join(directory, "data.json");
  for (const mutate of [
    (s) => (s.completedOrders[1].number = s.completedOrders[0].number),
    (s) => (s.nextOrderNumber = 1),
    (s) =>
      (s.completedOrders[1].transaction.id =
        s.completedOrders[0].transaction.id),
    (s) => s.menuItems.push({ ...s.menuItems[0] }),
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    const bytes = JSON.stringify(bad);
    fs.writeFileSync(file, bytes);
    assert.throws(() => createEngine({ directory }));
    assert.equal(fs.readFileSync(file, "utf8"), bytes);
  }
});

test("asynchronous directory flush uncertainty exposes the committed state and blocks every new mutation", async (t) => {
  const { engine, directory } = fixture(t);
  const input = orderFor(engine),
    open = fs.promises.open;
  try {
    fs.promises.open = async function (...args) {
      const handle = await open.apply(fs.promises, args);
      if (args[0] === directory)
        handle.sync = async () => {
          throw Object.assign(Error("directory flush failed"), { code: "EIO" });
        };
      return handle;
    };
    await assert.rejects(engine.dispatchAsync("submit_client_order", input), {
      code: "PERSISTENCE_UNCERTAIN",
    });
  } finally {
    fs.promises.open = open;
  }
  assert.equal(engine.getState().activeOrders[0].id, input.orderId);
  await assert.rejects(
    engine.dispatchAsync("pos_set_table", { number: 1, status: "occupied" }),
    { code: "PERSISTENCE_UNCERTAIN" },
  );
  const restored = createEngine({ directory });
  assert.deepEqual(restored.getState(), engine.getState());
  assert.equal(
    (await restored.dispatchAsync("submit_client_order", input)).ok,
    true,
  );
  assert.equal(restored.getState().activeOrders.length, 1);
});

test("the writer bounds queued commands and still drains all admitted operations", async (t) => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { engine } = fixture(t, { persistAsync: async () => gate });
  const pending = Array.from({ length: 1000 }, () =>
    engine.dispatchAsync("pos_set_table", { number: 1, status: "occupied" }),
  );
  await assert.rejects(
    engine.dispatchAsync("pos_set_table", { number: 2, status: "occupied" }),
    { code: "RATE_LIMITED" },
  );
  release();
  assert.ok((await Promise.all(pending)).every((reply) => reply.ok));
  assert.equal(
    engine.getState().tables.find((table) => table.number === 2).status,
    "available",
  );
  assert.equal(
    (
      await engine.dispatchAsync("pos_set_table", {
        number: 2,
        status: "occupied",
      })
    ).ok,
    true,
  );
  await engine.close();
});
