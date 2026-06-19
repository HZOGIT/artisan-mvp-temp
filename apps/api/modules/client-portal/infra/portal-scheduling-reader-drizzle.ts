import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { interventions, rdvEnLigne, chantiers, suiviChantier } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { CreateRdvData, IPortalSchedulingReader, PortalChantier, PortalChantierEtape, PortalRdv } from "../application/portal-scheduling-reader";
import type { CreneauOccupe } from "../domain/portal-scheduling";

type RdvRow = typeof rdvEnLigne.$inferSelect;

function toRdv(r: RdvRow): PortalRdv {
  return { id: r.id, titre: r.titre, description: r.description ?? null, dateProposee: r.dateProposee, dureeEstimee: r.dureeEstimee ?? null, statut: r.statut ?? null, motifRefus: r.motifRefus ?? null, urgence: r.urgence ?? null, createdAt: r.createdAt };
}

/*
 * Lecteur Drizzle de planification du portail. Tables rdv_en_ligne / interventions / chantiers SOUS RLS
 * (artisanId via withTenant). `suivi_chantier` (sans artisanId) n'est lu QUE pour les chantiers du
 * client déjà résolus → anti-IDOR par le chantier parent.
 */
export class PortalSchedulingReaderDrizzle implements IPortalSchedulingReader {
  constructor(private readonly db: DbClient) {}

  getCreneauxOccupes(ctx: TenantContext, debut: Date, fin: Date): Promise<CreneauOccupe[]> {
    // Sur-ensemble (lookback 48h) : une occupation qui déborde dans la fenêtre doit compter (parité legacy).
    const lookback = new Date(debut.getTime() - 48 * 60 * 60 * 1000);
    return withTenant(this.db, ctx, async (tx) => {
      const ints = await tx
        .select({ dateDebut: interventions.dateDebut, dateFin: interventions.dateFin })
        .from(interventions)
        .where(and(eq(interventions.artisanId, ctx.artisanId), ne(interventions.statut, "annulee"), gte(interventions.dateDebut, lookback), lte(interventions.dateDebut, fin)));
      const rdvs = await tx
        .select({ dateProposee: rdvEnLigne.dateProposee, dureeEstimee: rdvEnLigne.dureeEstimee })
        .from(rdvEnLigne)
        .where(and(eq(rdvEnLigne.artisanId, ctx.artisanId), inArray(rdvEnLigne.statut, ["en_attente", "confirme"]), gte(rdvEnLigne.dateProposee, lookback), lte(rdvEnLigne.dateProposee, fin)));
      const occupied: CreneauOccupe[] = [];
      for (const i of ints) occupied.push({ dateDebut: i.dateDebut, dateFin: i.dateFin ?? null });
      for (const r of rdvs) occupied.push({ dateDebut: r.dateProposee, dateFin: new Date(r.dateProposee.getTime() + (r.dureeEstimee || 60) * 60000) });
      return occupied;
    });
  }

  createRdv(ctx: TenantContext, data: CreateRdvData): Promise<PortalRdv> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(rdvEnLigne)
        .values({ artisanId: ctx.artisanId, clientId: data.clientId, titre: data.titre, description: data.description ?? null, urgence: data.urgence as never, dateProposee: data.dateProposee, dureeEstimee: data.dureeEstimee })
        .returning();
      return toRdv(row);
    });
  }

  getRdvByClient(ctx: TenantContext, clientId: number): Promise<PortalRdv[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx.select().from(rdvEnLigne).where(and(eq(rdvEnLigne.clientId, clientId), eq(rdvEnLigne.artisanId, ctx.artisanId))).orderBy(desc(rdvEnLigne.createdAt));
      return rows.map(toRdv);
    });
  }

  getChantiersWithSuivi(ctx: TenantContext, clientId: number): Promise<PortalChantier[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const chans = await tx
        .select({ id: chantiers.id, reference: chantiers.reference, nom: chantiers.nom, description: chantiers.description, adresse: chantiers.adresse, statut: chantiers.statut, avancement: chantiers.avancement, dateDebut: chantiers.dateDebut, dateFinPrevue: chantiers.dateFinPrevue })
        .from(chantiers)
        .where(and(eq(chantiers.clientId, clientId), eq(chantiers.artisanId, ctx.artisanId)));
      if (chans.length === 0) return [];
      // Étapes visibles client, en 1 requête pour tous les chantiers du client (anti N+1).
      const etapesRows = await tx
        .select({ id: suiviChantier.id, chantierId: suiviChantier.chantierId, titre: suiviChantier.titre, description: suiviChantier.description, statut: suiviChantier.statut, pourcentage: suiviChantier.pourcentage, ordre: suiviChantier.ordre, dateDebut: suiviChantier.dateDebut, dateFin: suiviChantier.dateFin, commentaire: suiviChantier.commentaire })
        .from(suiviChantier)
        .where(and(inArray(suiviChantier.chantierId, chans.map((c) => c.id)), eq(suiviChantier.visibleClient, true)))
        .orderBy(asc(suiviChantier.ordre));
      const etapesByChantier = new Map<number, PortalChantierEtape[]>();
      for (const e of etapesRows) {
        const arr = etapesByChantier.get(e.chantierId) ?? [];
        arr.push({ id: e.id, titre: e.titre, description: e.description ?? null, statut: e.statut ?? null, pourcentage: e.pourcentage ?? null, ordre: e.ordre ?? null, dateDebut: e.dateDebut ?? null, dateFin: e.dateFin ?? null, commentaire: e.commentaire ?? null });
        etapesByChantier.set(e.chantierId, arr);
      }
      return chans.map((c) => ({
        id: c.id, reference: c.reference ?? null, nom: c.nom, description: c.description ?? null, adresse: c.adresse ?? null, statut: c.statut ?? null,
        avancement: c.avancement ?? null, dateDebut: c.dateDebut ?? null, dateFinPrevue: c.dateFinPrevue ?? null, etapes: etapesByChantier.get(c.id) ?? [],
      }));
    });
  }
}
