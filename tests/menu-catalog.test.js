"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const {
  createEngine,
  initialState,
  writeAtomic,
} = require("../shared/realtime/engine");

function directoryFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-menu-"));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return directory;
}
const order = (engine, items) => ({
  orderId: randomUUID(),
  sessionId: randomUUID(),
  shiftId: engine.getState().shiftId,
  customerName: "Ana",
  items,
});
const quote = (engine, items) => {
  const data = order(engine, items);
  engine.dispatch("submit_client_order", data);
  return engine
    .getState()
    .activeOrders.find((candidate) => candidate.id === data.orderId);
};

/** Typed independently of catalog.js: what every dish offers besides its quesillo, as [id, kind, priceCents]. */
const EVERY_DISH_MODIFIERS = [
  ["prep-comal", "prep", 0],
  ["prep-frito", "prep", 0],
  ["omit-cebolla", "omit", 0],
  ["omit-cilantro", "omit", 0],
  ["salsa-roja", "extra", 0],
  ["salsa-verde", "extra", 0],
];

/** Typed from the printed "Los Huaraches de Zapata" menu, independently of shared/realtime/catalog.js. */
const PRINTED_MENU = {
  Huaraches: {
    "huarache-bistec": 9000,
    "huarache-suadero": 9000,
    "huarache-longaniza": 6500,
    "huarache-quesillo": 6500,
    "huarache-pierna": 6000,
    "huarache-salchicha": 6000,
    "huarache-chicharron": 6500,
    "huarache-tinga-pollo": 6500,
    "huarache-tinga-res": 6500,
    "huarache-huevo": 5000,
    "huarache-sencillo": 3500,
  },
  Sopes: {
    "sope-bistec": 5500,
    "sope-suadero": 5500,
    "sope-chicharron": 4500,
    "sope-champinones": 4500,
    "sope-tinga-pollo": 4500,
    "sope-tinga-res": 4500,
    "sope-sencillo": 3500,
  },
  Quesadillas: {
    "quesadilla-queso": 4000,
    "quesadilla-chicharron": 4000,
    "quesadilla-champinones": 4000,
    "quesadilla-tinga-pollo": 4000,
    "quesadilla-tinga-res": 4000,
    "quesadilla-bistec": 5500,
    "quesadilla-longaniza": 5500,
    "quesadilla-suadero": 5500,
  },
  Gorditas: {
    "gordita-suadero": 6500,
    "gordita-chicharron": 5000,
    "gordita-especial": 7500,
  },
  Pambazos: {
    "pambazo-papas-longaniza": 5000,
    "pambazo-guisado": 6000,
  },
  "Especiales de Zapata": {
    "especial-derecho": 13500,
    "especial-izquierdo": 6000,
  },
};
/** Add-on per section: "C/QUESILLO $X EXTRA". */
const QUESILLO = {
  Huaraches: ["quesillo-10", 1000],
  Gorditas: ["quesillo-10", 1000],
  Sopes: ["quesillo-5", 500],
  Quesadillas: ["quesillo-5", 500],
  Pambazos: ["quesillo-5", 500],
  "Especiales de Zapata": null,
};

test("a fresh install seeds exactly the printed menu, in menu order, with whole-peso centavo prices", () => {
  const { menuItems, modifiers } = initialState();
  const expected = Object.entries(PRINTED_MENU).flatMap(([category, rows]) =>
    Object.entries(rows).map(([id, priceCents]) => ({
      id,
      category,
      priceCents,
    })),
  );
  assert.deepEqual(
    menuItems.map(({ id, category, priceCents }) => ({
      id,
      category,
      priceCents,
    })),
    expected,
  );
  assert.equal(menuItems.length, 33);
  assert.equal(new Set(menuItems.map((item) => item.id)).size, 33);
  const known = new Set(modifiers.map((modifier) => modifier.id));
  for (const item of menuItems) {
    assert.ok(Number.isSafeInteger(item.priceCents) && item.priceCents > 0);
    assert.ok(item.name.length > 0 && item.description.length > 0);
    assert.ok(item.available);
    for (const id of item.modifierIds)
      assert.ok(known.has(id), `${item.id} offers unknown modifier ${id}`);
  }
  // Bebidas have no printed price yet, so they must not be invented.
  assert.equal(
    menuItems.some((item) => item.category === "Bebidas"),
    false,
  );
});

