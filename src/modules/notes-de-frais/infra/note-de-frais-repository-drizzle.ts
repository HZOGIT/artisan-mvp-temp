import { and, desc, eq } from "drizzle-orm";
import { notesDeFrais } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { INoteDeFraisRepository, NoteDeFraisWorkflowPatch } from "../application/note-de-frais-repository";
import type { NoteDeFrais, CreateNoteDeFraisInput, UpdateNoteDeFraisInput } from "../domain/note-de-frais";
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

// Implémentation Drizzle du repository notes-de-frais. Double cloisonnement RLS + filtre
// `artisan_id` (snake_case). ⚠️ `update` ne touche que les métadonnées (`UpdateNoteDeFraisInput`
// exclut statut/dates workflow/commentaire) → le workflow d'approbation est porté ailleurs.
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
