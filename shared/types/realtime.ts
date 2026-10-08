/** All money is a safe integer in MXN centavos. Display formatting never enters ledger math. */
export type OrderStatus =
  "draft" | "review" | "cooking" | "ready" | "completed" | "no_show";
export interface Modifier {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
  /**
   * masa and prep are required single choices (exactly one when a dish offers them), extra is optional and may
   * cost money, omit is a free request to leave something off.
   */
  kind: "masa" | "prep" | "extra" | "omit";
}
export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  available: boolean;
  modifierIds: string[];
}
export interface CartItem {
  menuItemId: string;
  quantity: number;
  modifierIds: string[];
}
export interface OrderInput {
  orderId: string;
  sessionId: string;
  shiftId: string;
  customerName: string;
  items: CartItem[];
  /** How the customer says they will pay at pickup. Omitted (older phones) means cash. The cashier records the real method. */
  paymentIntent?: PaymentMethod;
}
export interface OrderLine {
  menuItemId: string;
  name: string;
  quantity: number;
  modifiers: Modifier[];
  unitPriceCents: number;
  lineTotalCents: number;
}
export interface Transaction {
  id: string;
  orderId: string;
  paidAt: string;
  totalCents: number;
  tenderedCents: number;
  changeCents: number;
  /** Preserved only when reading older persisted receipts. New payments never record tips. */
  tipCents?: number;
  /**
   * How the money arrived. A SPEI transfer is always the exact total with no change, and never
   * enters the cash drawer. Receipts written before transfers existed have no method and load as cash.
   */
  method: PaymentMethod;
  currency: "MXN";
}
export type PaymentMethod = "cash" | "spei";
export interface Order {
  id: string;
  sessionId: string;
  shiftId: string;
  fingerprint: string;
  number: number;
  customerName: string;
  status: OrderStatus;
  /** What the customer chose when ordering. A hint for the cashier; the transaction holds what really happened. */
  paymentIntent: PaymentMethod;
  items: OrderLine[];
  totalCents: number;
  notes?: string;
  createdAt: string;
  acceptedAt: string | null;
  paidAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  transaction: Transaction | null;
}
export interface ItemPerformance {
  id: string;
  name: string;
  quantity: number;
  revenueCents: number;
}
export interface SalesMetrics {
  /** Every paid order, cash and SPEI together. Always equals `cashCents + speiCents`. */
  revenueCents: number;
  /** Unpaid cancellations (no_show), not paid refunds. */
  voidCount: number;
  /** Cash only: what customers handed over before change. SPEI transfers are not counted here. */
  tenderedCents: number;
  /** Cash only: change handed back. */
  changeCents: number;
  /** Cash kept from sales (`tenderedCents - changeCents`): what the drawer should hold, before any opening float. */
  cashCents: number;
  /** Bank transfers received (SPEI). These never touch the drawer. */
  speiCents: number;
  /** Paid orders settled by SPEI. */
  speiOrders: number;
  paidOrders: number;
  completedOrders: number;
  noShows: number;
  itemPerformance: ItemPerformance[];
}
export interface State {
  version: 3;
  shiftId: string;
  shiftOpenedAt: string;
  revision: number;
  nextOrderNumber: number;
  acceptingOrders: boolean;
  menuItems: MenuItem[];
  modifiers: Modifier[];
  activeOrders: Order[];
  completedOrders: Order[];
  salesMetrics: SalesMetrics;
  /** Stable receipts let close-shift retries succeed after a restart without closing the next shift. */
  closedShifts: { shiftId: string; archive: string; closedAt: string }[];
}
export interface Snapshot {
  shiftId: string;
  shiftOpenedAt: string;
  revision: number;
  observedAt: string;
  acceptingOrders: boolean;
  menuItems: MenuItem[];
  modifiers: Modifier[];
  activeOrders: Order[];
  completedOrders: Order[];
  salesMetrics: SalesMetrics | null;
  staff: boolean;
}
export interface Commands {
  submit_client_order: OrderInput;
  pos_order_paid: {
    orderId: string;
    tenderedCents: number;
    /** Omitted means cash. SPEI must tender exactly the order total. */
    method?: PaymentMethod;
  };
  pos_update_status: { orderId: string; status: "cooking" | "ready" };
  pos_mark_noshow: { orderId: string };
  admin_toggle_stock: {
    id: string;
    kind: "item" | "modifier";
    available: boolean;
  };
  pos_toggle_accepting_orders: { acceptingOrders: boolean };
  pos_close_shift: { shiftId: string; expectedRevision: number };
}
export type Command = keyof Commands;
export type Reply =
  | { ok: true; token?: string; orderId?: string; archive?: string }
  | { ok: false; error: string; code: string };
export interface ClientEvents {
  request_init: (ack?: (response: Reply) => void) => void;
  staff_login: (pin: string, ack: (response: Reply) => void) => void;
  staff_logout: (ack: (response: Reply) => void) => void;
}
export type ClientToServerEvents = ClientEvents & {
  [K in Command]: (
    payload: Commands[K],
    ack: (response: Reply) => void,
  ) => void;
};
export interface ServerToClientEvents {
  init_data: (snapshot: Snapshot) => void;
  state_updated: (snapshot: Snapshot) => void;
  menu_updated: (
    payload: Pick<Snapshot, "menuItems" | "modifiers" | "revision">,
  ) => void;
  metrics_updated: (metrics: SalesMetrics) => void;
  staff_expired: () => void;
}
