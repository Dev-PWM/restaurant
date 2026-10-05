/** Money is integer minor units (MXN centavos or legacy USD cents). Never combine currencies. */
export type Currency = 'MXN' | 'USD';
export type OrderStatus = 'draft' | 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type OrderType = 'dine_in' | 'takeout' | 'counter';
export interface LineItem {
  menuItemId: string;
  name: string;
  quantity: number;
  currency: Currency;
  unitPriceCents: number;
  lineTotalCents: number;
  options: { id: string; name: string; description?: string; priceCents: number; currency: Currency; group: 'masa' | 'extras'; available: boolean }[];
  /** Included toppings the customer left off. Always a subset of the dish's `included`; never repriced. */
  removed: string[];
  /** Serve the remaining included toppings on the side. */
  onTheSide: boolean;
  notes: string;
}
export interface CreateOrderInput {
  /** A browser must persist this UUID until a definitive creation response arrives. */
  submissionId: string;
  customerName: string;
  /** Optional. Digits, spaces and + ( ) . - only, 7 to 24 characters. Part of the submission fingerprint. */
  customerPhone?: string;
  orderType: OrderType;
  tableNumber: number | null;
  items: { menuItemId: string; quantity: number; optionIds: string[]; removed?: string[]; onTheSide?: boolean; notes?: string }[];
}
export interface Order {
  id: string;
  submissionId?: string;
  /** Canonical request payload used for durable retry conflict detection. */
  submissionFingerprint?: string;
  number: string;
  customerName: string;
  /** Empty string when the customer gave none. */
  customerPhone?: string;
  orderType: OrderType;
  tableNumber: number | null;
  items: LineItem[];
  currency: Currency;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: OrderStatus;
  paymentStatus: 'unpaid' | 'paid';
  paymentId: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  /** When the kitchen started and marked the ticket ready. Absent on orders saved before 0.2.0. */
  preparingAt?: string | null;
  readyAt?: string | null;
  completedAt: string | null;
}
export interface PaymentRecord {
  id: string;
  orderId: string;
  shiftId: string;
  currency: Currency;
  method: 'cash';
  subtotalCents?: number;
  taxCents?: number;
  totalCents: number;
  tenderedCents: number;
  changeCents: number;
  paidAt: string;
  cashierId: string;
}
export interface CashDrawerShift {
  id: string;
  currency: Currency;
  cashierId: string;
  floatCents: number;
  openedAt: string;
  closedAt: string | null;
  expectedCentsAtClose: number | null;
  actualCents: number | null;
  varianceCents: number | null;
  closedBy?: string;
}
export interface CashDrop {
  id: string;
  shiftId: string;
  currency: Currency;
  amountCents: number;
  note: string;
  cashierId: string;
  createdAt: string;
}
export interface VerifiedReceipt { order: Order; payment: PaymentRecord; }
export interface ReceiptValidation { receipts: VerifiedReceipt[]; excluded: number; }
export interface DrawerSummary {
  currency: Currency;
  floatCents: number;
  salesCents: number;
  tenderedCents: number;
  changeCents: number;
  dropsCents: number;
  expectedCents: number;
  orderCount: number;
  excludedReceipts: number;
}
/** `data` holds the ids and before/after values a screen needs to offer an undo. Older entries have none. */
export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  message: string;
  data?: Record<string, unknown>;
}
