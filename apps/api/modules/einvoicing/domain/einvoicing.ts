export interface PaLine {
  description: string;
  quantite: number;
  prixUnitaireHT: string;
  tauxTva: string;
  montantHT: string;
  montantTva: string;
  montantTTC: string;
}

export interface PaParty {
  siret: string | null;
  nom: string;
  email: string | null;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
}

export interface PaTvaBreakdown {
  taux: string;
  baseHT: string;
  montantTva: string;
}

export interface PaInvoicePayload {
  typeDocument: "facture" | "avoir";
  numero: string;
  date: string;
  dateEcheance?: string;
  emetteur: PaParty;
  destinataire: PaParty;
  lignes: PaLine[];
  tvaBreakdown: PaTvaBreakdown[];
  totalHT: string;
  totalTva: string;
  totalTTC: string;
  mentionLegale?: string;
}

export interface EntityInput {
  siret: string;
  nom: string;
  email: string;
}

export interface SubmitInvoiceInput {
  paEntityId: string;
  invoiceId: number;
  payload: PaInvoicePayload;
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
