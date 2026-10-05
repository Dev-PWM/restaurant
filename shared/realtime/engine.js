// @ts-check
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
/** @typedef {import('../types/realtime').State} State */
/** @typedef {import('../types/realtime').Order} Order */
/** @typedef {import('../types/realtime').SalesMetrics} SalesMetrics */
/** @typedef {import('../types/realtime').Commands} Commands */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** @param {unknown} condition @param {string} message @param {string} [code] @returns {asserts condition} */
function ensure(condition, message, code = "INVALID_INPUT") {
  if (!condition) throw Object.assign(new Error(message), { code });
}
/** @param {number} cents */
function money(cents) {
  ensure(
    Number.isSafeInteger(cents) && cents >= 0 && cents <= 100_000_000,
    "Cantidad inválida. Usa centavos enteros.",
  );
  return cents;
}
/** @param {Order[]} orders @returns {SalesMetrics} */
function metrics(orders) {
  /** @type {SalesMetrics} */
  const result = {
    revenueCents: 0,
    cashHeldCents: 0,
    voidCount: 0,
    tenderedCents: 0,
    changeCents: 0,
    paidOrders: 0,
    completedOrders: 0,
    noShows: 0,
    itemPerformance: [],
  };
  const items = new Map();
  for (const order of orders) {
    if (order.status === "no_show") {
      result.noShows++;
      result.voidCount++;
      continue;
    }
    const payment = order.transaction;
    if (!payment) continue;
    result.revenueCents += payment.totalCents;
    result.cashHeldCents += payment.tenderedCents - payment.changeCents;
    result.tenderedCents += payment.tenderedCents;
    result.changeCents += payment.changeCents;
    result.paidOrders++;
    // Performance uses fulfilled sales from the history ledger, while cash totals recognize payment immediately.
    if (order.status !== "completed") continue;
    result.completedOrders++;
    for (const line of order.items) {
      const row = items.get(line.menuItemId) || {
        id: line.menuItemId,
        name: line.name,
        quantity: 0,
        revenueCents: 0,
      };
      row.quantity += line.quantity;
      row.revenueCents += line.lineTotalCents;
      items.set(line.menuItemId, row);
    }
  }
  for (const amount of [
    result.revenueCents,
    result.cashHeldCents,
    result.tenderedCents,
    result.changeCents,
  ])
    ensure(
      Number.isSafeInteger(amount),
      "El total excede el límite seguro. Cierra el turno.",
    );
  result.itemPerformance = [...items.values()].sort(
    (a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name),
  );
  return result;
}
/** @returns {State} */
function initialState() {
  return {
    version: 3,
    shiftId: randomUUID(),
    shiftOpenedAt: new Date().toISOString(),
    revision: 0,
    nextOrderNumber: 1,
    acceptingOrders: true,
    menuItems: [
      {
        id: "huarache",
        name: "Huarache",
        description:
          "Masa recién hecha, frijol, salsa de la casa y queso fresco.",
        category: "Huaraches",
        priceCents: 8500,
        available: true,
        modifierIds: [
          "white",
          "blue",
          "cheese",
          "avocado",
          "no-onion",
          "no-cilantro",
        ],
      },
      {
        id: "sope",
        name: "Sope",
        description: "Un clásico de comal con frijoles, crema y queso fresco.",
        category: "Sopes",
        priceCents: 3500,
        available: true,
        modifierIds: [
          "white",
          "blue",
          "cheese",
          "avocado",
          "no-onion",
          "no-cilantro",
        ],
      },
      {
        id: "pambazo",
        name: "Pambazo",
        description:
          "Pan bañado en guajillo, papa con chorizo, lechuga y crema.",
        category: "Pambazos",
        priceCents: 5000,
        available: true,
        modifierIds: ["cheese", "avocado", "no-onion"],
      },
      {
        id: "agua",
        name: "Agua de jamaica",
        description: "Jamaica de la casa. Fresca, ligera y hecha hoy.",
        category: "Bebidas",
        priceCents: 3000,
        available: true,
        modifierIds: [],
      },
    ],
    modifiers: [
      {
        id: "white",
        name: "Masa Blanca",
        priceCents: 0,
        available: true,
        kind: "masa",
      },
      {
        id: "blue",
        name: "Masa Azul",
        priceCents: 0,
        available: true,
        kind: "masa",
      },
      {
        id: "cheese",
        name: "Extra Queso",
        priceCents: 1000,
        available: true,
        kind: "extra",
      },
      {
        id: "avocado",
        name: "Extra Aguacate",
        priceCents: 1500,
        available: true,
        kind: "extra",
      },
      {
        id: "no-onion",
        name: "Sin Cebolla",
        priceCents: 0,
        available: true,
        kind: "omit",
      },
      {
        id: "no-cilantro",
        name: "Sin Cilantro",
        priceCents: 0,
        available: true,
        kind: "omit",
      },
    ],
    activeOrders: [],
    completedOrders: [],
    salesMetrics: metrics([]),
    closedShifts: [],
  };
}
/** @param {string} file @param {unknown} value */
function writeAtomic(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(value, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, file);
    // Flush the directory entry too: the replacement must survive a power loss.
    try {
      const directoryFd = fs.openSync(path.dirname(file), "r");
      try {
        fs.fsyncSync(directoryFd);
      } finally {
        fs.closeSync(directoryFd);
      }
    } catch (cause) {
      // The rename already happened. Do not treat this as an ordinary rollback.
      throw Object.assign(
        new Error(
          "No se pudo confirmar el guardado. Reinicia el servidor y verifica el pedido antes de volver a cobrar.",
          { cause },
        ),
        { code: "PERSISTENCE_UNCERTAIN" },
      );
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
/** Validate ledger invariants before using a recovery file; never silently replace corrupt cash records.
 * @param {State} s */
function validate(s) {
  ensure(
    s?.version === 3 &&
      UUID.test(s.shiftId) &&
      Number.isSafeInteger(s.revision) &&
      s.revision >= 0 &&
      Number.isSafeInteger(s.nextOrderNumber) &&
      s.nextOrderNumber > 0 &&
      typeof s.acceptingOrders === "boolean",
    "data.json inválido. Restaura un archivo verificado.",
  );
  for (const rows of [
    s.menuItems,
    s.modifiers,
    s.activeOrders,
    s.completedOrders,
    s.closedShifts,
  ])
    ensure(Array.isArray(rows), "Colección de datos inválida.");
  for (const order of [...s.activeOrders, ...s.completedOrders]) {
    if (String(order.status) === "unpaid") order.status = "review";
    if (!Object.hasOwn(order, "acceptedAt"))
      order.acceptedAt =
        order.status === "cooking" || order.status === "ready" ||
        order.status === "completed"
          ? order.paidAt || order.createdAt
          : null;
  }
  for (const item of [...s.menuItems, ...s.modifiers]) {
    money(item.priceCents);
    ensure(
      typeof item.available === "boolean" &&
        typeof item.id === "string" &&
        typeof item.name === "string",
      "Menú inválido.",
    );
  }
  const ids = new Set();
  for (const order of [...s.activeOrders, ...s.completedOrders]) {
    ensure(
      UUID.test(order.id) &&
        UUID.test(order.sessionId) &&
        !ids.has(order.id) &&
        order.shiftId === s.shiftId &&
        Array.isArray(order.items),
      "Pedido inválido o duplicado.",
    );
    ids.add(order.id);
    ensure(
      (s.activeOrders.includes(order)
        ? ["review", "cooking", "ready"]
        : ["completed", "no_show"]
      ).includes(order.status),
      "Estado de pedido inválido.",
    );
    money(order.totalCents);
    for (const line of order.items) {
      money(line.unitPriceCents);
      money(line.lineTotalCents);
      ensure(
        Number.isInteger(line.quantity) &&
          line.quantity > 0 &&
          line.quantity <= 99 &&
          line.unitPriceCents * line.quantity === line.lineTotalCents,
        "Partida inconsistente.",
      );
    }
    ensure(
      order.items.reduce((sum, line) => sum + line.lineTotalCents, 0) ===
        order.totalCents,
      "Total de pedido inconsistente.",
    );
    ensure(
      (order.status !== "completed" || Boolean(order.transaction)) &&
        (!order.transaction ||
          ["cooking", "ready", "completed"].includes(order.status)),
      "Pago y estado inconsistentes.",
    );
    if (order.transaction) {
      const t = order.transaction;
      money(t.totalCents);
      money(t.tenderedCents);
      money(t.changeCents);
      const legacyTipCents = t.tipCents === undefined ? 0 : money(t.tipCents);
      ensure(
        t.orderId === order.id &&
          t.currency === "MXN" &&
          t.totalCents === order.totalCents &&
          t.tenderedCents - t.changeCents === t.totalCents + legacyTipCents &&
          Number.isFinite(Date.parse(t.paidAt)),
        "Recibo de efectivo inconsistente.",
      );
    }
  }
  s.salesMetrics = metrics([...s.activeOrders, ...s.completedOrders]);
  return s;
}
/** @param {{directory: string, persist?: typeof writeAtomic}} options */
function createEngine({ directory, persist = writeAtomic }) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "data.json");
  /** @type {State} */
  let state = fs.existsSync(file)
    ? validate(JSON.parse(fs.readFileSync(file, "utf8")))
    : initialState();
  if (!fs.existsSync(file)) persist(file, state);
  let storageFault = false;
  /** @param {string} destination @param {State} next */
  function save(destination, next) {
    try {
      persist(destination, next);
    } catch (error) {
      if (
        /** @type {{code?: string}} */ (error)?.code === "PERSISTENCE_UNCERTAIN"
      ) {
        storageFault = true;
        if (destination === file) state = next;
      }
      throw error;
    }
  }
  /** @param {Order} order @param {State} next */
  function finish(order, next) {
    next.activeOrders = next.activeOrders.filter((o) => o.id !== order.id);
    next.completedOrders.push(order);
    order.completedAt = new Date().toISOString();
  }
  /** @template {keyof Commands} K @param {K} event @param {Commands[K]} input @returns {import('../types/realtime').Reply} */
  function dispatch(event, input) {
    ensure(
      !storageFault,
      "Guardado pendiente de verificar. Reinicia el servidor y revisa el pedido antes de volver a cobrar.",
      "PERSISTENCE_UNCERTAIN",
    );
    ensure(input && typeof input === "object", "Solicitud inválida.");
    const next = structuredClone(state);
    const at = new Date().toISOString();
    /** @type {import('../types/realtime').Reply} */
    let reply = { ok: true };
    // The event boundary is checked at runtime. Narrowing a generic indexed map needs explicit branch casts.
    if (event === "submit_client_order") {
      const data = /** @type {Commands['submit_client_order']} */ (input);
      ensure(
        UUID.test(data.orderId) &&
          UUID.test(data.sessionId) &&
          UUID.test(data.shiftId),
        "Identificador inválido.",
      );
      ensure(
        typeof data.customerName === "string" &&
          data.customerName.trim().length > 0 &&
          data.customerName.trim().length <= 60 &&
          Array.isArray(data.items) &&
          data.items.length > 0 &&
          data.items.length <= 40,
        "Agrega tu nombre y entre 1 y 40 platillos.",
      );
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            ...data,
            items: data.items.map((line) => {
              ensure(
                Array.isArray(line.modifierIds),
                "Modificadores inválidos.",
              );
              return { ...line, modifierIds: [...line.modifierIds].sort() };
            }),
          }),
        )
        .digest("hex");
      const previous = [...next.activeOrders, ...next.completedOrders].find(
        (o) => o.id === data.orderId,
      );
      if (previous) {
        ensure(
          previous.sessionId === data.sessionId &&
            previous.fingerprint === fingerprint,
          "Este pedido ya existe con otros datos.",
          "ORDER_CONFLICT",
        );
        return { ok: true, orderId: previous.id };
      }
      ensure(
        data.shiftId === state.shiftId,
        "El turno cambió. Revisa el menú y envía un pedido nuevo.",
        "SHIFT_CHANGED",
      );
      ensure(
        next.acceptingOrders,
        "Los pedidos por internet están pausados. Ordena en el mostrador.",
        "ORDERS_PAUSED",
      );
      ensure(
        next.activeOrders.length < 500,
        "La fila está llena. Ordena en el mostrador.",
      );
      const items = data.items.map((line) => {
        const menu = next.menuItems.find((m) => m.id === line.menuItemId);
        ensure(menu?.available, "Un platillo está agotado.", "SOLD_OUT");
        ensure(
          Number.isInteger(line.quantity) &&
            line.quantity >= 1 &&
            line.quantity <= 99 &&
            new Set(line.modifierIds).size === line.modifierIds.length,
          "Cantidad o modificadores inválidos.",
        );
        const modifiers = line.modifierIds.map((id) => {
          const modifier = next.modifiers.find((m) => m.id === id);
          ensure(
            menu.modifierIds.includes(id) && modifier?.available,
            "Un modificador está agotado.",
            "SOLD_OUT",
          );
          return modifier;
        });
        const requiresMasa = menu.modifierIds.some(
          (id) => next.modifiers.find((m) => m.id === id)?.kind === "masa",
        );
        ensure(
          modifiers.filter((m) => m.kind === "masa").length ===
            (requiresMasa ? 1 : 0),
          "Elige un tipo de masa.",
        );
        const unitPriceCents = money(
          menu.priceCents + modifiers.reduce((sum, m) => sum + m.priceCents, 0),
        );
        return {
          menuItemId: menu.id,
          name: menu.name,
          quantity: line.quantity,
          modifiers,
          unitPriceCents,
          lineTotalCents: money(unitPriceCents * line.quantity),
        };
      });
      next.activeOrders.push({
        id: data.orderId,
        sessionId: data.sessionId,
        shiftId: next.shiftId,
        fingerprint,
        number: next.nextOrderNumber++,
        customerName: data.customerName.trim(),
        status: "review",
        items,
        totalCents: money(
          items.reduce((sum, line) => sum + line.lineTotalCents, 0),
        ),
        createdAt: at,
        acceptedAt: null,
        paidAt: null,
        readyAt: null,
        completedAt: null,
        transaction: null,
      });
      reply = { ok: true, orderId: data.orderId };
    } else if (event === "admin_toggle_stock") {
      const data = /** @type {Commands['admin_toggle_stock']} */ (input);
      ensure(
        ["item", "modifier"].includes(data.kind) &&
          typeof data.available === "boolean",
        "Disponibilidad inválida.",
      );
      const item = (
        data.kind === "item" ? next.menuItems : next.modifiers
      ).find((m) => m.id === data.id);
      ensure(item, "Producto no encontrado.");
      item.available = data.available;
    } else if (event === "pos_toggle_accepting_orders") {
      const data = /** @type {Commands['pos_toggle_accepting_orders']} */ (
        input
      );
      ensure(
        typeof data.acceptingOrders === "boolean",
        "Disponibilidad inválida.",
      );
      next.acceptingOrders = data.acceptingOrders;
    } else if (event === "pos_close_shift") {
      const data = /** @type {Commands['pos_close_shift']} */ (input);
      const previous = state.closedShifts.find(
        (s) => s.shiftId === data.shiftId,
      );
      if (previous) return { ok: true, archive: previous.archive };
      ensure(
        data.shiftId === state.shiftId &&
          data.expectedRevision === state.revision,
        "El turno cambió. Revisa los totales antes de cerrar.",
        "SHIFT_CHANGED",
      );
      ensure(
        !state.activeOrders.length,
        "Entrega o marca No-Show todos los pedidos antes de cerrar.",
        "ACTIVE_ORDERS",
      );
      const archive = `archive_${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at))}_${state.shiftId}.json`;
      const archivePath = path.join(directory, archive);
      const archived = {
        ...state,
        salesMetrics: metrics(state.completedOrders),
        closedAt: at,
      };
      // Deterministic name: a crash after archive but before reset may safely retry the same close.
      save(archivePath, archived);
      next.closedShifts.push({ shiftId: state.shiftId, archive, closedAt: at });
      next.shiftId = randomUUID();
      next.shiftOpenedAt = at;
      next.activeOrders = [];
      next.completedOrders = [];
      next.nextOrderNumber = 1;
      next.acceptingOrders = true;
      reply = { ok: true, archive };
    } else {
      const data =
        /** @type {Commands['pos_order_paid'] & Commands['pos_update_status']} */ (
          input
        );
      const order = [...next.activeOrders, ...next.completedOrders].find(
        (o) => o.id === data.orderId,
      );
      ensure(order, "Pedido no encontrado.", "ORDER_NOT_FOUND"      );
      if (event === "pos_order_paid") {
        ensure(
          !Object.hasOwn(data, "tipCents"),
          "Las propinas ya no están disponibles.",
        );
        money(data.tenderedCents);
        if (order.transaction) {
          ensure(
            order.transaction.tenderedCents === data.tenderedCents,
            "El pedido ya fue pagado con otro importe.",
            "PAYMENT_CONFLICT",
          );
          return { ok: true };
        }
        ensure(order.status === "ready", "Solo puedes cobrar un pedido listo para entregar.");
        ensure(
          data.tenderedCents >= order.totalCents,
          "El efectivo no cubre el total.",
        );
        order.transaction = {
          id: randomUUID(),
          orderId: order.id,
          paidAt: at,
          totalCents: order.totalCents,
          tenderedCents: data.tenderedCents,
          changeCents: data.tenderedCents - order.totalCents,
          method: "cash",
          currency: "MXN",
        };
        order.status = "completed";
        order.paidAt = at;
        finish(order, next);
      } else if (event === "pos_mark_noshow") {
        if (order.status === "no_show") return { ok: true };
        ensure(
          ["review", "ready"].includes(order.status) &&
            !order.transaction,
          "Solo puedes anular pedidos sin cobrar que estén en revisión o listos para recoger.",
        );
        order.status = "no_show";
        finish(order, next);
      } else if (event === "pos_update_status") {
        ensure(
          ["cooking", "ready"].includes(data.status),
          "Estado inválido.",
        );
        if (order.status === data.status) return { ok: true };
        ensure(
          (order.status === "review" && data.status === "cooking") ||
            (order.status === "cooking" && data.status === "ready"),
          "Transición no permitida.",
        );
        order.status = data.status;
        if (data.status === "cooking") order.acceptedAt = at;
        else order.readyAt = at;
      } else throw new Error("Evento no permitido.");
    }
    next.revision++;
    validate(next);
    save(file, next);
    state = next;
    return reply;
  }
  return { getState: () => structuredClone(state), dispatch, file };
}
module.exports = {
  createEngine,
  initialState,
  metrics,
  validate,
  writeAtomic,
  UUID,
  ensure,
};
