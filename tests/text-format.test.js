"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { plural, minutesBetween } = require("../shared/ui/text-format");

test("counts agree with their noun", () => {
  assert.equal(plural(0, "pedido"), "0 pedidos");
  assert.equal(plural(1, "pedido"), "1 pedido");
  assert.equal(plural(2, "pedido"), "2 pedidos");
  assert.equal(plural(1, "módulo pendiente", "módulos pendientes"), "1 módulo pendiente");
  assert.equal(plural(3, "módulo pendiente", "módulos pendientes"), "3 módulos pendientes");
});

test("elapsed minutes come from real timestamps, never read 0, and are null when a step never happened", () => {
  const at = (minutes, seconds = 0) => new Date(Date.UTC(2026, 9, 8, 18, minutes, seconds)).toISOString();
  assert.equal(minutesBetween(at(0), at(7)), 7);
  assert.equal(minutesBetween(at(0), at(0, 4)), 1, "a few seconds still shows as 1 min");
  assert.equal(minutesBetween(at(0), at(12, 40)), 13);
  assert.equal(minutesBetween(null, at(7)), null);
  assert.equal(minutesBetween(at(0), null), null);
  assert.equal(minutesBetween("not a date", at(7)), null);
});