test("C/QUESILLO costs $10 on huaraches and gorditas and $5 elsewhere, and cannot cross sections", (t) => {
  const engine = createEngine({ directory: directoryFixture(t) });
  const { menuItems, modifiers } = engine.getState();
  assert.deepEqual(
    modifiers.map(({ id, kind, priceCents }) => [id, kind, priceCents]),
    [
      ["quesillo-10", "extra", 1000],
      ["quesillo-5", "extra", 500],
      ...EVERY_DISH_MODIFIERS,
    ],
  );
  for (const [category, addon] of Object.entries(QUESILLO)) {
    const dishes = menuItems.filter((item) => item.category === category);
    for (const dish of dishes)
      assert.deepEqual(
        dish.modifierIds,
        [...(addon ? [addon[0]] : []), ...EVERY_DISH_MODIFIERS.map(([id]) => id)],
        `${dish.id} add-ons`,
      );
    if (!addon) continue;
    const [dish] = dishes;
    const plain = quote(engine, [
      { menuItemId: dish.id, quantity: 1, modifierIds: ["prep-comal"] },
    ]);
    const withQuesillo = quote(engine, [
      { menuItemId: dish.id, quantity: 1, modifierIds: [addon[0], "prep-comal"] },
    ]);
    assert.equal(plain.totalCents, dish.priceCents);
    assert.equal(withQuesillo.totalCents, dish.priceCents + addon[1]);
    assert.equal(withQuesillo.items[0].name, dish.name);
  }
  const wrongTier = [
    { menuItemId: "huarache-bistec", quantity: 1, modifierIds: ["quesillo-5", "prep-comal"] },
    { menuItemId: "sope-bistec", quantity: 1, modifierIds: ["quesillo-10", "prep-comal"] },
  ];
  for (const line of wrongTier)
    assert.throws(() => quote(engine, [line]), /agotado/);
});

test("unconfirmed specials cannot be ordered until the owner confirms their recipe and price", (t) => {
  const engine = createEngine({ directory: directoryFixture(t) });
  for (const menuItemId of ["especial-derecho", "especial-izquierdo"]) {
    assert.throws(
      () => quote(engine, [{ menuItemId, quantity: 1, modifierIds: ["prep-comal"] }]),
      (error) => error.code === "SPECIAL_UNCONFIRMED",
      menuItemId,
    );
  }
  assert.equal(
    quote(engine, [{ menuItemId: "huarache-bistec", quantity: 1, modifierIds: ["prep-comal"] }]).totalCents,
    9000,
  );
});

test("a dish that offers a masa choice still requires exactly one available masa", (t) => {
  const directory = directoryFixture(t);
  const seed = initialState();
  for (const [id, name] of [
    ["white", "Masa Blanca"],
    ["blue", "Masa Azul"],
  ])
    seed.modifiers.push({ id, name, priceCents: 0, available: true, kind: "masa" });
  seed.menuItems.push({
    id: "huarache-masa",
    name: "Huarache con masa a elegir",
    description: "Fixture dish that offers a masa choice.",
    category: "Huaraches",
    priceCents: 8500,
    available: true,
    modifierIds: ["white", "blue", "quesillo-10"],
  });
  writeAtomic(path.join(directory, "data.json"), seed);
  const engine = createEngine({ directory });
  const line = (modifierIds) => [
    { menuItemId: "huarache-masa", quantity: 1, modifierIds },
  ];
  assert.throws(() => quote(engine, line([])), /masa/);
  assert.throws(() => quote(engine, line(["quesillo-10"])), /masa/);
  assert.throws(() => quote(engine, line(["white", "blue"])), /masa/);
  assert.equal(quote(engine, line(["blue", "quesillo-10"])).totalCents, 9500);
  engine.dispatch("admin_toggle_stock", {
    kind: "modifier",
    id: "blue",
    available: false,
  });
  assert.throws(() => quote(engine, line(["blue"])), /agotado/);
  assert.equal(quote(engine, line(["white"])).totalCents, 8500);
});

