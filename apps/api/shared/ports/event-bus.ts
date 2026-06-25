export interface DomainEvent<T = unknown> {
  readonly type: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly payload: T;
  readonly occurredAt: Date;
}

export interface EventBusPort {
  publish<T>(event: DomainEvent<T>): Promise<void>;
  publishMany<T>(events: readonly DomainEvent<T>[]): Promise<void>;
}

export interface WorkerPort {
  register<T>(type: string, handler: (event: DomainEvent<T>) => Promise<void>): void;
}
