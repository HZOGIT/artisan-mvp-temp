// Port d'envoi de SMS.
export interface SmsMessage {
  readonly to: string;
  readonly message: string;
}

export interface SmsPort {
  send(message: SmsMessage): Promise<void>;
}
