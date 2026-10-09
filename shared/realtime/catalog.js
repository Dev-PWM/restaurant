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

/**
 * The printed menu's two specials are not separate dishes: ¡Izquierdo! (the left side of the menu: huaraches and
 * sopes) and ¡Derecho! (the right side: quesadillas, gorditas and pambazos) are a way to dress a dish. Choosing one
 * adds its toppings to the order at the dish's own price, so SPECIAL_PRICE_CENTS is 0. Change that one number to
 * charge a surcharge for the special; the customer's total, the ticket and the ledger all follow it.
 */
const ESTILO_IZQUIERDO = "estilo-izquierdo";
const ESTILO_DERECHO = "estilo-derecho";
const SPECIAL_PRICE_CENTS = 0;

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

/**
 * Dishes earlier builds seeded for the two specials. They had no confirmed price and could not be ordered; the
 * specials are now options on the dishes above, so these are removed from any saved menu.
 */
const RETIRED_ITEM_IDS = ["especial-derecho", "especial-izquierdo"];

/**
 * Catalog modifiers that were renamed. A saved ledger is renamed only while it still holds the old name, so a
 * name the owner changed by hand is never overwritten.
 */
const RENAMED_MODIFIERS = [
  { id: "quesillo-10", from: "Con Quesillo (huaraches y gorditas)", to: "Con quesillo" },
  { id: "quesillo-5", from: "Con Quesillo (sopes, quesadillas y pambazos)", to: "Con quesillo" },
];

/** @type {Modifier[]} */
const MODIFIERS = [
  {
    id: QUESILLO_10,
    name: "Con quesillo",
    priceCents: 1000,
    available: true,
    kind: "extra",
  },
  {
    id: QUESILLO_5,
    name: "Con quesillo",
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
  {
    id: ESTILO_IZQUIERDO,
    name: "¡Izquierdo!",
    detail: "Base de nopal, frijoles, pico de gallo, queso y crema",
    priceCents: SPECIAL_PRICE_CENTS,
    available: true,
    kind: "special",
  },
  {
    id: ESTILO_DERECHO,
    name: "¡Derecho!",
    detail: "Cecina, longaniza, nopal y quesillo",
    priceCents: SPECIAL_PRICE_CENTS,
    available: true,
    kind: "special",
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

/**
 * The sections a dish can belong to and the options each one offers. The printed menu above uses the same
 * rules, and a dish the owner creates gets the same ones, so a new huarache is priced and prepared like
 * every other huarache. Drinks have no cooking style or toppings.
 * @type {Record<string, string[]>}
 */
const CATEGORY_MODIFIERS = {
  Huaraches: [QUESILLO_10, ESTILO_IZQUIERDO, ...EVERY_DISH],
  Sopes: [QUESILLO_5, ESTILO_IZQUIERDO, ...EVERY_DISH],
  Quesadillas: [QUESILLO_5, ESTILO_DERECHO, ...EVERY_DISH],
  Gorditas: [QUESILLO_10, ESTILO_DERECHO, ...EVERY_DISH],
  Pambazos: [QUESILLO_5, ESTILO_DERECHO, ...EVERY_DISH],
  // Only for dishes the owner creates (a "special of the day"); the printed menu has none.
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

/** The optional specials. Unlike comal/frito they are never required and never change a price on their own. */
const SPECIAL_IDS = [ESTILO_IZQUIERDO, ESTILO_DERECHO];

/**
 * What a ledger saved by an older build is missing from today's catalog, or null when it already has everything.
 * It only ever ADDS: modifiers the catalog has and the ledger lacks, and catalog modifiers a catalog dish does not
 * offer yet. It never removes, renames or re-prices anything, so stock toggles (86'd dishes) survive. Dishes the
 * owner created are left alone, except that they gain their section's optional specials so a new huarache is
 * dressed like every other one. Running it twice changes nothing.
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
  const catalogIds = new Set(MENU_ITEMS.map((dish) => dish.id));
  for (const dish of menuItems) {
    if (catalogIds.has(dish.id)) continue;
    for (const id of SPECIAL_IDS)
      if ((CATEGORY_MODIFIERS[dish.category] ?? []).includes(id) && !dish.modifierIds.includes(id)) {
        dish.modifierIds.push(id);
        addedLinks++;
      }
  }
  return addedModifiers || addedLinks
    ? { menuItems, modifiers, addedModifiers, addedLinks }
    : null;
}

/**
 * What a ledger saved by an older build still holds that today's catalog has retired or renamed, or null when
 * there is nothing to do: the two placeholder specials are removed, and the quesillo modifiers lose the section
 * list in their names. A modifier is renamed only while it still has its old catalog name. Orders are never
 * touched: paid history keeps the names that were true when it was written.
 * @param {{menuItems: MenuItem[], modifiers: Modifier[]}} state
 * @returns {{menuItems: MenuItem[], modifiers: Modifier[], removedItems: number, renamedModifiers: number} | null}
 */
function retireCatalog(state) {
  const menuItems = structuredClone(state.menuItems).filter((item) => !RETIRED_ITEM_IDS.includes(item.id));
  const modifiers = structuredClone(state.modifiers);
  let renamedModifiers = 0;
  for (const { id, from, to } of RENAMED_MODIFIERS) {
    const saved = modifiers.find((modifier) => modifier.id === id);
    if (saved?.name === from) {
      saved.name = to;
      renamedModifiers++;
    }
  }
  const removedItems = state.menuItems.length - menuItems.length;
  return removedItems || renamedModifiers ? { menuItems, modifiers, removedItems, renamedModifiers } : null;
}

module.exports = {
  MENU_ITEMS,
  MODIFIERS,
  CATEGORY_MODIFIERS,
  TABLE_COUNT,
  defaultTables,
  REQUIRED_CHOICE_KINDS,
  SPECIAL_PRICE_CENTS,
  hasLegacyPlaceholderMenu,
  reconcileCatalog,
  retireCatalog,
};
