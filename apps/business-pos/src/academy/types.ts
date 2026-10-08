export type { AcademyAction, AcademyState, Phase } from "./engine.js";
export type {
  AcademyEvent,
  ModuleDef,
  ModuleId,
  ResolvedStep,
  Step,
} from "./curriculum.js";

/** Totals shown on the practice «Caja y ventas» screen, computed from practice tickets only. */
export interface GhostSalesMetrics {
  revenueCents: number;
  paidOrders: number;
  noShows: number;
  voidCount: number;
  tenderedCents: number;
  changeCents: number;
  completedOrders: number;
  itemPerformance: Array<{
    id: string;
    name: string;
    quantity: number;
    revenueCents: number;
  }>;
}

export interface PracticeInventoryItem {
  id: string;
  name: string;
  available: boolean;
}
