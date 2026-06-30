import { and, eq, ne } from "drizzle-orm";
import { paiementsStripe, factures, clients, notifications } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withPublicToken, withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { WebhookPaymentWriter, PaiementResolu } from "../application/webhook-payment-writer";
import { outboxEvent } from "../../../shared/events/outbox-event";

const clientNom = (prenom: string | null, nom: string | null): string => `${prenom ?? ""} ${nom ?? ""}`.trim() || "Client";

/*
 * Effets paiement/facture du webhook. `resolvePaiement` lit `paiements_stripe` par token (policy
 * public-token RLS), puis les écritures repassent sous le tenant résolu (`withTenant`). `messages`-like
 * : facture/notifications sont sous RLS → scopées par l'artisanId résolu.
 */
export class WebhookPaymentWriterDrizzle implements WebhookPaymentWriter {
  constructor(private readonly db: DbClient) {}

  resolvePaiement(token: string): Promise<PaiementResolu | null> {
    return withPublicToken(this.db, token, async (tx) => {
      const [r] = await tx
        .select({ id: paiementsStripe.id, factureId: paiementsStripe.factureId, artisanId: paiementsStripe.artisanId })
        .from(paiementsStripe)
        .where(eq(paiementsStripe.tokenPaiement, token))
        .limit(1);
      return r ? { paiementId: r.id, factureId: r.factureId, artisanId: r.artisanId } : null;
    });
  }

  completeCheckout(input: { artisanId: number; paiementId: number; factureId: number; stripePaymentIntentId: string; stripeChargeId?: string | null }): Promise<{ transitioned: boolean }> {
    const ctx: TenantContext = { artisanId: input.artisanId, userId: 0 };
    return withTenant(this.db, ctx, async (tx) => {
      const now = new Date();
      const updated = await tx
        .update(paiementsStripe)
        .set({ statut: "payee", stripePaymentIntentId: input.stripePaymentIntentId, paidAt: now, ...(input.stripeChargeId != null ? { stripeChargeId: input.stripeChargeId } : {}) })
        .where(and(eq(paiementsStripe.id, input.paiementId), eq(paiementsStripe.artisanId, input.artisanId), ne(paiementsStripe.statut, "payee")))
        .returning({ id: paiementsStripe.id });
      if (!updated.length) return { transitioned: false };

      const [facture] = await tx
        .select({ numero: factures.numero, clientId: factures.clientId, totalTTC: factures.totalTTC })
        .from(factures)
        .where(and(eq(factures.id, input.factureId), eq(factures.artisanId, input.artisanId)))
        .limit(1);
      if (!facture) return { transitioned: true };

      await tx
        .update(factures)
        .set({ statut: "payee", datePaiement: now, montantPaye: facture.totalTTC, modePaiement: "carte" })
        .where(and(eq(factures.id, input.factureId), eq(factures.artisanId, input.artisanId)));

      const [c] = await tx
        .select({ nom: clients.nom, prenom: clients.prenom })
        .from(clients)
        .where(and(eq(clients.id, facture.clientId), eq(clients.artisanId, input.artisanId)))
        .limit(1);
      const nom = clientNom(c?.prenom ?? null, c?.nom ?? null);
      const montant = Number(facture.totalTTC ?? 0).toFixed(2);

      await tx
        .update(notifications)
        .set({ archived: true })
        .where(and(eq(notifications.artisanId, input.artisanId), eq(notifications.lien, `/factures/${input.factureId}`), eq(notifications.archived, false)));

      await tx.insert(notifications).values({
        artisanId: input.artisanId,
        type: "succes",
        titre: "Paiement reçu en ligne",
        message: `Facture ${facture.numero ?? ""} payée en ligne par ${nom} (${montant} €)`,
        lien: `/factures/${input.factureId}`,
      });
      await outboxEvent(tx, ctx, { action: "facture.payee", entityType: "facture", entityId: input.factureId, payload: { factureId: input.factureId } });
      return { transitioned: true };
    });
  }

  failPaiement(input: { artisanId: number; paiementId: number }): Promise<void> {
    const ctx: TenantContext = { artisanId: input.artisanId, userId: 0 };
    return withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(paiementsStripe)
        .set({ statut: "echouee" })
        .where(and(eq(paiementsStripe.id, input.paiementId), eq(paiementsStripe.artisanId, input.artisanId)));
      await outboxEvent(tx, ctx, { action: "paiement.echoue", entityType: "paiement", entityId: input.paiementId, payload: { paiementId: input.paiementId } });
    });
  }
}
