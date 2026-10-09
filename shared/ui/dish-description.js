"use strict";

/**
 * The words an owner typed to describe a dish they created, or "" when there is nothing to add.
 * Printed-menu dishes carry a generated description ("Huarache con bistec.") that only repeats the dish name, so
 * the customer menu does not show it. A dish the owner added (`admin_add_menu_item`) shows its description when they wrote
 * one; the server's own fallback ("Platillo especial: <name>") is just as redundant and stays hidden.
 * @param {{id: string, name: string, description?: string}} item
 */
function ownerDescription(item) {
  if (!item.id.startsWith("custom-")) return "";
  const text = (item.description ?? "").trim();
  return text && text !== `Platillo especial: ${item.name}` ? text : "";
}

module.exports = { ownerDescription };
