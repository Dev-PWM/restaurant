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

/**
 * Every dish is cooked either at the comal with no grease or fried, so customers must choose one (no default:
 * the kitchen never gets an ambiguous ticket). Onion and cilantro come on the dish and can be taken off; the two
 * salsas are added on request. None of these cost anything.
 */
const PREP_COMAL = "prep-comal";
const PREP_FRITO = "prep-frito";
const OMIT_CEBOLLA = "omit-cebolla";
const OMIT_CILANTRO = "omit-cilantro";
const SALSA_ROJA = "salsa-roja";
const SALSA_VERDE = "salsa-verde";
/** Offered on every dish, after any quesillo add-on. */
const EVERY_DISH = [PREP_COMAL, PREP_FRITO, OMIT_CEBOLLA, OMIT_CILANTRO, SALSA_ROJA, SALSA_VERDE];

/** How many tables the dining room has. Change it here; a ledger saved with fewer tables is topped up on the next start. */
const TABLE_COUNT = 3;
/** @returns {import('../types/realtime').Table[]} Every table free. */
function defaultTables() {
  return Array.from({ length: TABLE_COUNT }, (_, index) => ({
    number: index + 1,
    status: "available",
    occupiedSince: null,
  }));
}

/** Modifier kinds where the customer must pick exactly one of the dish's options. */
const REQUIRED_CHOICE_KINDS = ["masa", "prep"];

/** The printed menu does not confirm these specials' prices or Izquierdo's carne/guisado choices. */
const UNCONFIRMED_SPECIAL_IDS = ["especial-derecho", "especial-izquierdo"];

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
  { id: PREP_COMAL, name: "Al comal (sin grasa)", priceCents: 0, available: true, kind: "prep" },
  { id: PREP_FRITO, name: "Frito (con grasa)", priceCents: 0, available: true, kind: "prep" },
  { id: OMIT_CEBOLLA, name: "Sin cebolla", priceCents: 0, available: true, kind: "omit" },
  { id: OMIT_CILANTRO, name: "Sin cilantro", priceCents: 0, available: true, kind: "omit" },
  { id: SALSA_ROJA, name: "Con salsa roja", priceCents: 0, available: true, kind: "extra" },
  { id: SALSA_VERDE, name: "Con salsa verde", priceCents: 0, available: true, kind: "extra" },
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

/**
 * The sections a dish can belong to and the options each one offers. The printed menu above uses the same
 * rules, and a dish the owner creates gets the same ones, so a new huarache is priced and prepared like
 * every other huarache. Drinks have no cooking style or toppings.
 * @type {Record<string, string[]>}
 */
const CATEGORY_MODIFIERS = {
  Huaraches: [QUESILLO_10, ...EVERY_DISH],
  Sopes: [QUESILLO_5, ...EVERY_DISH],
  Quesadillas: [QUESILLO_5, ...EVERY_DISH],
  Gorditas: [QUESILLO_10, ...EVERY_DISH],
  Pambazos: [QUESILLO_5, ...EVERY_DISH],
  "Especiales de Zapata": [...EVERY_DISH],
  Bebidas: [],
};

