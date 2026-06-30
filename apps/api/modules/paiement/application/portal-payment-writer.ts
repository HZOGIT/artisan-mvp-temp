import type { TenantContext } from "../../../shared/tenant";

/*
 * Création d'une ligne `paiements_stripe` (en_attente) à l'ouverture d'un Checkout, sous le tenant
 * résolu par le token de portail. Le webhook `checkout.session.completed` (déjà porté) la soldera.
 */
export interface PortalPaymentWriter {
  createPaiement(
    ctx: TenantContext,
    input: { factureId: number; stripeSessionId: string; montant: string; lienPaiement: string | null; tokenPaiement: string; stripeConnectAccountId?: string | null },
  ): Promise<void>;
  /** Marque un paiement en_attente comme expiré (session Stripe expirée/abandonnée). Libère le slot UNIQUE pour un nouveau Checkout. */
  expirePaiement(ctx: TenantContext, paiementId: number): Promise<void>;
}
