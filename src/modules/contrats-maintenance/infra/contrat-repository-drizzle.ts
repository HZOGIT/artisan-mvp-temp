import { and, desc, eq, sql } from "drizzle-orm";
import { contratsMaintenance, clients } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository } from "../application/contrat-repository";
import type { Contrat, ContratPeriodicite, ContratStatut, ContratType, CreateContratInput, UpdateContratInput } from "../domain/contrat";

type ContratRow = typeof contratsMaintenance.$inferSelect;

function toContrat(r: ContratRow): Contrat {
  return {
    id: r.id,
    artisanId: r.artisanId,
    clientId: r.clientId,
    reference: r.reference,
    titre: r.titre,
    description: r.description ?? null,
    type: (r.type ?? "entretien") as ContratType,
    montantHT: r.montantHT,
    tauxTVA: r.tauxTVA ?? "20.00",
    periodicite: r.periodicite as ContratPeriodicite,
    dateDebut: r.dateDebut,
    dateFin: r.dateFin ?? null,
    reconduction: r.reconduction ?? true,
    preavisResiliation: r.preavisResiliation ?? 1,
    prochainFacturation: r.prochainFacturation ?? null,
    prochainPassage: r.prochainPassage ?? null,
    conditionsParticulieres: r.conditionsParticulieres ?? null,
    statut: (r.statut ?? "actif") as ContratStatut,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Implémentation Drizzle du repository contrats-maintenance. Double cloisonnement RLS + filtre
// `artisanId` sur `contrats_maintenance`. `artisanId` forcé et `statut="actif"` posé à la création ;
// `reference` générée serveur (jamais fournie par le client). Les transitions de statut passent par
// `setStatut` ; `update` ne touche que les métadonnées. `clientId` validé via `ownsClient`.
export class ContratRepositoryDrizzle implements IContratRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Contrat[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(contratsMaintenance)
        .where(eq(contratsMaintenance.artisanId, ctx.artisanId))
        .orderBy(desc(contratsMaintenance.createdAt), desc(contratsMaintenance.id));
      return rows.map(toContrat);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Contrat | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.id, id), eq(contratsMaintenance.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toContrat(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateContratInput, reference: string): Promise<Contrat> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(contratsMaintenance)
        .values({
          artisanId: ctx.artisanId,
          clientId: input.clientId,
          reference, // générée serveur (argument)
          titre: input.titre,
          description: input.description ?? null,
          type: input.type ?? undefined,
          montantHT: input.montantHT,
          tauxTVA: input.tauxTVA ?? undefined,
          periodicite: input.periodicite,
          dateDebut: input.dateDebut,
          dateFin: input.dateFin ?? null,
          reconduction: input.reconduction ?? undefined,
          preavisResiliation: input.preavisResiliation ?? undefined,
          prochainFacturation: input.prochainFacturation ?? null,
          prochainPassage: input.prochainPassage ?? null,
          conditionsParticulieres: input.conditionsParticulieres ?? null,
          statut: "actif", // forcé
          notes: input.notes ?? null,
        })
        .returning();
      return toContrat(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateContratInput): Promise<Contrat | null> {
    return withTenant(this.db, ctx, async (tx) => {
      // Métadonnées seulement (UpdateContratInput exclut statut/reference/clientId).
      const set: Partial<typeof contratsMaintenance.$inferInsert> = { updatedAt: new Date() };
      if (input.titre !== undefined) set.titre = input.titre;
      if (input.description !== undefined) set.description = input.description;
      if (input.type !== undefined) set.type = input.type;
      if (input.montantHT !== undefined) set.montantHT = input.montantHT;
      if (input.tauxTVA !== undefined) set.tauxTVA = input.tauxTVA;
      if (input.periodicite !== undefined) set.periodicite = input.periodicite;
      if (input.dateDebut !== undefined) set.dateDebut = input.dateDebut;
      if (input.dateFin !== undefined) set.dateFin = input.dateFin;
      if (input.reconduction !== undefined) set.reconduction = input.reconduction;
      if (input.preavisResiliation !== undefined) set.preavisResiliation = input.preavisResiliation;
      if (input.prochainFacturation !== undefined) set.prochainFacturation = input.prochainFacturation;
      if (input.prochainPassage !== undefined) set.prochainPassage = input.prochainPassage;
      if (input.conditionsParticulieres !== undefined) set.conditionsParticulieres = input.conditionsParticulieres;
      if (input.notes !== undefined) set.notes = input.notes;
      const [row] = await tx
        .update(contratsMaintenance)
        .set(set)
        .where(and(eq(contratsMaintenance.id, id), eq(contratsMaintenance.artisanId, ctx.artisanId)))
        .returning();
      return row ? toContrat(row) : null;
    });
  }

  setStatut(ctx: TenantContext, id: number, statut: ContratStatut): Promise<Contrat | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(contratsMaintenance)
        .set({ statut, updatedAt: new Date() })
        .where(and(eq(contratsMaintenance.id, id), eq(contratsMaintenance.artisanId, ctx.artisanId)))
        .returning();
      return row ? toContrat(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(contratsMaintenance)
        .where(and(eq(contratsMaintenance.id, id), eq(contratsMaintenance.artisanId, ctx.artisanId)))
        .returning({ id: contratsMaintenance.id });
      return deleted.length > 0;
    });
  }

  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.artisanId, ctx.artisanId)));
      return (row?.n ?? 0) > 0;
    });
  }

  nextReference(ctx: TenantContext): Promise<string> {
    return withTenant(this.db, ctx, async (tx) => {
      // Génération serveur scopée tenant : borne sur MAX(reference) des contrats de l'artisan
      // (pas de compteur en base ; suffixe numérique `-(\d+)` incrémenté).
      const [maxRow] = await tx
        .select({ maxRef: sql<string | null>`max(${contratsMaintenance.reference})` })
        .from(contratsMaintenance)
        .where(eq(contratsMaintenance.artisanId, ctx.artisanId));
      const m = maxRow?.maxRef?.match(/-(\d+)$/);
      const prochain = (m ? parseInt(m[1], 10) : 0) + 1;
      return `CTR-${String(prochain).padStart(5, "0")}`;
    });
  }
}
