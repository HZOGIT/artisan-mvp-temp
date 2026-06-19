import { and, desc, eq, sql } from "drizzle-orm";
import { avisClients, clients, interventions } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IAvisRepository } from "../application/avis-repository";
import type { Avis, AvisEnrichi, AvisStats, StatutAvis } from "../domain/avis";

type AvisRow = typeof avisClients.$inferSelect;

function toAvis(r: AvisRow): Avis {
  return {
    id: r.id,
    artisanId: r.artisanId,
    clientId: r.clientId,
    interventionId: r.interventionId ?? null,
    note: r.note,
    commentaire: r.commentaire ?? null,
    tokenAvis: r.tokenAvis ?? null,
    reponseArtisan: r.reponseArtisan ?? null,
    reponseAt: r.reponseAt ?? null,
    statut: (r.statut ?? "en_attente") as StatutAvis,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/*
 * Implémentation Drizzle du repository avis. Double cloisonnement : RLS (rôle app
 * + app.tenant via withTenant) ET filtre explicite `artisanId` dans chaque requête.
 * Table `avis_clients` (sous RLS car possède une colonne artisanId).
 */
export class AvisRepositoryDrizzle implements IAvisRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Avis[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(avisClients)
        .where(eq(avisClients.artisanId, ctx.artisanId))
        .orderBy(desc(avisClients.createdAt), desc(avisClients.id));
      return rows.map(toAvis);
    });
  }

  listEnrichi(ctx: TenantContext): Promise<AvisEnrichi[]> {
    return withTenant(this.db, ctx, async (tx) => {
      /*
       * Jointures scopées tenant : le client et l'intervention liés doivent appartenir
       * au même artisan (RLS sur les 3 tables + condition artisanId dans le ON). Un avis
       * ne peut donc jamais exposer le client/intervention d'un autre tenant.
       */
      const rows = await tx
        .select({
          avis: avisClients,
          client: { id: clients.id, nom: clients.nom, prenom: clients.prenom, email: clients.email },
          intervention: { id: interventions.id, titre: interventions.titre, dateDebut: interventions.dateDebut },
        })
        .from(avisClients)
        .leftJoin(clients, and(eq(clients.id, avisClients.clientId), eq(clients.artisanId, ctx.artisanId)))
        .leftJoin(
          interventions,
          and(eq(interventions.id, avisClients.interventionId), eq(interventions.artisanId, ctx.artisanId)),
        )
        .where(eq(avisClients.artisanId, ctx.artisanId))
        .orderBy(desc(avisClients.createdAt), desc(avisClients.id));

      return rows.map((r) => ({
        ...toAvis(r.avis),
        client: r.client && r.client.id != null ? { ...r.client, prenom: r.client.prenom ?? null, email: r.client.email ?? null } : null,
        intervention: r.intervention && r.intervention.id != null ? r.intervention : null,
      }));
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Avis | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(avisClients)
        .where(and(eq(avisClients.id, id), eq(avisClients.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toAvis(row) : null;
    });
  }

  getStats(ctx: TenantContext): Promise<AvisStats> {
    return withTenant(this.db, ctx, async (tx) => {
      /*
       * Agrégats scopés tenant : moyenne, total, distribution des notes 1..5.
       * Seuls les avis publiés comptent dans les statistiques publiques.
       */
      const rows = await tx
        .select({ note: avisClients.note, count: sql<number>`count(*)::int` })
        .from(avisClients)
        .where(and(eq(avisClients.artisanId, ctx.artisanId), eq(avisClients.statut, "publie")))
        .groupBy(avisClients.note);

      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as { 1: number; 2: number; 3: number; 4: number; 5: number };
      let total = 0;
      let somme = 0;
      for (const r of rows) {
        const n = Number(r.count);
        if (r.note >= 1 && r.note <= 5) distribution[r.note as 1 | 2 | 3 | 4 | 5] = n;
        total += n;
        somme += r.note * n;
      }
      const moyenne = total > 0 ? Math.round((somme / total) * 10) / 10 : 0;
      return { moyenne, total, distribution };
    });
  }

  repondre(ctx: TenantContext, id: number, reponse: string): Promise<Avis | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(avisClients)
        .set({ reponseArtisan: reponse, reponseAt: new Date(), updatedAt: new Date() })
        .where(and(eq(avisClients.id, id), eq(avisClients.artisanId, ctx.artisanId)))
        .returning();
      return row ? toAvis(row) : null;
    });
  }

  changerStatut(ctx: TenantContext, id: number, statut: StatutAvis): Promise<Avis | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(avisClients)
        .set({ statut, updatedAt: new Date() })
        .where(and(eq(avisClients.id, id), eq(avisClients.artisanId, ctx.artisanId)))
        .returning();
      return row ? toAvis(row) : null;
    });
  }
}
