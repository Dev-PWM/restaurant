"use strict";

/**
 * "1 pedido", "2 pedidos": the count with its noun in the right number. Spanish adds -s to most nouns,
 * and a few need their own plural ("1 mes" / "2 meses"), which the caller passes.
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]
 */
function plural(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Whole minutes between two ISO timestamps, at least 1 so a quick step never reads "0 min", or null when either end
 * is missing (an order that was never accepted has no cooking time).
 * @param {string | null | undefined} from
 * @param {string | null | undefined} to
 */
function minutesBetween(from, to) {
  if (!from || !to) return null;
  const milliseconds = Date.parse(to) - Date.parse(from);
  return Number.isFinite(milliseconds) ? Math.max(1, Math.round(milliseconds / 60000)) : null;
}

module.exports = { plural, minutesBetween };
