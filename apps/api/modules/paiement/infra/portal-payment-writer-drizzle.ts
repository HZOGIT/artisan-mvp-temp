import { paiementsStripe } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import { ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { PortalPaymentWriter } from "../application/portal-payment-writer";

/** Même pattern que budgets-categories : Drizzle enveloppe le code PG dans `cause`. */
function estViolationUnique(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; e != null && i < 5; i++) {
    if (typeof e === "object" && (e as { code?: string }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/*
 * Insère la ligne `paiements_stripe` (statut en_attente) à l'ouverture d'un Checkout, sous le tenant
 * résolu par le token de portail (`artisanId` forcé du contexte). Le webhook la soldera.
 */
export class PortalPaymentWriterDrizzle implements PortalPaymentWriter {
  constructor(private readonly db: DbClient) {}

  async createPaiement(
    ctx: TenantContext,
    input: { factureId: number; stripeSessionId: string; montant: string; lienPaiement: string | null; tokenPaiement: string },
  ): Promise<void> {
    try {
      await withTenant(this.db, ctx, async (tx) => {
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
    } catch (err) {
      if (estViolationUnique(err)) throw new ConflictError("Session paiement déjà en cours pour cette facture");
      throw err;
    }
  }
}
