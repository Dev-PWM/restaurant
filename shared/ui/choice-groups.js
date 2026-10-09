"use strict";

/**
 * How a dish's chosen modifiers read to a person, shared by the customer's cart, the order screen and the
 * kitchen ticket so all three say the same thing in the same words.
 * @typedef {import("../types/realtime").Modifier} Modifier
 * @typedef {{
 *   prep: Modifier | null,
 *   special: Modifier | null,
 *   masa: Modifier | null,
 *   without: Modifier[],
 *   extras: Modifier[],
 * }} LineChoices
 */

/** The estilo that already includes quesillo, so an extra one is a double portion, not the first. */
const DERECHO_ID = "estilo-derecho";

/** Short recipe identifiers for the ticket, without the old nicknames. */
/** @param {{id: string, name: string}} special */
function specialLabel(special) {
  if (special.id === "estilo-izquierdo") return "Nopales";
  if (special.id === DERECHO_ID) return "Cecina";
  return special.name;
}

/**
 * Sorts a line's modifiers into the groups a cook reads: how it is cooked, the special, what to leave off,
 * and what to add. Order inside a group follows the order the customer's dish offers them.
 * @param {Modifier[]} modifiers
 * @returns {LineChoices}
 */
function groupChoices(modifiers) {
  return {
    prep: modifiers.find((m) => m.kind === "prep") ?? null,
    special: modifiers.find((m) => m.kind === "special") ?? null,
    masa: modifiers.find((m) => m.kind === "masa") ?? null,
    without: modifiers.filter((m) => m.kind === "omit"),
    extras: modifiers.filter((m) => m.kind === "extra"),
  };
}

/**
 * The topping a modifier names, in lower case, without its "Sin"/"Con" prefix: "Sin cebolla" is "cebolla" and
 * "Con salsa roja" is "salsa roja". A quesillo ordered on top of ¡Derecho! (which already includes it) reads
 * "doble quesillo".
 * @param {Modifier} modifier
 * @param {Modifier | null} [special] the special chosen on the same dish, if any
 */
function toppingName(modifier, special = null) {
  const bare = modifier.name
    .replace(/^(sin|con)\s+/i, "")
    .trim()
    .toLowerCase();
  if (modifier.id.startsWith("quesillo-"))
    return special?.id === DERECHO_ID ? `${bare} doble` : `${bare} extra`;
  return bare;
}

/**
 * Freeze the offered yes/no kitchen choices at order time. Older orders without this snapshot still render
 * their selected modifiers as before.
 * @param {Modifier[]} offered
 * @param {Modifier[]} selected
 * @returns {{id: string, name: string, included: boolean}[]}
 */
function toppingChoicesFor(offered, selected) {
  const ids = new Set(selected.map((modifier) => modifier.id));
  const special =
    selected.find((modifier) => modifier.kind === "special") ?? null;
  return offered
    .filter((modifier) => modifier.kind === "omit" || modifier.kind === "extra")
    .sort((a, b) => {
      const rank = (modifier) =>
        modifier.kind === "omit" ? 0 : modifier.id.startsWith("salsa-") ? 1 : 2;
      return rank(a) - rank(b);
    })
    .map((modifier) => ({
      id: modifier.id,
      name: toppingName(modifier, special),
      included:
        modifier.kind === "omit" ? !ids.has(modifier.id) : ids.has(modifier.id),
    }));
}

module.exports = { groupChoices, toppingName, toppingChoicesFor, specialLabel };
