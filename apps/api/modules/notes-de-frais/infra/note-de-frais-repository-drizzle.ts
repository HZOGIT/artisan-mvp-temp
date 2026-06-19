import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { notesDeFrais, notesFraisDepenses, depenses } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { INoteDeFraisRepository, NoteDeFraisWorkflowPatch, DepenseLieeStatut } from "../application/note-de-frais-repository";
import type { NoteDeFrais, NoteFraisDepense, CreateNoteDeFraisInput, UpdateNoteDeFraisInput } from "../domain/note-de-frais";
import { computeNextNoteFraisNumero } from "../application/numero";

type NoteRow = typeof notesDeFrais.$inferSelect;

// ⚠️ Table `notes_de_frais` en snake_case → mapping snake↔camel ici (le domaine reste camelCase).
function toNoteDeFrais(r: NoteRow): NoteDeFrais {
  return {
    id: r.id,
    artisanId: r.artisan_id,
    userId: r.user_id,
    numero: r.numero,
    titre: r.titre,
    periodeDebut: r.periode_debut,
    periodeFin: r.periode_fin,
    statut: (r.statut ?? "brouillon") as NoteDeFrais["statut"],
    montantTotal: r.montant_total ?? "0",
    montantRembourse: r.montant_rembourse ?? "0",
    dateSoumission: r.date_soumission ?? null,
    dateApprobation: r.date_approbation ?? null,
    datePaiement: r.date_paiement ?? null,
    commentaireApprobateur: r.commentaire_approbateur ?? null,
    createdAt: r.created_at ?? null,
  };
}

/*
 * Implémentation Drizzle du repository notes-de-frais. Double cloisonnement RLS + filtre
 * `artisan_id` (snake_case). ⚠️ `update` ne touche que les métadonnées (`UpdateNoteDeFraisInput`
 * exclut statut/dates workflow/commentaire) → le workflow d'approbation est porté ailleurs.
 */
