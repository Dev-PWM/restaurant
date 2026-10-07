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
    ],
  );
  for (const [category, addon] of Object.entries(QUESILLO)) {
    const dishes = menuItems.filter((item) => item.category === category);
    for (const dish of dishes)
      assert.deepEqual(
        dish.modifierIds,
        addon ? [addon[0]] : [],
        `${dish.id} add-ons`,
      );
    if (!addon) continue;
    const [dish] = dishes;
    const plain = quote(engine, [
      { menuItemId: dish.id, quantity: 1, modifierIds: [] },
    ]);
    const withQuesillo = quote(engine, [
      { menuItemId: dish.id, quantity: 1, modifierIds: [addon[0]] },
    ]);
    assert.equal(plain.totalCents, dish.priceCents);
    assert.equal(withQuesillo.totalCents, dish.priceCents + addon[1]);
    assert.equal(withQuesillo.items[0].name, dish.name);
  }
  const wrongTier = [
    { menuItemId: "huarache-bistec", quantity: 1, modifierIds: ["quesillo-5"] },
    { menuItemId: "sope-bistec", quantity: 1, modifierIds: ["quesillo-10"] },
    { menuItemId: "especial-derecho", quantity: 1, modifierIds: ["quesillo-5"] },
  ];
  for (const line of wrongTier)
    assert.throws(() => quote(engine, [line]), /agotado/);
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
    ["quesillo-10", "quesillo-5"],
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
  const engine = createEngine({ directory });
  assert.equal(engine.menuBackup, null);
  assert.deepEqual(
    engine.getState().menuItems.map((item) => item.id),
    ["huarache", "sope", "pambazo", "agua", "tamal"],
  );
  assert.equal(engine.getState().revision, 7);
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
