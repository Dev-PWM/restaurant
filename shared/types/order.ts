/** Money is always integer USD cents. Payment and fulfillment are separate states. */
export type OrderStatus = 'draft' | 'pending' | 'preparing' | 'ready' | 'completed';
export type OrderType = 'dine_in' | 'takeout' | 'counter';
export interface LineItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  options: { id: string; name: string; priceCents: number; group: 'masa' | 'extras'; available: boolean }[];
  notes: string;
}
export interface CreateOrderInput {
  customerName: string;
  orderType: OrderType;
  tableNumber: number | null;
  items: { menuItemId: string; quantity: number; optionIds: string[]; notes?: string }[];
}
export interface Order {
  id: string;
  number: string;
  customerName: string;
  orderType: OrderType;
  tableNumber: number | null;
  items: LineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: OrderStatus;
  paymentStatus: 'unpaid' | 'paid';
  paymentId: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  completedAt: string | null;
}
export interface PaymentRecord {
  id: string;
  orderId: string;
  shiftId: string;
  method: 'cash';
  totalCents: number;
  tenderedCents: number;
  changeCents: number;
  paidAt: string;
  cashierId: string;
  drawerKickStatus: 'pending' | 'simulated' | 'sent' | 'failed' | 'unknown';
}
export interface CashDrawerShift {
  id: string;
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
  amountCents: number;
  note: string;
  cashierId: string;
  createdAt: string;
}
