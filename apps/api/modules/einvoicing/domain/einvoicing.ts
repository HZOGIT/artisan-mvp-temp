export interface EntityInput {
  siret: string;
  nom: string;
  email: string;
}

export interface SubmitInvoiceInput {
  paEntityId: string;
  invoiceId: number;
  facturxBase64?: string;
}

export interface InboundInvoice {
  paDocumentId: string;
  emetteurSiret: string;
  montantTTC: string;
  date: Date;
}

export interface InboundInvoiceFull extends InboundInvoice {
  facturxBase64: string;
}

export interface LifecycleEvent {
  paDocumentId: string;
  statut: string;
  timestamp: Date;
  detail?: string;
}

export interface WebhookEvent {
  type: "statut_change" | "inbound" | "ping";
  paDocumentId?: string;
  statut?: string;
}
