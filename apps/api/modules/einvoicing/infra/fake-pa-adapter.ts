import type { PaPort } from "../application/pa-port";
import type {
  EntityInput,
  InboundInvoice,
  InboundInvoiceFull,
  LifecycleEvent,
  SubmitInvoiceInput,
  WebhookEvent,
} from "../domain/einvoicing";

export class FakePaAdapter implements PaPort {
  private readonly entities = new Map<string, string>();
  private readonly documents = new Map<number, string>();
  private readonly lifecycle = new Map<string, LifecycleEvent[]>();

  ensureEntity(input: EntityInput): Promise<{ paEntityId: string; kybStatut: string }> {
    const existing = this.entities.get(input.siret);
    if (existing) return Promise.resolve({ paEntityId: existing, kybStatut: "validé" });
    const paEntityId = `fake-entity-${input.siret}`;
    this.entities.set(input.siret, paEntityId);
    return Promise.resolve({ paEntityId, kybStatut: "validé" });
  }

  submitInvoice(input: SubmitInvoiceInput): Promise<{ paDocumentId: string; statut: string }> {
    const existing = this.documents.get(input.invoiceId);
    if (existing) return Promise.resolve({ paDocumentId: existing, statut: "soumis" });
    const paDocumentId = `fake-doc-${input.invoiceId}`;
    this.documents.set(input.invoiceId, paDocumentId);
    this.lifecycle.set(paDocumentId, [
      { paDocumentId, statut: "soumis", timestamp: new Date() },
    ]);
    return Promise.resolve({ paDocumentId, statut: "soumis" });
  }

  listInbound(_paEntityId: string, _since: Date, _artisanId?: number): Promise<InboundInvoice[]> {
    return Promise.resolve([]);
  }

  fetchInbound(paDocumentId: string, _artisanId?: number): Promise<InboundInvoiceFull> {
    return Promise.resolve({
      paDocumentId,
      emetteurSiret: "00000000000000",
      montantTTC: "0.00",
      date: new Date(),
      facturxBase64: "",
    });
  }

  getLifecycle(paDocumentId: string, _artisanId?: number): Promise<LifecycleEvent[]> {
    return Promise.resolve(this.lifecycle.get(paDocumentId) ?? []);
  }

  verifyWebhook(_rawBody: Buffer, _signature: string | undefined): WebhookEvent {
    /* ponytail: accepte tout en mode fake — le vrai adapter doit lever en signature invalide */
    return { type: "ping" };
  }
}