/** The four-dish placeholder menu that installs made before the real menu still hold, with one paid order. */
function legacyLedger() {
  const state = initialState();
  const dish = (id, name, category, priceCents, modifierIds) => ({
    id,
    name,
    description: "placeholder",
    category,
    priceCents,
    available: true,
    modifierIds,
  });
  const modifier = (id, name, priceCents, kind) => ({
    id,
    name,
    priceCents,
    available: true,
    kind,
  });
  state.menuItems = [
    dish("huarache", "Huarache", "Huaraches", 8500, ["white", "blue", "cheese"]),
    dish("sope", "Sope", "Sopes", 3500, ["white", "blue", "cheese"]),
    dish("pambazo", "Pambazo", "Pambazos", 5000, ["cheese"]),
    dish("agua", "Agua de jamaica", "Bebidas", 3000, []),
  ];
  state.modifiers = [
    modifier("white", "Masa Blanca", 0, "masa"),
    modifier("blue", "Masa Azul", 0, "masa"),
    modifier("cheese", "Extra Queso", 1000, "extra"),
    modifier("avocado", "Extra Aguacate", 1500, "extra"),
    modifier("no-onion", "Sin Cebolla", 0, "omit"),
    modifier("no-cilantro", "Sin Cilantro", 0, "omit"),
  ];
  const at = new Date().toISOString();
  const orderId = randomUUID();
  state.completedOrders.push({
    id: orderId,
    sessionId: randomUUID(),
    shiftId: state.shiftId,
    fingerprint: "legacy",
    number: 1,
    customerName: "Ana",
    status: "completed",
    items: [
      {
        menuItemId: "huarache",
        name: "Huarache",
        quantity: 1,
        modifiers: [],
        unitPriceCents: 8500,
        lineTotalCents: 8500,
      },
    ],
    totalCents: 8500,
    createdAt: at,
    acceptedAt: at,
    paidAt: at,
    readyAt: at,
    completedAt: at,
    transaction: {
      id: randomUUID(),
      orderId,
      paidAt: at,
      totalCents: 8500,
      tenderedCents: 10000,
      changeCents: 1500,
      method: "cash",
      currency: "MXN",
    },
  });
  state.nextOrderNumber = 2;
  state.revision = 7;
  return state;
}

test("an untouched placeholder menu is replaced once, keeping history and a byte-for-byte backup", (t) => {
  const directory = directoryFixture(t);
  const file = path.join(directory, "data.json");
  writeAtomic(file, legacyLedger());
  const original = fs.readFileSync(file, "utf8");

  const engine = createEngine({ directory });
  const state = engine.getState();
  assert.equal(state.menuItems.length, 33);
  assert.deepEqual(
    state.modifiers.map((modifier) => modifier.id),
    ["quesillo-10", "quesillo-5", ...EVERY_DISH_MODIFIERS.map(([id]) => id)],
  );
  assert.equal(state.menuItems.some((item) => item.id === "agua"), false);
  assert.equal(state.revision, 8);
  // Paid history keeps the names and prices that were true when the cash was taken.
  assert.equal(state.completedOrders[0].items[0].name, "Huarache");
  assert.equal(state.salesMetrics.revenueCents, 8500);
  assert.equal(state.shiftId, JSON.parse(original).shiftId);
  assert.equal(
    engine.menuBackup,
    path.join(directory, "data.before-zapata-menu-r7.json"),
  );
  assert.equal(fs.readFileSync(engine.menuBackup, "utf8"), original);
  assert.equal(fs.statSync(engine.menuBackup).mode & 0o777, 0o600);

  // The swap is durable and happens once: a restart neither repeats it nor rewrites the backup.
  const restarted = createEngine({ directory });
  assert.equal(restarted.menuBackup, null);
  assert.equal(restarted.getState().revision, 8);
  assert.deepEqual(restarted.getState().menuItems, state.menuItems);
  assert.equal(fs.readFileSync(engine.menuBackup, "utf8"), original);
});

test("a menu that is not the untouched placeholder is never overwritten", (t) => {
  const directory = directoryFixture(t);
  const file = path.join(directory, "data.json");
  const edited = legacyLedger();
  edited.menuItems.push({
    id: "tamal",
    name: "Tamal",
    description: "Added by the owner.",
    category: "Tamales",
    priceCents: 2500,
    available: true,
    modifierIds: [],
  });
  writeAtomic(file, edited);
  const original = fs.readFileSync(file, "utf8");
  const engine = createEngine({ directory });
  assert.equal(engine.menuBackup, null);
  assert.deepEqual(
    engine.getState().menuItems.map((item) => item.id),
    ["huarache", "sope", "pambazo", "agua", "tamal"],
  );
  // The owner's dishes are untouched. Only the missing catalog modifiers were added, and the old ledger was kept.
  assert.equal(engine.getState().revision, 8);
  assert.deepEqual(
    engine.getState().menuItems.map((item) => item.modifierIds),
    edited.menuItems.map((item) => item.modifierIds),
  );
  assert.equal(
    fs.readFileSync(engine.catalogBackup, "utf8"),
    original,
  );
  assert.deepEqual(
    fs.readdirSync(directory).filter((name) => name.includes("before-zapata")),
    [],
  );
});

