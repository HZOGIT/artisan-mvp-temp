import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { contratsMaintenance, clients, interventionsContrat, facturesRecurrentes } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository, ContratAFacturerRow, RecordFactureRecurrenteInput } from "../application/contrat-repository";
import type {
  Contrat,
  ContratPeriodicite,
  ContratStatut,
  ContratType,
  CreateContratInput,
  UpdateContratInput,
  ContratIntervention,
  ContratInterventionStatut,
  CreateContratInterventionInput,
  UpdateContratInterventionInput,
} from "../domain/contrat";

type ContratRow = typeof contratsMaintenance.$inferSelect;
type InterventionRow = typeof interventionsContrat.$inferSelect;

function toIntervention(r: InterventionRow): ContratIntervention {
  return {
    id: r.id,
    contratId: r.contratId,
    artisanId: r.artisanId,
    titre: r.titre,
    description: r.description ?? null,
    dateIntervention: r.dateIntervention,
    duree: r.duree ?? null,
    technicienNom: r.technicienNom ?? null,
    statut: (r.statut ?? "planifiee") as ContratInterventionStatut,
    rapport: r.rapport ?? null,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

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

/*
 * Implémentation Drizzle du repository contrats-maintenance. Double cloisonnement RLS + filtre
 * `artisanId` sur `contrats_maintenance`. `artisanId` forcé et `statut="actif"` posé à la création ;
 * `reference` générée serveur (jamais fournie par le client). Les transitions de statut passent par
 * `setStatut` ; `update` ne touche que les métadonnées. `clientId` validé via `ownsClient`.
 */
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
      /*
       * Génération serveur scopée tenant : borne sur MAX(reference) des contrats de l'artisan
       * (pas de compteur en base ; suffixe numérique `-(\d+)` incrémenté).
       */
      const [maxRow] = await tx
        .select({ maxRef: sql<string | null>`max(${contratsMaintenance.reference})` })
        .from(contratsMaintenance)
        .where(eq(contratsMaintenance.artisanId, ctx.artisanId));
      const m = maxRow?.maxRef?.match(/-(\d+)$/);
      const prochain = (m ? parseInt(m[1], 10) : 0) + 1;
      return `CTR-${String(prochain).padStart(5, "0")}`;
    });
  }

  listAFacturer(ctx: TenantContext): Promise<ContratAFacturerRow[]> {
    return withTenant(this.db, ctx, async (tx) => {
      /*
       * Parité legacy `getContratsAFacturer` : actifs, prochainFacturation ≤ fin de journée, du plus
       * ancien au plus récent. Jointure client (left) pour le nom (scopée tenant par le filtre artisanId).
       */
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const rows = await tx
        .select({ contrat: contratsMaintenance, clientNom: clients.nom, clientPrenom: clients.prenom })
        .from(contratsMaintenance)
        .leftJoin(clients, eq(clients.id, contratsMaintenance.clientId))
        .where(
          and(
            eq(contratsMaintenance.artisanId, ctx.artisanId),
            eq(contratsMaintenance.statut, "actif"),
            lte(contratsMaintenance.prochainFacturation, endOfToday),
          ),
        )
        .orderBy(asc(contratsMaintenance.prochainFacturation));
      return rows.map((r) => ({
        ...toContrat(r.contrat),
        clientNom: `${r.clientPrenom ?? ""} ${r.clientNom ?? ""}`.trim() || "Client",
      }));
    });
  }

  listInterventions(ctx: TenantContext, contratId: number): Promise<ContratIntervention[]> {
    return withTenant(this.db, ctx, async (tx) => {
      // Scope via le contrat parent : si le contrat n'est pas du tenant → [].
      const [owned] = await tx
        .select({ id: contratsMaintenance.id })
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.id, contratId), eq(contratsMaintenance.artisanId, ctx.artisanId)))
        .limit(1);
      if (!owned) return [];
      const rows = await tx
        .select()
        .from(interventionsContrat)
        .where(eq(interventionsContrat.contratId, contratId))
        .orderBy(desc(interventionsContrat.dateIntervention), desc(interventionsContrat.id));
      return rows.map(toIntervention);
    });
  }

  getInterventionById(ctx: TenantContext, id: number): Promise<ContratIntervention | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(interventionsContrat)
        .where(and(eq(interventionsContrat.id, id), eq(interventionsContrat.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toIntervention(row) : null;
    });
  }

  createIntervention(ctx: TenantContext, input: CreateContratInterventionInput): Promise<ContratIntervention> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(interventionsContrat)
        .values({
          contratId: input.contratId,
          artisanId: ctx.artisanId, // forcé
          titre: input.titre,
          description: input.description ?? null,
          dateIntervention: input.dateIntervention,
          duree: input.duree ?? null,
          technicienNom: input.technicienNom ?? null,
          statut: "planifiee", // forcé
          notes: input.notes ?? null,
        })
        .returning();
      return toIntervention(row);
    });
  }

  updateIntervention(ctx: TenantContext, id: number, input: UpdateContratInterventionInput): Promise<ContratIntervention | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const set: Partial<typeof interventionsContrat.$inferInsert> = { updatedAt: new Date() };
      if (input.titre !== undefined) set.titre = input.titre;
      if (input.description !== undefined) set.description = input.description;
      if (input.dateIntervention !== undefined) set.dateIntervention = input.dateIntervention;
      if (input.duree !== undefined) set.duree = input.duree;
      if (input.technicienNom !== undefined) set.technicienNom = input.technicienNom;
      if (input.statut !== undefined) set.statut = input.statut;
      if (input.rapport !== undefined) set.rapport = input.rapport;
      if (input.notes !== undefined) set.notes = input.notes;
      const [row] = await tx
        .update(interventionsContrat)
        .set(set)
        .where(and(eq(interventionsContrat.id, id), eq(interventionsContrat.artisanId, ctx.artisanId)))
        .returning();
      return row ? toIntervention(row) : null;
    });
  }

  recordFactureRecurrente(ctx: TenantContext, input: RecordFactureRecurrenteInput): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx.insert(facturesRecurrentes).values({
        contratId: input.contratId,
        factureId: input.factureId,
        periodeDebut: input.periodeDebut,
        periodeFin: input.periodeFin,
        genereeAutomatiquement: input.genereeAutomatiquement ?? false,
      });
    });
  }
}