export class NoteDeFraisRepositoryDrizzle implements INoteDeFraisRepository {
  nextNumero(ctx: TenantContext): Promise<string> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ numero: notesDeFrais.numero })
        .from(notesDeFrais)
        .where(eq(notesDeFrais.artisan_id, ctx.artisanId))
        .orderBy(desc(notesDeFrais.id))
        .limit(1);
      return computeNextNoteFraisNumero(row?.numero ?? "");
    });
  }

  /*
   * Dépenses liées à une note (détails), scopé tenant. ⚠️ Note du tenant requise (anti-IDOR :
   * [] sinon). Join `notes_frais_depenses ⋈ depenses` (même pattern que le recalcul de montant).
   */
  getDepensesForNote(ctx: TenantContext, noteId: number): Promise<NoteFraisDepense[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const [note] = await tx.select({ id: notesDeFrais.id }).from(notesDeFrais).where(and(eq(notesDeFrais.id, noteId), eq(notesDeFrais.artisan_id, ctx.artisanId))).limit(1);
      if (!note) return [];
      const rows = await tx
        .select({
          id: depenses.id,
          numero: depenses.numero,
          fournisseur: depenses.fournisseur,
          dateDepense: depenses.date_depense,
          categorie: depenses.categorie,
          montantTtc: depenses.montant_ttc,
        })
        .from(depenses)
        .innerJoin(notesFraisDepenses, eq(notesFraisDepenses.depense_id, depenses.id))
        .where(and(eq(notesFraisDepenses.note_id, noteId), eq(depenses.artisan_id, ctx.artisanId)))
        .orderBy(desc(depenses.date_depense), desc(depenses.id));
      return rows.map((r) => ({
        id: r.id,
        numero: r.numero,
        fournisseur: r.fournisseur ?? null,
        dateDepense: r.dateDepense,
        categorie: r.categorie,
        montantTtc: r.montantTtc ?? "0",
      }));
    });
  }

  /*
   * Compteur de dépenses liées par note (tenant) : Map noteId → count. Join via les notes
   * du tenant (scope l'agrégat au tenant sans exposer les liens d'autrui).
   */
  countDepensesByNote(ctx: TenantContext): Promise<Map<number, number>> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ noteId: notesFraisDepenses.note_id, n: sql<number>`COUNT(*)::int` })
        .from(notesFraisDepenses)
        .innerJoin(notesDeFrais, eq(notesDeFrais.id, notesFraisDepenses.note_id))
        .where(eq(notesDeFrais.artisan_id, ctx.artisanId))
        .groupBy(notesFraisDepenses.note_id);
      return new Map(rows.map((r) => [r.noteId, Number(r.n)]));
    });
  }

  addDepenseLink(ctx: TenantContext, noteId: number, depenseId: number): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      // 1) la note doit appartenir au tenant.
      const [note] = await tx.select({ id: notesDeFrais.id }).from(notesDeFrais).where(and(eq(notesDeFrais.id, noteId), eq(notesDeFrais.artisan_id, ctx.artisanId))).limit(1);
      if (!note) return;
      // 2) la dépense doit appartenir au tenant ET être remboursable.
      const [dep] = await tx.select({ remboursable: depenses.remboursable }).from(depenses).where(and(eq(depenses.id, depenseId), eq(depenses.artisan_id, ctx.artisanId))).limit(1);
      if (!dep || !dep.remboursable) return;
      // 3) lien idempotent (contrainte unique note_id+depense_id), puis recalcul du total.
      await tx.insert(notesFraisDepenses).values({ note_id: noteId, depense_id: depenseId }).onConflictDoNothing();
      const [agg] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)` })
        .from(depenses)
        .innerJoin(notesFraisDepenses, eq(notesFraisDepenses.depense_id, depenses.id))
        .where(and(eq(notesFraisDepenses.note_id, noteId), eq(depenses.artisan_id, ctx.artisanId), eq(depenses.remboursable, true)));
      await tx.update(notesDeFrais).set({ montant_total: String(Number(agg?.total || 0)) }).where(and(eq(notesDeFrais.id, noteId), eq(notesDeFrais.artisan_id, ctx.artisanId)));
    });
  }

  appliquerStatutDepensesLiees(
    ctx: TenantContext,
    noteId: number,
    patch: { statut: DepenseLieeStatut; rembourse?: boolean; dateRemboursement?: string },
  ): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      // 1) la note doit appartenir au tenant (anti-IDOR ; skip silencieux sinon).
      const [note] = await tx.select({ id: notesDeFrais.id }).from(notesDeFrais).where(and(eq(notesDeFrais.id, noteId), eq(notesDeFrais.artisan_id, ctx.artisanId))).limit(1);
      if (!note) return;
      // 2) propage aux dépenses REMBOURSABLES du tenant liées à la note (sous-requête sur le lien).
      const set: Partial<typeof depenses.$inferInsert> = { statut: patch.statut };
      if (patch.rembourse !== undefined) set.rembourse = patch.rembourse;
      if (patch.dateRemboursement !== undefined) set.date_remboursement = patch.dateRemboursement;
      const liees = tx.select({ id: notesFraisDepenses.depense_id }).from(notesFraisDepenses).where(eq(notesFraisDepenses.note_id, noteId));
      await tx
        .update(depenses)
        .set(set)
        .where(and(eq(depenses.artisan_id, ctx.artisanId), eq(depenses.remboursable, true), inArray(depenses.id, liees)));
    });
  }

  removeDepenseLink(ctx: TenantContext, noteId: number, depenseId: number): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      const [note] = await tx.select({ id: notesDeFrais.id }).from(notesDeFrais).where(and(eq(notesDeFrais.id, noteId), eq(notesDeFrais.artisan_id, ctx.artisanId))).limit(1);
      if (!note) return;
      await tx.delete(notesFraisDepenses).where(and(eq(notesFraisDepenses.note_id, noteId), eq(notesFraisDepenses.depense_id, depenseId)));
      const [agg] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)` })
        .from(depenses)
        .innerJoin(notesFraisDepenses, eq(notesFraisDepenses.depense_id, depenses.id))
        .where(and(eq(notesFraisDepenses.note_id, noteId), eq(depenses.artisan_id, ctx.artisanId), eq(depenses.remboursable, true)));
      await tx.update(notesDeFrais).set({ montant_total: String(Number(agg?.total || 0)) }).where(and(eq(notesDeFrais.id, noteId), eq(notesDeFrais.artisan_id, ctx.artisanId)));
    });
  }

  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<NoteDeFrais[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(notesDeFrais)
        .where(eq(notesDeFrais.artisan_id, ctx.artisanId))
        .orderBy(desc(notesDeFrais.periode_debut), desc(notesDeFrais.id));
      return rows.map(toNoteDeFrais);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<NoteDeFrais | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(notesDeFrais)
        .where(and(eq(notesDeFrais.id, id), eq(notesDeFrais.artisan_id, ctx.artisanId)))
        .limit(1);
      return row ? toNoteDeFrais(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateNoteDeFraisInput): Promise<NoteDeFrais> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(notesDeFrais)
        .values({
          artisan_id: ctx.artisanId,
          user_id: input.userId,
          numero: input.numero,
          titre: input.titre,
          periode_debut: input.periodeDebut,
          periode_fin: input.periodeFin,
          montant_total: input.montantTotal ?? "0",
          montant_rembourse: input.montantRembourse ?? "0",
        } as typeof notesDeFrais.$inferInsert)
        .returning();
      return toNoteDeFrais(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateNoteDeFraisInput): Promise<NoteDeFrais | null> {
    return withTenant(this.db, ctx, async (tx) => {
      // Métadonnées seulement (snake mapping). Pas de statut/dates workflow.
      const set: Partial<typeof notesDeFrais.$inferInsert> = {};
      if (input.titre !== undefined) set.titre = input.titre;
      if (input.periodeDebut !== undefined) set.periode_debut = input.periodeDebut;
      if (input.periodeFin !== undefined) set.periode_fin = input.periodeFin;
      if (input.montantTotal !== undefined) set.montant_total = input.montantTotal;
      if (input.montantRembourse !== undefined) set.montant_rembourse = input.montantRembourse;

      if (Object.keys(set).length === 0) {
        // Aucun champ à modifier : renvoie l'état courant (scopé) sans UPDATE vide.
        const [row] = await tx
          .select()
          .from(notesDeFrais)
          .where(and(eq(notesDeFrais.id, id), eq(notesDeFrais.artisan_id, ctx.artisanId)))
          .limit(1);
        return row ? toNoteDeFrais(row) : null;
      }

      const [row] = await tx
        .update(notesDeFrais)
        .set(set)
        .where(and(eq(notesDeFrais.id, id), eq(notesDeFrais.artisan_id, ctx.artisanId)))
        .returning();
      return row ? toNoteDeFrais(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(notesDeFrais)
        .where(and(eq(notesDeFrais.id, id), eq(notesDeFrais.artisan_id, ctx.artisanId)))
        .returning({ id: notesDeFrais.id });
      return deleted.length > 0;
    });
  }

  setWorkflow(ctx: TenantContext, id: number, patch: NoteDeFraisWorkflowPatch): Promise<NoteDeFrais | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const set: Partial<typeof notesDeFrais.$inferInsert> = { statut: patch.statut };
      if (patch.dateSoumission !== undefined) set.date_soumission = patch.dateSoumission;
      if (patch.dateApprobation !== undefined) set.date_approbation = patch.dateApprobation;
      if (patch.datePaiement !== undefined) set.date_paiement = patch.datePaiement;
      if (patch.commentaireApprobateur !== undefined) set.commentaire_approbateur = patch.commentaireApprobateur;
      const [row] = await tx
        .update(notesDeFrais)
        .set(set)
        .where(and(eq(notesDeFrais.id, id), eq(notesDeFrais.artisan_id, ctx.artisanId)))
        .returning();
      return row ? toNoteDeFrais(row) : null;
    });
  }
}
