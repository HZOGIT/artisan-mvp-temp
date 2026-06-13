// Port d'envoi d'email. Les use-cases en dépendent (interface), jamais d'une impl
// concrète. `send` résout en cas de succès, rejette (throw) sinon.
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

export interface EmailPort {
  send(message: EmailMessage): Promise<void>;
}
