"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { createEngine, validate } = require("../shared/realtime/engine");
const { createService } = require("../server");
const digest = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const input = (engine, item, quantity, modifierIds) => ({
  orderId: randomUUID(),
  sessionId: randomUUID(),
  shiftId: engine.getState().shiftId,
  customerName: "Invariant QA",
  items: [{ menuItemId: item.id, quantity, modifierIds }],
});
test("seeded menu/payment paths keep safe centavos, frozen receipt evidence and reject every stage bypass", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "masaflow-invariants-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const engine = createEngine({ directory, persistAsync: async () => {} });
  let seed = 0x51a3;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  let expectedRevenue = 0,
    expectedCash = 0,
    expectedSpei = 0,
    voids = 0;
  for (let i = 0; i < 60; i++) {
    const s = engine.getState(),
      item = s.menuItems[Math.floor(random() * s.menuItems.length)],
      choices = s.modifiers.filter((m) => item.modifierIds.includes(m.id));
    const ids = [];
    for (const kind of ["masa", "prep"]) {
      const opts = choices.filter((m) => m.kind === kind);
      if (opts.length) ids.push(opts[Math.floor(random() * opts.length)].id);
    }
    for (const modifier of choices.filter((m) =>
      ["omit", "extra"].includes(m.kind),
    ))
      if (random() < 0.3) ids.push(modifier.id);
    const quantity = 1 + Math.floor(random() * 8),
      request = input(engine, item, quantity, ids),
      expected =
        (item.priceCents +
          choices
            .filter((m) => ids.includes(m.id))
            .reduce((n, m) => n + m.priceCents, 0)) *
        quantity;
    assert.equal(
      (
        await engine.dispatchAsync("submit_client_order", {
          ...request,
          totalCents: 1,
        })
      ).ok,
      true,
    );
    const order = engine
      .getState()
      .activeOrders.find((o) => o.id === request.orderId);
    assert.equal(order.totalCents, expected);
    const before = engine.getState();
    await assert.rejects(
      engine.dispatchAsync("pos_order_paid", {
        orderId: order.id,
        tenderedCents: expected,
      }),
    );
    await assert.rejects(
      engine.dispatchAsync("pos_update_status", {
        orderId: order.id,
        status: "completed",
      }),
    );
    assert.deepEqual(engine.getState(), before);
    if (i % 7 === 0) {
      await engine.dispatchAsync("pos_mark_noshow", { orderId: order.id });
      voids++;
    } else {
      for (const status of ["cooking", "ready"])
        await engine.dispatchAsync("pos_update_status", {
          orderId: order.id,
          status,
        });
      const method = i % 2 ? "spei" : "cash",
        tenderedCents =
          method === "spei" ? expected : Math.ceil(expected / 10000) * 10000;
      await engine.dispatchAsync("pos_order_paid", {
        orderId: order.id,
        method,
        tenderedCents,
      });
      const frozen = engine.getState();
      await engine.dispatchAsync("pos_order_paid", {
        orderId: order.id,
        method,
        tenderedCents,
      });
      assert.deepEqual(engine.getState(), frozen);
      expectedRevenue += expected;
      if (method === "cash") expectedCash += expected;
      else expectedSpei += expected;
    }
    const metrics = engine.getState().salesMetrics;
    assert.equal(metrics.revenueCents, expectedRevenue);
    assert.equal(metrics.cashCents, expectedCash);
    assert.equal(metrics.speiCents, expectedSpei);
    assert.equal(metrics.cashCents + metrics.speiCents, metrics.revenueCents);
    assert.equal(metrics.noShows, voids);
    assert.ok(Number.isSafeInteger(metrics.revenueCents));
  }
});

test("a stopped-instance backup restores current receipts and archived shifts byte-for-byte without charging retries", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-restore-")),
    source = path.join(root, "source"),
    backup = path.join(root, "backup"),
    target = path.join(root, "target");
  let service, resumed;
  t.after(async () => {
    if (service) await service.close();
    if (resumed) await resumed.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  service = await createService({ dataDirectory: source, pin: "9276" });
  async function sale() {
    const e = service.engine,
      s = e.getState(),
      item = s.menuItems.find((i) => i.id === "huarache-bistec"),
      o = input(e, item, 1, ["prep-comal"]);
    await e.dispatchAsync("submit_client_order", o);
    for (const status of ["cooking", "ready"])
      await e.dispatchAsync("pos_update_status", {
        orderId: o.orderId,
        status,
      });
    await e.dispatchAsync("pos_order_paid", {
      orderId: o.orderId,
      tenderedCents: 10000,
    });
    return o.orderId;
  }
  await sale();
  let s = service.engine.getState();
  await service.engine.dispatchAsync("pos_close_shift", {
    shiftId: s.shiftId,
    expectedRevision: s.revision,
  });
  const current = await sale();
  const before = service.engine.getState();
  await service.close();
  service = null;
  fs.mkdirSync(backup, { mode: 0o700 });
  fs.mkdirSync(target, { mode: 0o700 });
  const files = fs.readdirSync(source).filter((n) => n.endsWith(".json"));
  assert.equal(files.length, 2);
  for (const name of files) {
    const file = path.join(source, name);
    validate(JSON.parse(fs.readFileSync(file, "utf8")));
    fs.copyFileSync(file, path.join(backup, name));
    fs.chmodSync(path.join(backup, name), 0o600);
    fs.copyFileSync(path.join(backup, name), path.join(target, name));
    assert.equal(digest(file), digest(path.join(target, name)));
  }
  resumed = await createService({ dataDirectory: target, pin: "9276" });
  assert.deepEqual(resumed.engine.getState(), before);
  await resumed.engine.dispatchAsync("pos_order_paid", {
    orderId: current,
    tenderedCents: 10000,
  });
  assert.deepEqual(resumed.engine.getState(), before);
  assert.ok(fs.existsSync(path.join(target, before.closedShifts[0].archive)));
});
