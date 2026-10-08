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

export interface BankConfig {
  bank: string;
  clabe: string;
  beneficiary: string;
  conceptPrefix: string;
}

const DEFAULT_BANK_INFO: BankConfig = {
  bank: 'BBVA México',
  clabe: '012180015545341143',
  beneficiary: 'Los Huaraches de Zapata',
  conceptPrefix: 'PEDIDO-',
};

export const BBVA_BANK_INFO: BankConfig = {
  bank:
    (typeof process !== 'undefined' && process.env?.VITE_BANK_NAME) ||
    (typeof window !== 'undefined' && (window as any).__MASAFLOW_CONFIG__?.bank) ||
    DEFAULT_BANK_INFO.bank,
  clabe:
    (typeof process !== 'undefined' && process.env?.VITE_BANK_CLABE) ||
    (typeof window !== 'undefined' && (window as any).__MASAFLOW_CONFIG__?.clabe) ||
    DEFAULT_BANK_INFO.clabe,
  beneficiary:
    (typeof process !== 'undefined' && process.env?.VITE_BANK_BENEFICIARY) ||
    (typeof window !== 'undefined' && (window as any).__MASAFLOW_CONFIG__?.beneficiary) ||
    DEFAULT_BANK_INFO.beneficiary,
  conceptPrefix:
    (typeof process !== 'undefined' && process.env?.VITE_BANK_CONCEPT_PREFIX) ||
    (typeof window !== 'undefined' && (window as any).__MASAFLOW_CONFIG__?.conceptPrefix) ||
    DEFAULT_BANK_INFO.conceptPrefix,
};

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

import type { Modifier, Order } from './realtime';

export interface DetectedOrderBadges {
  /** At least one dish is cooked at the comal without grease. */
  hasSinGrasa: boolean;
  /** Pieces to cook at the comal without grease / fried, so a mixed ticket reads "×2 · ×1", not a single flag. */
  sinGrasaPieces: number;
  fritoPieces: number;
  hasExtraQuesillo: boolean;
  isSPEI: boolean;
  omissions: Array<{ itemIndex: number; menuItemId: string; omission: Modifier }>;
}

/** Quesillo add-ons are the only modifiers named after cheese; their ids start with this prefix. */
const QUESILLO_PREFIX = 'quesillo-';

export function detectOrderBadges(
  order: Order,
  cookingStyle?: 'con_grasa' | 'sin_grasa'
): DetectedOrderBadges {
  let sinGrasaPieces = 0;
  let fritoPieces = 0;
  for (const item of order.items) {
    const ids = (item.modifiers || []).map((m) => m.id);
    if (ids.includes('prep-comal')) sinGrasaPieces += item.quantity;
    if (ids.includes('prep-frito')) fritoPieces += item.quantity;
  }
  const hasSinGrasa = cookingStyle === 'sin_grasa' || sinGrasaPieces > 0;

  const hasExtraQuesillo = order.items.some((item) =>
    item.modifiers?.some((m) => m.id.startsWith(QUESILLO_PREFIX))
  );

  // The customer's own choice at checkout. The cashier still records the real method when taking payment.
  const isSPEI = order.paymentIntent === 'spei';

  const omissions = order.items.flatMap((item, itemIndex) =>
    (item.modifiers || [])
      .filter((m) => m.kind === 'omit')
      .map((omission) => ({ itemIndex, menuItemId: item.menuItemId, omission }))
  );

  return { hasSinGrasa, sinGrasaPieces, fritoPieces, hasExtraQuesillo, isSPEI, omissions };
}
