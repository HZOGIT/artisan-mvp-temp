import type {
  EntityInput,
  InboundInvoice,
  InboundInvoiceFull,
  LifecycleEvent,
  SubmitInvoiceInput,
  WebhookEvent,
} from "../domain/einvoicing";

export interface PaPort {
  /** Idempotent : même siret → même paEntityId. */
  ensureEntity(input: EntityInput): Promise<{ paEntityId: string; kybStatut: string }>;
  submitInvoice(input: SubmitInvoiceInput): Promise<{ paDocumentId: string; statut: string }>;
  listInbound(paEntityId: string, since: Date, artisanId?: number): Promise<InboundInvoice[]>;
  fetchInbound(paDocumentId: string, artisanId?: number): Promise<InboundInvoiceFull>;
  /** Réconciliation statut : tous les événements liés à un document PA. */
  getLifecycle(paDocumentId: string, artisanId?: number): Promise<LifecycleEvent[]>;
  /** Fail-closed : toute signature invalide doit lever une erreur. */
  verifyWebhook(rawBody: Buffer, signature: string | undefined): WebhookEvent;
}
