export type OrderType = 'dine_in' | 'takeout';
export type TableStatus = 'available' | 'occupied';

export type ZapataCategory =
  | 'huaraches'
  | 'sopes'
  | 'quesadillas'
  | 'gorditas'
  | 'pambazos'
  | 'especiales'
  | 'bebidas';

export interface MenuItem {
  id: string;
  name: string;
  category: ZapataCategory;
  basePrice: number;
  allowsQuesillo: boolean;
  quesilloPrice: number; // Dynamically $10 or $5 based on category
  allowsGreaseChoice: boolean;
  description?: string;
}

export interface SelectedModifiers {
  cookingStyle: 'con_grasa' | 'sin_grasa';
  extraQuesillo: boolean;
  veggies: {
    cebolla: boolean;
    cilantro: boolean;
    lechuga: boolean;
    crema: boolean;
    quesoRallado?: boolean;
  };
  salsa: 'verde' | 'roja' | 'ambas' | 'sin_salsa';
}

export interface TableInfo {
  number: number;
  name?: string;
  status: TableStatus;
  activeOrderId?: string;
  activeOrderTotalCents?: number;
  customerName?: string;
  occupiedSince?: string;
}

export const BBVA_BANK_INFO = {
  bank: 'BBVA México',
  clabe: '012180015545341143',
  beneficiary: 'Los Huaraches de Zapata',
  conceptPrefix: 'PEDIDO-',
} as const;

/**
 * Calculates dynamic quesillo upcharge:
 * - Huaraches & Gorditas: $10.00 MXN (1000 centavos)
 * - Quesadillas, Sopes, Pambazos: $5.00 MXN (500 centavos)
 * - Especiales / Bebidas: 0
 */
export function getQuesilloPriceForCategory(category: ZapataCategory | string): number {
  const cat = category.toLowerCase();
  if (cat.includes('huarache') || cat.includes('gordita')) {
    return 10;
  }
  if (cat.includes('sope') || cat.includes('quesadilla') || cat.includes('pambazo')) {
    return 5;
  }
  return 0;
}

/**
 * Determines whether this category allows the cooking style toggle (Con Grasa vs Al Comal Seco).
 */
export function allowsGreaseChoiceForCategory(category: ZapataCategory | string): boolean {
  const cat = category.toLowerCase();
  return !cat.includes('bebida');
}

/**
 * Default veggie configuration for customizable dishes.
 */
export const DEFAULT_VEGGIES = {
  cebolla: true,
  cilantro: true,
  lechuga: true,
  crema: true,
  quesoRallado: true,
};