test("a failed menu swap leaves the ledger untouched and the next start retries it", (t) => {
  const directory = directoryFixture(t);
  const file = path.join(directory, "data.json");
  writeAtomic(file, legacyLedger());
  const original = fs.readFileSync(file, "utf8");
  assert.throws(
    () =>
      createEngine({
        directory,
        persist: () => {
          throw new Error("disk full");
        },
      }),
    /disk full/,
  );
  assert.equal(fs.readFileSync(file, "utf8"), original);
  // The failed attempt may already have copied the backup; the retry must still end with the true pre-swap bytes.
  fs.writeFileSync(
    path.join(directory, "data.before-zapata-menu-r7.json"),
    "stale leftover",
  );
  const retried = createEngine({ directory });
  assert.equal(retried.getState().menuItems.length, 33);
  assert.equal(fs.readFileSync(retried.menuBackup, "utf8"), original);
});

test("every catalog dish requires exactly one of comal or frito, never defaults, and toppings are free", (t) => {
  const engine = createEngine({ directory: directoryFixture(t) });
  const line = (modifierIds, menuItemId = "sope-bistec") => [
    { menuItemId, quantity: 1, modifierIds },
  ];
  assert.throws(() => quote(engine, line([])), /comal o frito/);
  assert.throws(() => quote(engine, line(["omit-cebolla"])), /comal o frito/);
  assert.throws(
    () => quote(engine, line(["prep-comal", "prep-frito"])),
    /comal o frito/,
  );
  // The cooking choice remains required on orderable dishes.
  const comal = quote(engine, line(["prep-comal"]));
  const frito = quote(engine, line(["prep-frito"]));
  assert.equal(comal.totalCents, 5500);
  assert.equal(frito.totalCents, 5500);
  const loaded = quote(
    engine,
    line([
      "prep-frito",
      "omit-cebolla",
      "omit-cilantro",
      "salsa-roja",
      "salsa-verde",
    ]),
  );
  assert.equal(loaded.totalCents, 5500, "toppings and salsas never cost extra");
  assert.deepEqual(
    loaded.items[0].modifiers.map((modifier) => modifier.kind).sort(),
    ["extra", "extra", "omit", "omit", "prep"],
  );
  // Running out of one way to cook it leaves the other available.
  engine.dispatch("admin_toggle_stock", {
    kind: "modifier",
    id: "prep-frito",
    available: false,
  });
  assert.throws(() => quote(engine, line(["prep-frito"])), /agotado/);
  assert.equal(quote(engine, line(["prep-comal"])).totalCents, 5500);
});

/** A ledger as the previous build saved it: the printed menu, quesillo only, owner edits, and real history. */
function previousBuildLedger() {
  const state = initialState();
  state.modifiers = state.modifiers.filter((modifier) =>
    modifier.id.startsWith("quesillo"),
  );
  for (const item of state.menuItems)
    item.modifierIds = item.modifierIds.filter((id) => id.startsWith("quesillo"));
  // Owner edits that must survive: a dish and a modifier switched off, and a dish added by hand.
  state.menuItems.find((item) => item.id === "sope-bistec").available = false;
  state.modifiers.find((modifier) => modifier.id === "quesillo-5").available = false;
  state.menuItems.push({
    id: "tamal-de-rajas",
    name: "Tamal de rajas",
    description: "Added by the owner.",
    category: "Especiales de Zapata",
    priceCents: 2500,
    available: true,
    modifierIds: ["quesillo-5"],
  });
  const at = new Date().toISOString();
  const line = {
    menuItemId: "huarache-bistec",
    name: "Huarache de Bistec",
    quantity: 1,
    modifiers: [],
    unitPriceCents: 9000,
    lineTotalCents: 9000,
  };
  const base = {
    sessionId: randomUUID(),
    shiftId: state.shiftId,
    fingerprint: "before-comal-frito",
    customerName: "Ana",
    items: [line],
    totalCents: 9000,
    createdAt: at,
    paidAt: null,
    readyAt: null,
    completedAt: null,
    transaction: null,
  };
  const paidId = randomUUID();
  state.activeOrders.push({
    ...base,
    id: randomUUID(),
    number: 2,
    status: "review",
    acceptedAt: null,
  });
  state.completedOrders.push({
    ...base,
    id: paidId,
    number: 1,
    status: "completed",
    acceptedAt: at,
    paidAt: at,
    readyAt: at,
    completedAt: at,
    transaction: {
      id: randomUUID(),
      orderId: paidId,
      paidAt: at,
      totalCents: 9000,
      tenderedCents: 10000,
      changeCents: 1000,
      method: "cash",
      currency: "MXN",
    },
  });
  state.nextOrderNumber = 3;
  state.revision = 12;
  return state;
}

