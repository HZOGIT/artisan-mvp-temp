import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  chantiers,
  clients,
  techniciens,
  interventions,
  phasesChantier,
  interventionsChantier,
  documentsChantier,
  suiviChantier,
  pointagesChantier,
  depenses,
} from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IChantierRepository } from "../application/chantier-repository";
import type {
  Chantier,
  CreateChantierInput,
  UpdateChantierInput,
  ChantierPointage,
  CreatePointageInput,
  ChantierSuivi,
  SuiviStatut,
  CreateSuiviInput,
  UpdateSuiviInput,
  ChantierPhase,
  PhaseStatut,
  CreatePhaseInput,
  UpdatePhaseInput,
  ChantierInterventionLien,
  AssocierInterventionInput,
  ChantierDocument,
  DocumentChantierType,
  AddDocumentInput,
} from "../domain/chantier";

type PointageRow = typeof pointagesChantier.$inferSelect;

function toPointage(r: PointageRow): ChantierPointage {
  return {
    id: r.id,
    chantierId: r.chantierId,
    phaseId: r.phaseId ?? null,
    technicienId: r.technicienId ?? null,
    date: r.date,
    heures: r.heures,
    description: r.description ?? null,
    createdAt: r.createdAt,
  };
}

type SuiviRow = typeof suiviChantier.$inferSelect;

