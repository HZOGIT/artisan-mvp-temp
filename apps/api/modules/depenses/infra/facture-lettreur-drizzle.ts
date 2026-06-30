import { and, eq, inArray } from "drizzle-orm";
import { factures, clients } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IFactureLettrerPort, FactureImpayeeItem } from "../application/facture-lettreur-port";
import { marquerFacturePayee } from "../../factures/application/write-use-cases";
import { FactureRepositoryDrizzle } from "../../factures/infra/facture-repository-drizzle";
import { ComptaEcrituresAdapter } from "../../ecritures/infra/compta-ecritures-adapter";
import { EcritureRepositoryDrizzle } from "../../ecritures/infra/ecriture-repository-drizzle";
import { FactureReaderDrizzle } from "../../ecritures/infra/facture-reader-drizzle";
import { NotificationRepositoryDrizzle } from "../../notifications/infra/notification-repository-drizzle";

export class FactureLettrerDrizzle implements IFactureLettrerPort {
  constructor(private readonly db: DbClient) {}

  listImpayees(ctx: TenantContext): Promise<FactureImpayeeItem[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({
          id: factures.id,
          totalTTC: factures.totalTTC,
          dateFacture: factures.dateFacture,
          numero: factures.numero,
          nomClient: clients.nom,
        })
        .from(factures)
        .leftJoin(clients, eq(clients.id, factures.clientId))
        .where(
          and(
            eq(factures.artisanId, ctx.artisanId),
            inArray(factures.statut, ["envoyee", "en_retard"]),
          ),
        )
        .limit(500);
      return rows.map((r) => ({
        id: r.id,
        totalTTC: r.totalTTC ?? "0",
        dateFacture: r.dateFacture,
        numero: r.numero ?? null,
        nomClient: r.nomClient ?? "",
      }));
    });
  }

  async payer(ctx: TenantContext, factureId: number, montantPaye: string, datePaiement: Date): Promise<void> {
    const repo = new FactureRepositoryDrizzle(this.db);
    const compta = new ComptaEcrituresAdapter(
      new EcritureRepositoryDrizzle(this.db),
      new FactureReaderDrizzle(this.db),
    );
    const notifRepo = new NotificationRepositoryDrizzle(this.db);
    await marquerFacturePayee(repo, ctx, factureId, { montantPaye, datePaiement: datePaiement.toISOString() }, compta, notifRepo);
  }
}
