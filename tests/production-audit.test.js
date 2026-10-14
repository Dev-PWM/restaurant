"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { parse } = require("@babel/parser");
const path = require("node:path");
const { initialState } = require("../shared/realtime/engine");
const { buildOrder } = require("../artillery/processor.cjs");
const { randomUUID } = require("node:crypto");

test("load fixtures include each dish's required available preparation and masa", () => {
  const s = initialState();
  s.menuItems.forEach((item, i) => {
    const order = buildOrder(
      s.shiftId,
      randomUUID(),
      s.menuItems,
      i,
      s.modifiers,
    );
    const ids = order.items[0].modifierIds;
    for (const kind of ["masa", "prep"]) {
      const options = s.modifiers.filter(
        (m) => m.kind === kind && item.modifierIds.includes(m.id),
      );
      if (options.length)
        assert.equal(
          ids.filter((id) => options.some((m) => m.id === id)).length,
          1,
        );
    }
  });
});

function csvFunctions() {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "../apps/analytics/src/content/realtime/Analytics.tsx",
    ),
    "utf8",
  );
  const start = source.indexOf("function sanitizeItemsSummary(");
  const end = source.indexOf("function exportLedger(", start);
  let code = source.slice(start, end);
  // Remove annotation ranges using the same parser as the regex audit, so this
  // regression also runs on Node versions before stripTypeScriptTypes existed.
  const annotations = [];
  function collect(node) {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "TSTypeAnnotation") {
      annotations.push([node.start, node.end]);
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") collect(value);
    }
  }
  collect(parse(code, { plugins: ["typescript"] }));
  for (const [from, to] of annotations.sort((a, b) => b[0] - a[0]))
    code = code.slice(0, from) + code.slice(to);
  const context = { labels: { completed: "Entregado", no_show: "Anulado" } };
  vm.runInNewContext(code, context);
  return context;
}

test("realtime CSV uses readable dish quantities and exact payment columns", () => {
  const { sanitizeItemsSummary, formatLedgerRow, csvCell } = csvFunctions();
  assert.equal(
    sanitizeItemsSummary([
      { name: "Gordita (Frito) (Quesillo)", quantity: 2 },
      { name: "Agua", quantity: 1 },
    ]),
    "2x Gordita, 1x Agua",
  );
  const cash = {
    number: 1,
    customerName: "Ana",
    status: "completed",
    items: [],
    transaction: {
      method: "cash",
      totalCents: 10010,
      tenderedCents: 20000,
      changeCents: 9990,
    },
  };
  assert.deepEqual(
    [...formatLedgerRow(cash)],
    [1, "Ana", "Entregado", "", "Efectivo", "100.10", "200.00", "99.90"],
  );
  assert.deepEqual(
    [
      ...formatLedgerRow({
        ...cash,
        transaction: { ...cash.transaction, method: "spei" },
      }),
    ].slice(4),
    ["Transferencia", "100.10", "", ""],
  );
  assert.deepEqual(
    [
      ...formatLedgerRow({ ...cash, status: "no_show", transaction: null }),
    ].slice(4),
    ["—", "0.00", "", ""],
  );
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
});

test("CSV cleanup handles long unmatched parentheses without backtracking or dropping the name", () => {
  const { sanitizeItemsSummary } = csvFunctions();
  const name = "Dish " + "(".repeat(100000);
  assert.equal(sanitizeItemsSummary([{ name, quantity: 1 }]), "1x " + name);
});
