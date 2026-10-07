import type { Modifier, Order } from "../../../../shared/types/realtime";

export type AcademyModuleId =
  | "module1_golden_path"
  | "module2_picky_eater"
  | "module3_mistakes_noshow"
  | "module4_panic_86"
  | "module5_revenue_closeout"
  | "lunch_rush"
  | "graduated";

export interface AcademyStep {
  id: string;
  moduleId: AcademyModuleId;
  moduleNumber: number;
  moduleTitle: string;
  stepNumber: number;
  totalSteps: number;
  target: string;
  action: string;
  title: string;
  instruction: string;
  backendConsequence: string;
  valueWhy: string;
  targetLane?: "review" | "cooking" | "ready" | "completed";
}

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

export interface AcademyState {
  isActive: boolean;
  currentModule: AcademyModuleId;
  currentStepIndex: number;
  completedModules: AcademyModuleId[];
  explainLockRemaining: number;
  ghostOrders: Order[];
  ghostCompletedOrders: Order[];
  ghostMetrics: GhostSalesMetrics;
  ghostInventory: {
    items: Array<{ id: string; name: string; available: boolean }>;
    modifiers: Modifier[];
  };
  ghostWebOrdersPaused: boolean;
  inventoryModalOpen: boolean;
  closeShiftModalOpen: boolean;
  mistakeCountdown: number;
  mistakeOrderId: string | null;
  mistakeExpired: boolean;
  mistakeSeen: boolean;
  selectedTenderCents: number | null;
  rushMode: boolean;
  rushRemaining: number;
  rushCompleted: number;
  rushResolved: number;
  rushNoShows: number;
  rushFinished: number | boolean;
  isGraduated: boolean;
  shadowWarning: string | null;
  acknowledgedRestrictions: Set<string>;
}
