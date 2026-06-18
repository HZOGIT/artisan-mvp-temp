import { and, desc, eq } from "drizzle-orm";
import { clients, interventions, demandesAvis } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDemandeAvisRepository } from "../application/demande-avis-repository";
import type { ClientRef, CreerDemandeInput, DemandeAvis, InterventionRef } from "../domain/demande-avis";

type DemandeRow = typeof demandesAvis.$inferSelect;

function toDemande(r: DemandeRow): DemandeAvis {
  return {
    id: r.id,
    artisanId: r.artisanId,
    clientId: r.clientId,
    interventionId: r.interventionId,
    tokenDemande: r.tokenDemande,
    emailEnvoyeAt: r.emailEnvoyeAt ?? null,
    expiresAt: r.expiresAt,
    statut: (r.statut ?? "envoyee") as DemandeAvis["statut"],
    createdAt: r.createdAt,
  };
}

// Implémentation Drizzle du repository demande d'avis. Double cloisonnement : RLS (rôle
// app + app.tenant via withTenant) ET filtre explicite `artisanId`. Toute lecture
// d'ownership renvoie null si la ressource n'appartient pas au tenant (NOT_FOUND uniforme).
export class DemandeAvisRepositoryDrizzle implements IDemandeAvisRepository {
  constructor(private readonly db: DbClient) {}

  getInterventionOwned(ctx: TenantContext, interventionId: number): Promise<InterventionRef | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ id: interventions.id, clientId: interventions.clientId, dateDebut: interventions.dateDebut })
        .from(interventions)
        .where(and(eq(interventions.id, interventionId), eq(interventions.artisanId, ctx.artisanId)))
        .limit(1);
      return row ?? null;
    });
  }

  getClientOwned(ctx: TenantContext, clientId: number): Promise<ClientRef | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ id: clients.id, nom: clients.nom, email: clients.email })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? { id: row.id, nom: row.nom, email: row.email ?? null } : null;
    });
  }

  getDerniereInterventionDuClient(ctx: TenantContext, clientId: number): Promise<InterventionRef | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ id: interventions.id, clientId: interventions.clientId, dateDebut: interventions.dateDebut })
        .from(interventions)
        .where(and(eq(interventions.clientId, clientId), eq(interventions.artisanId, ctx.artisanId)))
        .orderBy(desc(interventions.dateDebut), desc(interventions.id))
        .limit(1);
      return row ?? null;
    });
  }

  creerDemande(ctx: TenantContext, input: CreerDemandeInput): Promise<DemandeAvis> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(demandesAvis)
        .values({
          artisanId: ctx.artisanId,
          clientId: input.clientId,
          interventionId: input.interventionId,
          tokenDemande: input.tokenDemande,
          emailEnvoyeAt: input.emailEnvoyeAt,
          expiresAt: input.expiresAt,
          statut: "envoyee",
        })
        .returning();
      return toDemande(row);
    });
  }
}
