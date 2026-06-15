import { and, desc, eq, gte } from "drizzle-orm";
import { clientPortalAccess, factures, paiementsStripe } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withPublicToken, withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type {
  PortalPaymentReader,
  PortalAccess,
  FacturePaiementStatut,
  DernierPaiement,
} from "../application/portal-payment-reader";

// Lectures paiement portail. `resolveAccessByToken` lit `client_portal_access` sous la policy
// public-token RLS (token actif + non expiré) ; les lectures facture/paiement repassent sous le
// tenant résolu (RLS). `paiements_stripe` (sous RLS) est lu via le tenant résolu (≠ le webhook qui
// résout par tokenPaiement).
export class PortalPaymentReaderDrizzle implements PortalPaymentReader {
  constructor(private readonly db: DbClient) {}

  resolveAccessByToken(token: string, now: Date): Promise<PortalAccess | null> {
    return withPublicToken(this.db, token, async (tx) => {
      const [r] = await tx
        .select({ clientId: clientPortalAccess.clientId, artisanId: clientPortalAccess.artisanId })
        .from(clientPortalAccess)
        .where(and(eq(clientPortalAccess.token, token), eq(clientPortalAccess.isActive, true), gte(clientPortalAccess.expiresAt, now)))
        .limit(1);
      return r ?? null;
    });
  }

  getFactureStatut(ctx: TenantContext, factureId: number): Promise<FacturePaiementStatut | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [f] = await tx
        .select({
          clientId: factures.clientId,
          statut: factures.statut,
          totalTTC: factures.totalTTC,
          montantPaye: factures.montantPaye,
          datePaiement: factures.datePaiement,
          modePaiement: factures.modePaiement,
        })
        .from(factures)
        .where(and(eq(factures.id, factureId), eq(factures.artisanId, ctx.artisanId)))
        .limit(1);
      if (!f) return null;
      return {
        clientId: f.clientId,
        statut: f.statut ?? "brouillon",
        totalTTC: f.totalTTC ?? "0.00",
        montantPaye: f.montantPaye ?? null,
        datePaiement: f.datePaiement ?? null,
        modePaiement: f.modePaiement ?? null,
      };
    });
  }

  getDernierPaiement(ctx: TenantContext, factureId: number): Promise<DernierPaiement | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [p] = await tx
        .select({ statut: paiementsStripe.statut, paidAt: paiementsStripe.paidAt })
        .from(paiementsStripe)
        .where(and(eq(paiementsStripe.factureId, factureId), eq(paiementsStripe.artisanId, ctx.artisanId)))
        .orderBy(desc(paiementsStripe.id))
        .limit(1);
      return p ? { statut: p.statut ?? "en_attente", paidAt: p.paidAt ?? null } : null;
    });
  }
}
