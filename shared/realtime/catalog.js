// @ts-check
"use strict";
/**
 * The printed "Los Huaraches de Zapata" menu, in menu order. All prices are integer MXN centavos.
 * Names stand alone on purpose: they are copied onto kitchen tickets and sales rankings without the category.
 * @typedef {import('../types/realtime').MenuItem} MenuItem
 * @typedef {import('../types/realtime').Modifier} Modifier
 */

/** "C/QUESILLO $X EXTRA" costs a different amount per section, and modifier prices are global, so there are two. */
const QUESILLO_10 = "quesillo-10";
const QUESILLO_5 = "quesillo-5";

/** @type {Modifier[]} */
const MODIFIERS = [
  {
    id: QUESILLO_10,
    name: "Con Quesillo (huaraches y gorditas)",
    priceCents: 1000,
    available: true,
    kind: "extra",
  },
  {
    id: QUESILLO_5,
    name: "Con Quesillo (sopes, quesadillas y pambazos)",
    priceCents: 500,
    available: true,
    kind: "extra",
  },
];

/**
 * @param {string} category
 * @param {string[]} modifierIds
 * @param {[id: string, name: string, priceCents: number, description: string][]} rows
 * @returns {MenuItem[]}
 */
const section = (category, modifierIds, rows) =>
  rows.map(([id, name, priceCents, description]) => ({
    id,
    name,
    description,
    category,
    priceCents,
    available: true,
    modifierIds: [...modifierIds],
  }));

/** @type {MenuItem[]} */
const MENU_ITEMS = [
  ...section("Huaraches", [QUESILLO_10], [
    ["huarache-bistec", "Huarache de Bistec", 9000, "Huarache con bistec."],
    ["huarache-suadero", "Huarache de Suadero", 9000, "Huarache con suadero."],
    ["huarache-longaniza", "Huarache de Longaniza", 6500, "Huarache con longaniza."],
    ["huarache-quesillo", "Huarache de Quesillo", 6500, "Huarache con quesillo."],
    ["huarache-pierna", "Huarache de Pierna", 6000, "Huarache con pierna."],
    ["huarache-salchicha", "Huarache de Salchicha", 6000, "Huarache con salchicha."],
    ["huarache-chicharron", "Huarache de Chicharrón", 6500, "Huarache con chicharrón."],
    ["huarache-tinga-pollo", "Huarache de Tinga de Pollo", 6500, "Huarache con tinga de pollo."],
    ["huarache-tinga-res", "Huarache de Tinga de Res", 6500, "Huarache con tinga de res."],
    ["huarache-huevo", "Huarache de Huevo", 5000, "Huarache con huevo."],
    ["huarache-sencillo", "Huarache Sencillo", 3500, "Huarache sencillo."],
  ]),
  ...section("Sopes", [QUESILLO_5], [
    ["sope-bistec", "Sope de Bistec", 5500, "Sope con bistec."],
    ["sope-suadero", "Sope de Suadero", 5500, "Sope con suadero."],
    ["sope-chicharron", "Sope de Chicharrón", 4500, "Sope con chicharrón."],
    ["sope-champinones", "Sope de Champiñones", 4500, "Sope con champiñones."],
    ["sope-tinga-pollo", "Sope de Tinga de Pollo", 4500, "Sope con tinga de pollo."],
    ["sope-tinga-res", "Sope de Tinga de Res", 4500, "Sope con tinga de res."],
    ["sope-sencillo", "Sope Sencillo", 3500, "Sope sencillo."],
  ]),
  ...section("Quesadillas", [QUESILLO_5], [
    ["quesadilla-queso", "Quesadilla de Queso", 4000, "Quesadilla con queso."],
    ["quesadilla-chicharron", "Quesadilla de Chicharrón", 4000, "Quesadilla con chicharrón."],
    ["quesadilla-champinones", "Quesadilla de Champiñones", 4000, "Quesadilla con champiñones."],
    ["quesadilla-tinga-pollo", "Quesadilla de Tinga de Pollo", 4000, "Quesadilla con tinga de pollo."],
    ["quesadilla-tinga-res", "Quesadilla de Tinga de Res", 4000, "Quesadilla con tinga de res."],
    ["quesadilla-bistec", "Quesadilla de Bistec", 5500, "Quesadilla con bistec."],
    ["quesadilla-longaniza", "Quesadilla de Longaniza", 5500, "Quesadilla con longaniza."],
    ["quesadilla-suadero", "Quesadilla de Suadero", 5500, "Quesadilla con suadero."],
  ]),
  ...section("Gorditas", [QUESILLO_10], [
    ["gordita-suadero", "Gordita de Suadero", 6500, "Gordita con suadero."],
    ["gordita-chicharron", "Gordita de Chicharrón", 5000, "Gordita con chicharrón."],
    ["gordita-especial", "Gordita Especial", 7500, "Gordita especial."],
  ]),
  ...section("Pambazos", [QUESILLO_5], [
    ["pambazo-papas-longaniza", "Pambazo de Papas con Longaniza", 5000, "Pambazo con papas y longaniza."],
    ["pambazo-guisado", "Pambazo de Guisado", 6000, "Pambazo con guisado."],
  ]),
  ...section("Especiales de Zapata", [], [
    ["especial-derecho", "Especial Derecho", 13500, "¡Derecho! Cecina, longaniza, nopal y quesillo."],
    ["especial-izquierdo", "Especial Izquierdo", 6000, "¡Izquierdo! Base de nopal, frijoles, pico de gallo, queso, crema, carne o guisado."],
  ]),
];
// Bebidas (refresco y agua) are printed without a price, so they are intentionally absent until the owner sets one.

/** Ids of the four-dish placeholder menu that earlier builds seeded. It had no way to be edited except stock toggles. */
const LEGACY_ITEM_IDS = ["huarache", "sope", "pambazo", "agua"];
const LEGACY_MODIFIER_IDS = ["white", "blue", "cheese", "avocado", "no-onion", "no-cilantro"];
/** @param {{id: string}[]} rows @param {string[]} ids */
const sameIds = (rows, ids) =>
  rows.length === ids.length && ids.every((id) => rows.some((row) => row.id === id));

/** True only for an untouched placeholder menu, so a menu the owner has changed is never overwritten.
 * @param {{menuItems: {id: string}[], modifiers: {id: string}[]}} state */
function hasLegacyPlaceholderMenu(state) {
  return sameIds(state.menuItems, LEGACY_ITEM_IDS) && sameIds(state.modifiers, LEGACY_MODIFIER_IDS);
}

module.exports = { MENU_ITEMS, MODIFIERS, hasLegacyPlaceholderMenu };
