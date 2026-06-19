import { paiementsStripe } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { PortalPaymentWriter } from "../application/portal-payment-writer";

/*
 * Insère la ligne `paiements_stripe` (statut en_attente) à l'ouverture d'un Checkout, sous le tenant
 * résolu par le token de portail (`artisanId` forcé du contexte). Le webhook la soldera.
 */
export class PortalPaymentWriterDrizzle implements PortalPaymentWriter {
  constructor(private readonly db: DbClient) {}

  createPaiement(
    ctx: TenantContext,
    input: { factureId: number; stripeSessionId: string; montant: string; lienPaiement: string | null; tokenPaiement: string },
  ): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx.insert(paiementsStripe).values({
        factureId: input.factureId,
        artisanId: ctx.artisanId,
        stripeSessionId: input.stripeSessionId,
        montant: input.montant,
        statut: "en_attente",
        lienPaiement: input.lienPaiement,
        tokenPaiement: input.tokenPaiement,
      });
    });
  }
}
