export interface DomainEvent {
  readonly type: string;
  readonly aggregateType: string;
  readonly aggregateId: number;
  readonly artisanId: number;
  readonly userId?: number | null;
  readonly occurredAt: Date;
  readonly payload?: Record<string, unknown>;
}

export interface EventBusPort {
  publish(event: DomainEvent): Promise<void>;
  publishMany(events: readonly DomainEvent[]): Promise<void>;
}

export interface WorkerPort {
  register(type: string, handler: (event: DomainEvent) => Promise<void>): void;
}
