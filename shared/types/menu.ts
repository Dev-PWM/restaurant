export interface MenuOption {
  id: string;
  name: string;
  group: 'masa' | 'extras';
  priceCents: number;
  available: boolean;
}
/** Availability controls 86ing. Ingredient quantities are not modeled. */
export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  imageUrl: string;
  available: boolean;
  options: MenuOption[];
}
export type MenuItem = InventoryItem;
