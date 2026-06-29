import type { TenantContext } from "../../../shared/tenant";

/** Accès portail résolu par token (clientId/artisanId). Le token EST la capacité (pas de cookie). */
export interface PortalAccess {
  readonly clientId: number;
  readonly artisanId: number;
}

/** Statut de paiement d'une facture (vue portail client). Montants en `string` decimal (parité). */
export interface FacturePaiementStatut {
  readonly clientId: number;
  readonly statut: string;
  readonly totalTTC: string;
  readonly montantPaye: string | null;
  readonly datePaiement: Date | null;
  readonly modePaiement: string | null;
}

export interface DernierPaiement {
  readonly statut: string;
  readonly paidAt: Date | null;
}

/** Facture pour la création d'un Checkout (numéro + statut [garde de payabilité] + montant + client). */
export interface FactureCheckout {
  readonly clientId: number;
  readonly numero: string | null;
  readonly statut: string;
  readonly totalTTC: string;
}

export interface ClientContact {
  readonly email: string | null;
  readonly nom: string;
  readonly prenom: string | null;
}

/*
 * Lectures de la surface PUBLIQUE de paiement de facture (portail client). `resolveAccessByToken` lit
 * `client_portal_access` sous la policy public-token RLS (token actif + non expiré). Les lectures
 * facture/paiement repassent sous le tenant résolu (`withTenant(artisanId)`).
 */
export interface PortalPaymentReader {
  resolveAccessByToken(token: string, now: Date): Promise<PortalAccess | null>;
  getFactureStatut(ctx: TenantContext, factureId: number): Promise<FacturePaiementStatut | null>;
  getDernierPaiement(ctx: TenantContext, factureId: number): Promise<DernierPaiement | null>;
  /** Pour la création d'un Checkout : facture (sous le tenant résolu). */
  getFactureCheckout(ctx: TenantContext, factureId: number): Promise<FactureCheckout | null>;
  /** Coordonnées du client (destinataire Stripe) + raison sociale de l'artisan (libellé produit). */
  getClientContact(ctx: TenantContext, clientId: number): Promise<ClientContact | null>;
  getArtisanNom(ctx: TenantContext): Promise<string | null>;
  /** Retourne une session paiement en_attente existante pour cette facture, ou null. Anti double-session. */
  getSessionEnAttente(ctx: TenantContext, factureId: number): Promise<{ url: string | null } | null>;
}
