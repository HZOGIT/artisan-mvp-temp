import { and, asc, eq, gte, lte } from "drizzle-orm";
import { factures, clients } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { FactureCsvRow } from "../domain/csv-export";
import type { FacturesCsvReader } from "../application/factures-csv-reader";
import type { Periode } from "../application/comptabilite-reader";

// Factures de la période (dateFacture ∈ [début, fin]) + nom client, sous RLS (withTenant) + filtre
// artisanId explicite. Lecture seule, scopée tenant.
export class FacturesCsvReaderDrizzle implements FacturesCsvReader {
  constructor(private readonly db: DbClient) {}

  listFacturesPeriode(ctx: TenantContext, p: Periode): Promise<FactureCsvRow[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({
          dateFacture: factures.dateFacture,
          numero: factures.numero,
          clientNom: clients.nom,
          totalHT: factures.totalHT,
          totalTVA: factures.totalTVA,
          totalTTC: factures.totalTTC,
          statut: factures.statut,
        })
        .from(factures)
        .leftJoin(clients, and(eq(clients.id, factures.clientId), eq(clients.artisanId, ctx.artisanId)))
        .where(and(eq(factures.artisanId, ctx.artisanId), gte(factures.dateFacture, p.dateDebut), lte(factures.dateFacture, p.dateFin)))
        .orderBy(asc(factures.dateFacture));
      return rows.map(
        (r): FactureCsvRow => ({
          dateFacture: r.dateFacture,
          numero: r.numero,
          clientNom: r.clientNom ?? "Client",
          totalHT: r.totalHT ?? "0.00",
          totalTVA: r.totalTVA ?? "0.00",
          totalTTC: r.totalTTC ?? "0.00",
          statut: r.statut ?? "brouillon",
        }),
      );
    });
  }
}