function toSuivi(r: SuiviRow): ChantierSuivi {
  return {
    id: r.id,
    chantierId: r.chantierId,
    titre: r.titre,
    description: r.description ?? null,
    statut: (r.statut ?? "a_faire") as SuiviStatut,
    pourcentage: r.pourcentage ?? 0,
    ordre: r.ordre ?? 1,
    visibleClient: r.visibleClient ?? true,
    dateDebut: r.dateDebut ?? null,
    dateFin: r.dateFin ?? null,
    commentaire: r.commentaire ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

type PhaseRow = typeof phasesChantier.$inferSelect;

function toPhase(r: PhaseRow): ChantierPhase {
  return {
    id: r.id,
    chantierId: r.chantierId,
    nom: r.nom,
    description: r.description ?? null,
    ordre: r.ordre ?? 1,
    dateDebutPrevue: r.dateDebutPrevue ?? null,
    dateFinPrevue: r.dateFinPrevue ?? null,
    dateDebutReelle: r.dateDebutReelle ?? null,
    dateFinReelle: r.dateFinReelle ?? null,
    statut: (r.statut ?? "a_faire") as PhaseStatut,
    avancement: r.avancement ?? 0,
    budgetPhase: r.budgetPhase ?? null,
    coutReel: r.coutReel ?? null,
    heuresPrevues: r.heuresPrevues ?? null,
    createdAt: r.createdAt,
  };
}

type InterventionLienRow = typeof interventionsChantier.$inferSelect;

function toLien(r: InterventionLienRow): ChantierInterventionLien {
  return {
    id: r.id,
    chantierId: r.chantierId,
    interventionId: r.interventionId,
    phaseId: r.phaseId ?? null,
    ordre: r.ordre ?? 1,
    createdAt: r.createdAt,
  };
}

type DocumentRow = typeof documentsChantier.$inferSelect;

function toDocument(r: DocumentRow): ChantierDocument {
  return {
    id: r.id,
    chantierId: r.chantierId,
    nom: r.nom,
    type: (r.type ?? "autre") as DocumentChantierType,
    url: r.url,
    taille: r.taille ?? null,
    uploadedAt: r.uploadedAt,
  };
}

type ChantierRow = typeof chantiers.$inferSelect;

function toChantier(r: ChantierRow): Chantier {
  return {
    id: r.id,
    artisanId: r.artisanId,
    clientId: r.clientId,
    reference: r.reference,
    nom: r.nom,
    description: r.description ?? null,
    adresse: r.adresse ?? null,
    codePostal: r.codePostal ?? null,
    ville: r.ville ?? null,
    dateDebut: r.dateDebut ?? null,
    dateFinPrevue: r.dateFinPrevue ?? null,
    dateFinReelle: r.dateFinReelle ?? null,
    budgetPrevisionnel: r.budgetPrevisionnel ?? null,
    budgetRealise: r.budgetRealise ?? "0.00",
    statut: (r.statut ?? "planifie") as Chantier["statut"],
    avancement: r.avancement ?? 0,
    priorite: (r.priorite ?? "normale") as Chantier["priorite"],
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Implémentation Drizzle du repository chantiers. Double cloisonnement RLS + filtre `artisanId`.
// ⚠️ Toute requête by-id porte `and(eq(id), eq(artisanId, ctx.artisanId))` → aucune fuite
// cross-tenant. `create` insère le `clientId` fourni SANS vérifier son ownership : la garde
// anti-IDOR-FK est portée par le use-case d'écriture (4/9). `update` ne touche pas `clientId`.
export class ChantierRepositoryDrizzle implements IChantierRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Chantier[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(chantiers)
        .where(eq(chantiers.artisanId, ctx.artisanId))
        .orderBy(desc(chantiers.createdAt), desc(chantiers.id));
      return rows.map(toChantier);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Chantier | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(chantiers)
        .where(and(eq(chantiers.id, id), eq(chantiers.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toChantier(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateChantierInput): Promise<Chantier> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(chantiers)
        .values({ ...input, artisanId: ctx.artisanId } as typeof chantiers.$inferInsert)
        .returning();
      return toChantier(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateChantierInput): Promise<Chantier | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(chantiers)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(chantiers.id, id), eq(chantiers.artisanId, ctx.artisanId)))
        .returning();
      return row ? toChantier(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      // Vérifie l'appartenance AVANT de purger les sous-ressources (tables enfants scopées via
      // le chantier, sans artisanId propre pour certaines) → on ne supprime pas celles d'un
      // autre tenant. Cascade atomique = parité legacy deleteChantier (évite des lignes
      // orphelines pointant un chantierId supprimé). Le périmètre fonctionnel de ces
      // sous-ressources (CRUD phases/pointages/documents/suivi/associations) reste à migrer.
      const [owned] = await tx
        .select({ id: chantiers.id })
        .from(chantiers)
        .where(and(eq(chantiers.id, id), eq(chantiers.artisanId, ctx.artisanId)))
        .limit(1);
      if (!owned) return false;

      await tx.delete(documentsChantier).where(eq(documentsChantier.chantierId, id));
      await tx.delete(interventionsChantier).where(eq(interventionsChantier.chantierId, id));
      await tx.delete(phasesChantier).where(eq(phasesChantier.chantierId, id));
      await tx.delete(suiviChantier).where(eq(suiviChantier.chantierId, id));
      await tx.delete(pointagesChantier).where(eq(pointagesChantier.chantierId, id));

      const deleted = await tx
        .delete(chantiers)
        .where(and(eq(chantiers.id, id), eq(chantiers.artisanId, ctx.artisanId)))
        .returning({ id: chantiers.id });
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

  ownsTechnicien(ctx: TenantContext, technicienId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(techniciens)
        .where(and(eq(techniciens.id, technicienId), eq(techniciens.artisanId, ctx.artisanId)));
      return (row?.n ?? 0) > 0;
    });
  }

  private async ownsChantier(tx: DbClient, ctx: TenantContext, chantierId: number): Promise<boolean> {
    const [row] = await tx
      .select({ id: chantiers.id })
      .from(chantiers)
      .where(and(eq(chantiers.id, chantierId), eq(chantiers.artisanId, ctx.artisanId)))
      .limit(1);
    return Boolean(row);
  }

  listPointages(ctx: TenantContext, chantierId: number): Promise<ChantierPointage[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsChantier(tx, ctx, chantierId))) return [];
      const rows = await tx
        .select()
        .from(pointagesChantier)
        .where(and(eq(pointagesChantier.chantierId, chantierId), eq(pointagesChantier.artisanId, ctx.artisanId)))
        .orderBy(desc(pointagesChantier.date), asc(pointagesChantier.id));
      return rows.map(toPointage);
    });
  }

  addPointage(ctx: TenantContext, input: CreatePointageInput): Promise<ChantierPointage | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsChantier(tx, ctx, input.chantierId))) return null;
      const [row] = await tx
        .insert(pointagesChantier)
        .values({
          artisanId: ctx.artisanId,
          chantierId: input.chantierId,
          phaseId: input.phaseId ?? null,
          technicienId: input.technicienId ?? null,
          date: input.date,
          heures: input.heures,
          description: input.description ?? null,
        })
        .returning();
      return toPointage(row);
    });
  }

  deletePointage(ctx: TenantContext, chantierId: number, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(pointagesChantier)
        .where(
          and(eq(pointagesChantier.id, id), eq(pointagesChantier.chantierId, chantierId), eq(pointagesChantier.artisanId, ctx.artisanId)),
        )
        .returning({ id: pointagesChantier.id });
      return deleted.length > 0;
    });
  }

  // ⚠️ `suivi_chantier` n'a PAS d'artisanId : ces méthodes ne sont PAS scopées tenant au niveau SQL —
  // l'ownership (via le chantier parent) est garanti par le use-case AVANT l'appel (anti-IDOR).
  listSuivi(ctx: TenantContext, chantierId: number): Promise<ChantierSuivi[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(suiviChantier)
        .where(eq(suiviChantier.chantierId, chantierId))
        .orderBy(asc(suiviChantier.ordre), asc(suiviChantier.id));
      return rows.map(toSuivi);
    });
  }

  getSuiviById(ctx: TenantContext, id: number): Promise<ChantierSuivi | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx.select().from(suiviChantier).where(eq(suiviChantier.id, id)).limit(1);
      return row ? toSuivi(row) : null;
    });
  }

  addSuivi(ctx: TenantContext, input: CreateSuiviInput): Promise<ChantierSuivi> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(suiviChantier)
        .values({
          chantierId: input.chantierId,
          titre: input.titre,
          description: input.description ?? null,
          statut: input.statut ?? undefined,
          pourcentage: input.pourcentage ?? undefined,
          ordre: input.ordre ?? undefined,
          visibleClient: input.visibleClient ?? undefined,
          dateDebut: input.dateDebut ?? null,
          dateFin: input.dateFin ?? null,
          commentaire: input.commentaire ?? null,
        })
        .returning();
      return toSuivi(row);
    });
  }

  updateSuivi(ctx: TenantContext, id: number, input: UpdateSuiviInput): Promise<ChantierSuivi | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const set: Partial<typeof suiviChantier.$inferInsert> = { updatedAt: new Date() };
      if (input.titre !== undefined) set.titre = input.titre;
      if (input.description !== undefined) set.description = input.description;
      if (input.statut !== undefined) set.statut = input.statut;
      if (input.pourcentage !== undefined) set.pourcentage = input.pourcentage;
      if (input.ordre !== undefined) set.ordre = input.ordre;
      if (input.visibleClient !== undefined) set.visibleClient = input.visibleClient;
      if (input.dateDebut !== undefined) set.dateDebut = input.dateDebut;
      if (input.dateFin !== undefined) set.dateFin = input.dateFin;
      if (input.commentaire !== undefined) set.commentaire = input.commentaire;
      const [row] = await tx.update(suiviChantier).set(set).where(eq(suiviChantier.id, id)).returning();
      return row ? toSuivi(row) : null;
    });
  }

  deleteSuivi(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx.delete(suiviChantier).where(eq(suiviChantier.id, id)).returning({ id: suiviChantier.id });
      return deleted.length > 0;
    });
  }

  // ⚠️ `phases_chantier` n'a PAS d'artisanId : pas de scoping tenant au SQL — l'ownership (via le
  // chantier parent) est garanti par le use-case AVANT l'appel (anti-IDOR).
  listPhases(ctx: TenantContext, chantierId: number): Promise<ChantierPhase[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(phasesChantier)
        .where(eq(phasesChantier.chantierId, chantierId))
        .orderBy(asc(phasesChantier.ordre), asc(phasesChantier.id));
      return rows.map(toPhase);
    });
  }

  getPhaseById(ctx: TenantContext, id: number): Promise<ChantierPhase | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx.select().from(phasesChantier).where(eq(phasesChantier.id, id)).limit(1);
      return row ? toPhase(row) : null;
    });
  }

  addPhase(ctx: TenantContext, input: CreatePhaseInput): Promise<ChantierPhase> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(phasesChantier)
        .values({
          chantierId: input.chantierId,
          nom: input.nom,
          description: input.description ?? null,
          ordre: input.ordre ?? undefined,
          dateDebutPrevue: input.dateDebutPrevue ?? null,
          dateFinPrevue: input.dateFinPrevue ?? null,
          budgetPhase: input.budgetPhase ?? null,
          heuresPrevues: input.heuresPrevues ?? null,
        })
        .returning();
      return toPhase(row);
    });
  }

  updatePhase(ctx: TenantContext, id: number, input: UpdatePhaseInput): Promise<ChantierPhase | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const set: Partial<typeof phasesChantier.$inferInsert> = {};
      if (input.nom !== undefined) set.nom = input.nom;
      if (input.statut !== undefined) set.statut = input.statut;
      if (input.avancement !== undefined) set.avancement = input.avancement;
      if (input.dateDebutReelle !== undefined) set.dateDebutReelle = input.dateDebutReelle;
      if (input.dateFinReelle !== undefined) set.dateFinReelle = input.dateFinReelle;
      if (input.coutReel !== undefined) set.coutReel = input.coutReel;
      if (input.heuresPrevues !== undefined) set.heuresPrevues = input.heuresPrevues;
      // `phases_chantier` n'a pas d'`updatedAt` → si rien à modifier, renvoyer la phase telle quelle
      // (évite un `SET` vide invalide).
      if (Object.keys(set).length === 0) {
        const [cur] = await tx.select().from(phasesChantier).where(eq(phasesChantier.id, id)).limit(1);
        return cur ? toPhase(cur) : null;
      }
      const [row] = await tx.update(phasesChantier).set(set).where(eq(phasesChantier.id, id)).returning();
      return row ? toPhase(row) : null;
    });
  }

  deletePhase(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx.delete(phasesChantier).where(eq(phasesChantier.id, id)).returning({ id: phasesChantier.id });
      return deleted.length > 0;
    });
  }

  // ── Interventions liées (`interventions_chantier`, SANS artisanId) ────────────────────────────
  // `interventions` est scopée RLS/tenant (artisanId) → ce SELECT ne voit que les interventions du
  // tenant (anti-IDOR-FK : interdit d'associer l'intervention d'un autre tenant).
  ownsIntervention(ctx: TenantContext, interventionId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ id: interventions.id })
        .from(interventions)
        .where(eq(interventions.id, interventionId))
        .limit(1);
      return !!row;
    });
  }

  listInterventionsLiens(ctx: TenantContext, chantierId: number): Promise<ChantierInterventionLien[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(interventionsChantier)
        .where(eq(interventionsChantier.chantierId, chantierId))
        .orderBy(asc(interventionsChantier.ordre), asc(interventionsChantier.id));
      return rows.map(toLien);
    });
  }

  listAllInterventionsLiens(ctx: TenantContext): Promise<ChantierInterventionLien[]> {
    return withTenant(this.db, ctx, async (tx) => {
      // chantiers est scopée RLS/tenant → on ne récupère que les chantiers du tenant.
      const ids = await tx.select({ id: chantiers.id }).from(chantiers);
      if (ids.length === 0) return [];
      const rows = await tx
        .select()
        .from(interventionsChantier)
        .where(inArray(interventionsChantier.chantierId, ids.map((c) => c.id)))
        .orderBy(asc(interventionsChantier.ordre), asc(interventionsChantier.id));
      return rows.map(toLien);
    });
  }

  associerIntervention(ctx: TenantContext, input: AssocierInterventionInput): Promise<ChantierInterventionLien> {
    return withTenant(this.db, ctx, async (tx) => {
      // Idempotent : si le lien (chantier,intervention) existe déjà, le renvoyer tel quel.
      const [existing] = await tx
        .select()
        .from(interventionsChantier)
        .where(
          and(
            eq(interventionsChantier.chantierId, input.chantierId),
            eq(interventionsChantier.interventionId, input.interventionId),
          ),
        )
        .limit(1);
      if (existing) return toLien(existing);
      const [row] = await tx
        .insert(interventionsChantier)
        .values({
          chantierId: input.chantierId,
          interventionId: input.interventionId,
          phaseId: input.phaseId ?? null,
          ordre: input.ordre ?? undefined,
        })
        .returning();
      return toLien(row);
    });
  }

  dissocierIntervention(ctx: TenantContext, chantierId: number, interventionId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(interventionsChantier)
        .where(
          and(
            eq(interventionsChantier.chantierId, chantierId),
            eq(interventionsChantier.interventionId, interventionId),
          ),
        )
        .returning({ id: interventionsChantier.id });
      return deleted.length > 0;
    });
  }

  // ⚠️ `documents_chantier` n'a PAS d'artisanId : scopé via le chantier parent par le use-case.
  listDocuments(ctx: TenantContext, chantierId: number): Promise<ChantierDocument[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(documentsChantier)
        .where(eq(documentsChantier.chantierId, chantierId))
        .orderBy(desc(documentsChantier.uploadedAt), desc(documentsChantier.id));
      return rows.map(toDocument);
    });
  }

  getDocumentById(ctx: TenantContext, id: number): Promise<ChantierDocument | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx.select().from(documentsChantier).where(eq(documentsChantier.id, id)).limit(1);
      return row ? toDocument(row) : null;
    });
  }

  addDocument(ctx: TenantContext, input: AddDocumentInput): Promise<ChantierDocument> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(documentsChantier)
        .values({
          chantierId: input.chantierId,
          nom: input.nom,
          type: input.type ?? undefined,
          url: input.url,
          taille: input.taille ?? null,
        })
        .returning();
      return toDocument(row);
    });
  }

  deleteDocument(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx.delete(documentsChantier).where(eq(documentsChantier.id, id)).returning({ id: documentsChantier.id });
      return deleted.length > 0;
    });
  }

  // `depenses` a `artisan_id` (RLS) → ce SELECT ne voit que les dépenses du tenant ; on borne aussi
  // sur `chantier_id` (sous-ressource du chantier déjà vérifié par le use-case).
  sumDepensesChantier(ctx: TenantContext, chantierId: number): Promise<string> {
    return withTenant(this.db, ctx, async (tx) => {
      const [agg] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)` })
        .from(depenses)
        .where(and(eq(depenses.chantier_id, chantierId), eq(depenses.artisan_id, ctx.artisanId)));
      return String(agg?.total ?? "0");
    });
  }

  setAvancement(ctx: TenantContext, chantierId: number, avancement: number): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      // `chantiers` est scopée RLS/tenant → l'UPDATE ne touche que le chantier du tenant.
      await tx.update(chantiers).set({ avancement, updatedAt: new Date() }).where(eq(chantiers.id, chantierId));
    });
  }
}
