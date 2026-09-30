import type { Currency } from './order';

export interface MenuOption {
  id: string;
  name: string;
  description?: string;
  group: 'masa' | 'extras';
  priceCents: number;
  currency: Currency;
  available: boolean;
}
/** Availability controls 86ing. Ingredient quantities are not modeled. */
export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  currency: Currency;
  imageUrl: string;
  available: boolean;
  /** Toppings that come on the dish. A customer may remove any of them; removal never changes the price. */
  included?: string[];
  options: MenuOption[];
}
export type MenuItem = InventoryItem;