test("a ledger from before comal/frito gains the new choices without losing owner edits or history", (t) => {
  const directory = directoryFixture(t);
  const file = path.join(directory, "data.json");
  writeAtomic(file, previousBuildLedger());
  const original = fs.readFileSync(file, "utf8");
  const before = JSON.parse(original);

  const engine = createEngine({ directory });
  const state = engine.getState();
  const everyDish = EVERY_DISH_MODIFIERS.map(([id]) => id);

  assert.equal(state.revision, 13);
  assert.equal(
    engine.catalogBackup,
    path.join(directory, "data.before-catalog-r12.json"),
  );
  assert.equal(fs.readFileSync(engine.catalogBackup, "utf8"), original);
  assert.equal(fs.statSync(engine.catalogBackup).mode & 0o777, 0o600);
  assert.equal(engine.menuBackup, null);

  // Every printed dish now offers the new choices after its quesillo; the owner's own dish is left alone.
  for (const item of state.menuItems.filter((candidate) => candidate.id !== "tamal-de-rajas"))
    assert.deepEqual(
      item.modifierIds,
      [...before.menuItems.find((saved) => saved.id === item.id).modifierIds, ...everyDish],
      item.id,
    );
  assert.deepEqual(
    state.menuItems.find((item) => item.id === "tamal-de-rajas").modifierIds,
    ["quesillo-5"],
  );

  // Switches the owner flipped, and all money history, are exactly as they were.
  assert.equal(state.menuItems.find((item) => item.id === "sope-bistec").available, false);
  assert.equal(state.modifiers.find((modifier) => modifier.id === "quesillo-5").available, false);
  assert.deepEqual(
    state.modifiers.map((modifier) => modifier.id),
    ["quesillo-10", "quesillo-5", ...everyDish],
  );
  assert.deepEqual(
    state.completedOrders.map(({ transaction, totalCents, items }) => ({ transaction, totalCents, items })),
    before.completedOrders.map(({ transaction, totalCents, items }) => ({ transaction, totalCents, items })),
  );
  assert.deepEqual(
    state.activeOrders.map((order) => [order.id, order.status, order.totalCents]),
    before.activeOrders.map((order) => [order.id, order.status, order.totalCents]),
  );
  assert.equal(state.salesMetrics.revenueCents, 9000);
  assert.equal(state.shiftId, before.shiftId);

  // The old order can still be cooked and paid, and new orders use the new rules.
  const [waiting] = state.activeOrders;
  engine.dispatch("pos_update_status", { orderId: waiting.id, status: "cooking" });
  engine.dispatch("pos_update_status", { orderId: waiting.id, status: "ready" });
  engine.dispatch("pos_order_paid", { orderId: waiting.id, tenderedCents: 10000 });
  assert.equal(engine.getState().salesMetrics.revenueCents, 18000);
  assert.throws(
    () => quote(engine, [{ menuItemId: "huarache-bistec", quantity: 1, modifierIds: [] }]),
    /comal o frito/,
  );
  // A dish the owner made offers no cooking choice, so it is ordered without one.
  assert.equal(
    quote(engine, [{ menuItemId: "tamal-de-rajas", quantity: 1, modifierIds: [] }]).totalCents,
    2500,
  );

  // Durable and one-time: a restart neither repeats the migration nor rewrites the backup.
  const revision = engine.getState().revision;
  const restarted = createEngine({ directory });
  assert.equal(restarted.catalogBackup, null);
  assert.equal(restarted.getState().revision, revision);
  assert.equal(
    fs.readFileSync(path.join(directory, "data.before-catalog-r12.json"), "utf8"),
    original,
  );
});

test("a failed catalog upgrade leaves the saved ledger untouched and the next start retries it", (t) => {
  const directory = directoryFixture(t);
  const file = path.join(directory, "data.json");
  writeAtomic(file, previousBuildLedger());
  const original = fs.readFileSync(file, "utf8");
  assert.throws(
    () =>
      createEngine({
        directory,
        persist: () => {
          throw Object.assign(new Error("full"), { code: "ENOSPC" });
        },
      }),
    /full/,
  );
  assert.equal(fs.readFileSync(file, "utf8"), original);
  const retried = createEngine({ directory });
  assert.equal(retried.getState().revision, 13);
  assert.equal(
    fs.readFileSync(path.join(directory, "data.before-catalog-r12.json"), "utf8"),
    original,
  );
});
