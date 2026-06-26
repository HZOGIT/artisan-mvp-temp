export interface EventLog {
  readonly id: string;
  readonly artisanId: number;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: number;
  readonly payload: unknown;
  readonly occurredAt: Date | null;
  readonly createdAt: Date;
}