/** @type {MenuItem[]} */
const MENU_ITEMS = [
  ...section("Huaraches", CATEGORY_MODIFIERS.Huaraches, [
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
  ...section("Sopes", CATEGORY_MODIFIERS.Sopes, [
    ["sope-bistec", "Sope de Bistec", 5500, "Sope con bistec."],
    ["sope-suadero", "Sope de Suadero", 5500, "Sope con suadero."],
    ["sope-chicharron", "Sope de Chicharrón", 4500, "Sope con chicharrón."],
    ["sope-champinones", "Sope de Champiñones", 4500, "Sope con champiñones."],
    ["sope-tinga-pollo", "Sope de Tinga de Pollo", 4500, "Sope con tinga de pollo."],
    ["sope-tinga-res", "Sope de Tinga de Res", 4500, "Sope con tinga de res."],
    ["sope-sencillo", "Sope Sencillo", 3500, "Sope sencillo."],
  ]),
  ...section("Quesadillas", CATEGORY_MODIFIERS.Quesadillas, [
    ["quesadilla-queso", "Quesadilla de Queso", 4000, "Quesadilla con queso."],
    ["quesadilla-chicharron", "Quesadilla de Chicharrón", 4000, "Quesadilla con chicharrón."],
    ["quesadilla-champinones", "Quesadilla de Champiñones", 4000, "Quesadilla con champiñones."],
    ["quesadilla-tinga-pollo", "Quesadilla de Tinga de Pollo", 4000, "Quesadilla con tinga de pollo."],
    ["quesadilla-tinga-res", "Quesadilla de Tinga de Res", 4000, "Quesadilla con tinga de res."],
    ["quesadilla-bistec", "Quesadilla de Bistec", 5500, "Quesadilla con bistec."],
    ["quesadilla-longaniza", "Quesadilla de Longaniza", 5500, "Quesadilla con longaniza."],
    ["quesadilla-suadero", "Quesadilla de Suadero", 5500, "Quesadilla con suadero."],
  ]),
  ...section("Gorditas", CATEGORY_MODIFIERS.Gorditas, [
    ["gordita-suadero", "Gordita de Suadero", 6500, "Gordita con suadero."],
    ["gordita-chicharron", "Gordita de Chicharrón", 5000, "Gordita con chicharrón."],
    ["gordita-especial", "Gordita Especial", 7500, "Gordita especial."],
  ]),
  ...section("Pambazos", CATEGORY_MODIFIERS.Pambazos, [
    ["pambazo-papas-longaniza", "Pambazo de Papas con Longaniza", 5000, "Pambazo con papas y longaniza."],
    ["pambazo-guisado", "Pambazo de Guisado", 6000, "Pambazo con guisado."],
  ]),
  ...section("Especiales de Zapata", CATEGORY_MODIFIERS["Especiales de Zapata"], [
    // Provisional ledger prices: the supplied printed image leaves these amounts blank.
    // Customer orders are blocked in engine.js until the owner confirms recipe, choices and prices.
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

/**
 * What a ledger saved by an older build is missing from today's catalog, or null when it already has everything.
 * It only ever ADDS: modifiers the catalog has and the ledger lacks, and catalog modifiers a catalog dish does not
 * offer yet. It never removes, renames or re-prices anything and never touches dishes the owner created, so stock
 * toggles (86'd dishes) and custom dishes survive. Running it twice changes nothing.
 * @param {{menuItems: MenuItem[], modifiers: Modifier[]}} state
 * @returns {{menuItems: MenuItem[], modifiers: Modifier[], addedModifiers: number, addedLinks: number} | null}
 */
function reconcileCatalog(state) {
  const modifiers = structuredClone(state.modifiers);
  const menuItems = structuredClone(state.menuItems);
  let addedModifiers = 0;
  let addedLinks = 0;
  for (const modifier of MODIFIERS)
    if (!modifiers.some((existing) => existing.id === modifier.id)) {
      modifiers.push(structuredClone(modifier));
      addedModifiers++;
    }
  for (const dish of MENU_ITEMS) {
    const saved = menuItems.find((existing) => existing.id === dish.id);
    if (!saved) continue;
    for (const id of dish.modifierIds)
      if (!saved.modifierIds.includes(id)) {
        saved.modifierIds.push(id);
        addedLinks++;
      }
  }
  return addedModifiers || addedLinks
    ? { menuItems, modifiers, addedModifiers, addedLinks }
    : null;
}

module.exports = {
  MENU_ITEMS,
  MODIFIERS,
  CATEGORY_MODIFIERS,
  TABLE_COUNT,
  defaultTables,
  REQUIRED_CHOICE_KINDS,
  UNCONFIRMED_SPECIAL_IDS,
  hasLegacyPlaceholderMenu,
  reconcileCatalog,
};
