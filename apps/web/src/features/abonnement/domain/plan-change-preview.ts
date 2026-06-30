const PLAN_ORDER = ["starter", "pro", "enterprise"] as const;
type KnownPlanId = typeof PLAN_ORDER[number];

export interface PlanChangePreviewData {
  readonly currentPlanId: string;
  readonly targetPlanId: string;
  readonly targetAmountCents: number;
  readonly nextBillingDate: Date | null;
  readonly immediateAmountCents: number;
  readonly activeUserCount: number;
  readonly targetMaxUsers: number;
}

export function isDowngrade(fromPlanId: string, toPlanId: string): boolean {
  const from = PLAN_ORDER.indexOf(fromPlanId as KnownPlanId);
  const to = PLAN_ORDER.indexOf(toPlanId as KnownPlanId);
  if (from === -1 || to === -1) return false;
  return to < from;
}

export function exceedsTargetLimits(preview: PlanChangePreviewData): boolean {
  return preview.activeUserCount > preview.targetMaxUsers;
}
