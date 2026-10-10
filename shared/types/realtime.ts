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
   * cost money, omit is a free request to leave something off, special is an optional house style (¡Izquierdo!
   * or ¡Derecho!) that adds the toppings listed in `detail`.
   */
  kind: "masa" | "prep" | "extra" | "omit" | "special";
  /** For a special: the toppings it adds, written for the customer and printed on the ticket. */
  detail?: string;
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
  /** Omitted (older phones) means takeout. Dine-in is refused while every table is occupied. */
  orderType?: OrderType;
}
export interface OrderLine {
  menuItemId: string;
  name: string;
  quantity: number;
  modifiers: Modifier[];
  /** Offered onion, cilantro and sauce choices frozen when this order was placed. Older orders omit it. */
  toppingChoices?: { id: string; name: string; included: boolean }[];
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
/** Where the customer eats. Takeout is the default for older phones and orders. */
export type OrderType = "takeout" | "dine_in";
export type TableStatus = "available" | "occupied";
/** A dining-room table. Staff mark it occupied when they seat someone; no order ever changes it by itself. */
export interface Table {
  number: number;
  status: TableStatus;
  /** When staff marked it occupied, or null while it is free. */
  occupiedSince: string | null;
}
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
  orderType: OrderType;
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
  tables: Table[];
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
  /** Public deployments use a staff password; local restaurant installations can use their PIN. */
  staffAuthMode: "pin" | "password";
  acceptingOrders: boolean;
  menuItems: MenuItem[];
  modifiers: Modifier[];
  /** Table numbers and free/occupied only, so customers can see how many are free. No names or amounts. */
  tables: Table[];
  /**
   * Numbers of the orders still waiting or cooking, for everyone, so a customer can see how many are ahead of
   * theirs. Numbers only: no names, items or amounts. Omitted by servers older than this field.
   */
  queueNumbers?: number[];
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
  pos_set_table: { number: number; status: TableStatus };
  /**
   * Adds a dish the owner invented. The client generates `id` so a retry after a lost acknowledgement cannot
   * create it twice. Its options (quesillo price, comal/frito, toppings) come from the category, on the server.
   */
  admin_add_menu_item: {
    id: string;
    name: string;
    category: string;
    priceCents: number;
    description?: string;
  };
  pos_close_shift: { shiftId: string; expectedRevision: number };
}
export type Command = keyof Commands;
export type Reply =
  | { ok: true; token?: string; orderId?: string; archive?: string }
  | { ok: false; error: string; code: string };
export interface ClientEvents {
  request_init: (ack?: (response: Reply) => void) => void;
  staff_login: (credential: string, ack: (response: Reply) => void) => void;
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
