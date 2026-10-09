"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createEngine } = require("../shared/realtime/engine");
const { ownerDescription } = require("../shared/ui/dish-description");

test("printed-menu descriptions only repeat the dish name, so customers do not see them twice", () => {
  const engine = createEngine({
    directory: fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-desc-")),
  });
  for (const item of engine.getState().menuItems) assert.equal(ownerDescription(item), "", item.id);
});

test("a description the owner typed reaches the customer; the automatic one does not", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "masaflow-desc-"));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  const engine = createEngine({ directory });
  const add = (name, description) => {
    const id = randomUUID();
    engine.dispatch("admin_add_menu_item", { id, name, category: "Huaraches", priceCents: 9000, description });
    return engine.getState().menuItems.find((item) => item.id === `custom-${id}`);
  };
  const written = add("Huarache de Costilla", "  Con costilla de res y nopal asado.  ");
  const blank = add("Huarache de Cecina", undefined);
  assert.equal(ownerDescription(written), "Con costilla de res y nopal asado.");
  assert.equal(blank.description, "Platillo especial: Huarache de Cecina");
  assert.equal(ownerDescription(blank), "");
});
