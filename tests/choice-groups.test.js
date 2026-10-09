"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { MODIFIERS } = require("../shared/realtime/catalog");
const {
  groupChoices,
  toppingName,
  toppingChoicesFor,
  specialLabel,
} = require("../shared/ui/choice-groups");

const modifier = (id) => MODIFIERS.find((candidate) => candidate.id === id);
const pick = (...ids) => ids.map(modifier);

test("a line's choices are grouped the way a cook reads them", () => {
  const groups = groupChoices(
    pick(
      "salsa-verde",
      "omit-cilantro",
      "estilo-izquierdo",
      "prep-frito",
      "omit-cebolla",
      "quesillo-10",
    ),
  );
  assert.equal(groups.prep.id, "prep-frito");
  assert.equal(groups.special.id, "estilo-izquierdo");
  assert.equal(groups.masa, null);
  assert.deepEqual(
    groups.without.map((m) => m.id),
    ["omit-cilantro", "omit-cebolla"],
  );
  assert.deepEqual(
    groups.extras.map((m) => m.id),
    ["salsa-verde", "quesillo-10"],
  );
});

test("a dish with no choices yields empty groups, not errors", () => {
  assert.deepEqual(groupChoices([]), {
    prep: null,
    special: null,
    masa: null,
    without: [],
    extras: [],
  });
});

test("toppings read as plain words, and quesillo on top of ¡Derecho! is a double portion", () => {
  assert.equal(specialLabel(modifier("estilo-izquierdo")), "Nopales");
  assert.equal(specialLabel(modifier("estilo-derecho")), "Cecina");
  assert.equal(toppingName(modifier("omit-cebolla")), "cebolla");
  assert.equal(toppingName(modifier("salsa-roja")), "salsa roja");
  assert.equal(toppingName(modifier("quesillo-5")), "quesillo extra");
  assert.equal(
    toppingName(modifier("quesillo-5"), modifier("estilo-derecho")),
    "quesillo doble",
  );
  // ¡Izquierdo! has no quesillo of its own (it has queso), so a quesillo there is the first one.
  assert.equal(
    toppingName(modifier("quesillo-10"), modifier("estilo-izquierdo")),
    "quesillo extra",
  );
  // Only quesillo is doubled; a salsa next to ¡Derecho! is just a salsa.
  assert.equal(
    toppingName(modifier("salsa-verde"), modifier("estilo-derecho")),
    "salsa verde",
  );
});

test("every offered ingredient and extra is frozen as a yes or no", () => {
  const offered = pick(
    "omit-cebolla",
    "omit-cilantro",
    "salsa-roja",
    "salsa-verde",
    "quesillo-10",
  );
  assert.deepEqual(
    toppingChoicesFor(offered, pick("omit-cilantro", "salsa-roja")),
    [
      { id: "omit-cebolla", name: "cebolla", included: true },
      { id: "omit-cilantro", name: "cilantro", included: false },
      { id: "salsa-roja", name: "salsa roja", included: true },
      { id: "salsa-verde", name: "salsa verde", included: false },
      { id: "quesillo-10", name: "quesillo extra", included: false },
    ],
  );
  assert.deepEqual(
    toppingChoicesFor(offered, pick("estilo-derecho", "quesillo-10"))[4],
    {
      id: "quesillo-10",
      name: "quesillo doble",
      included: true,
    },
  );
});
