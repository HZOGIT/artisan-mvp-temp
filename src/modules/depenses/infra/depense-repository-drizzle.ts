import { and, desc, eq, sql } from "drizzle-orm";
import { depenses, chantiers, interventions, clients } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDepenseRepository, DepenseRefKind } from "../application/depense-repository";
import type { Depense, CreateDepenseInput, UpdateDepenseInput } from "../domain/depense";
import { computeNextNumero } from "../application/numero";

type DepenseRow = typeof depenses.$inferSelect;

// ⚠️ Table `depenses` en snake_case → mapping snake↔camel ici (le domaine reste camelCase).
function toDepense(r: DepenseRow): Depense {
  return {
    id: r.id,
    artisanId: r.artisan_id,
    userId: r.user_id,
    numero: r.numero,
    dateDepense: r.date_depense,
    fournisseur: r.fournisseur ?? null,
    categorie: r.categorie,
    sousCategorie: r.sous_categorie ?? null,
    description: r.description ?? null,
    montantHt: r.montant_ht ?? "0",
    tauxTva: r.taux_tva ?? null,
    montantTva: r.montant_tva ?? null,
    montantTtc: r.montant_ttc ?? "0",
    modePaiement: (r.mode_paiement ?? "carte") as Depense["modePaiement"],
    statut: (r.statut ?? "brouillon") as Depense["statut"],
    remboursable: r.remboursable ?? true,
    rembourse: r.rembourse ?? false,
    dateRemboursement: r.date_remboursement ?? null,
    chantierId: r.chantier_id ?? null,
    interventionId: r.intervention_id ?? null,
    clientId: r.client_id ?? null,
    notes: r.notes ?? null,
    justificatifUrl: r.justificatif_url ?? null,
    justificatifNom: r.justificatif_nom ?? null,
    ocrBrut: r.ocr_brut ?? null,
    ocrTraite: r.ocr_traite ?? false,
    recurrente: r.recurrente ?? false,
    frequenceRecurrence: (r.frequence_recurrence ?? null) as Depense["frequenceRecurrence"],
    prochaineOccurrence: r.prochaine_occurrence ?? null,
    tvaDeductible: r.tva_deductible ?? true,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

// Construit le patch d'insert/update (camel → snake), en ne posant que les clés fournies.
function toInsertValues(input: CreateDepenseInput, artisanId: number): typeof depenses.$inferInsert {
  return {
    artisan_id: artisanId,
    user_id: input.userId,
    numero: input.numero,
    date_depense: input.dateDepense,
    categorie: input.categorie,
    montant_ht: input.montantHt,
    montant_ttc: input.montantTtc,
    fournisseur: input.fournisseur ?? null,
    sous_categorie: input.sousCategorie ?? null,
    description: input.description ?? null,
    taux_tva: input.tauxTva ?? undefined,
    montant_tva: input.montantTva ?? undefined,
    mode_paiement: input.modePaiement ?? undefined,
    remboursable: input.remboursable ?? undefined,
    chantier_id: input.chantierId ?? null,
    intervention_id: input.interventionId ?? null,
    client_id: input.clientId ?? null,
    notes: input.notes ?? null,
    justificatif_url: input.justificatifUrl ?? null,
    justificatif_nom: input.justificatifNom ?? null,
    recurrente: input.recurrente ?? undefined,
    frequence_recurrence: input.frequenceRecurrence ?? undefined,
    prochaine_occurrence: input.prochaineOccurrence ?? undefined,
    tva_deductible: input.tvaDeductible ?? undefined,
  } as typeof depenses.$inferInsert;
}

function toUpdateSet(input: UpdateDepenseInput): Partial<typeof depenses.$inferInsert> {
  const set: Partial<typeof depenses.$inferInsert> = {};
  if (input.numero !== undefined) set.numero = input.numero;
  if (input.dateDepense !== undefined) set.date_depense = input.dateDepense;
  if (input.categorie !== undefined) set.categorie = input.categorie;
  if (input.montantHt !== undefined) set.montant_ht = input.montantHt;
  if (input.montantTtc !== undefined) set.montant_ttc = input.montantTtc;
  if (input.fournisseur !== undefined) set.fournisseur = input.fournisseur;
  if (input.sousCategorie !== undefined) set.sous_categorie = input.sousCategorie;
  if (input.description !== undefined) set.description = input.description;
  if (input.tauxTva !== undefined) set.taux_tva = input.tauxTva;
  if (input.montantTva !== undefined) set.montant_tva = input.montantTva;
  if (input.modePaiement !== undefined) set.mode_paiement = input.modePaiement;
  if (input.remboursable !== undefined) set.remboursable = input.remboursable;
  if (input.chantierId !== undefined) set.chantier_id = input.chantierId;
  if (input.interventionId !== undefined) set.intervention_id = input.interventionId;
  if (input.clientId !== undefined) set.client_id = input.clientId;
  if (input.notes !== undefined) set.notes = input.notes;
  if (input.justificatifUrl !== undefined) set.justificatif_url = input.justificatifUrl;
  if (input.justificatifNom !== undefined) set.justificatif_nom = input.justificatifNom;
  if (input.recurrente !== undefined) set.recurrente = input.recurrente;
  if (input.frequenceRecurrence !== undefined) set.frequence_recurrence = input.frequenceRecurrence;
  if (input.prochaineOccurrence !== undefined) set.prochaine_occurrence = input.prochaineOccurrence;
  if (input.tvaDeductible !== undefined) set.tva_deductible = input.tvaDeductible;
  return set;
}

// Implémentation Drizzle du repository depenses. Double cloisonnement RLS + filtre `artisan_id`
// (snake_case). ⚠️ `update` ne touche que les métadonnées (`UpdateDepenseInput` exclut
// statut/rembourse/dateRemboursement) → le workflow de remboursement est porté ailleurs.
export class DepenseRepositoryDrizzle implements IDepenseRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Depense[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(depenses)
        .where(eq(depenses.artisan_id, ctx.artisanId))
        .orderBy(desc(depenses.date_depense), desc(depenses.id));
      return rows.map(toDepense);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Depense | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(depenses)
        .where(and(eq(depenses.id, id), eq(depenses.artisan_id, ctx.artisanId)))
        .limit(1);
      return row ? toDepense(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateDepenseInput): Promise<Depense> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx.insert(depenses).values(toInsertValues(input, ctx.artisanId)).returning();
      return toDepense(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateDepenseInput): Promise<Depense | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const set = toUpdateSet(input);
      if (Object.keys(set).length === 0) {
        // Aucun champ à modifier : renvoie l'état courant (scopé) sans UPDATE vide.
        const [row] = await tx
          .select()
          .from(depenses)
          .where(and(eq(depenses.id, id), eq(depenses.artisan_id, ctx.artisanId)))
          .limit(1);
        return row ? toDepense(row) : null;
      }
      const [row] = await tx
        .update(depenses)
        .set(set)
        .where(and(eq(depenses.id, id), eq(depenses.artisan_id, ctx.artisanId)))
        .returning();
      return row ? toDepense(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(depenses)
        .where(and(eq(depenses.id, id), eq(depenses.artisan_id, ctx.artisanId)))
        .returning({ id: depenses.id });
      return deleted.length > 0;
    });
  }

  nextNumero(ctx: TenantContext): Promise<string> {
    return withTenant(this.db, ctx, async (tx) => {
      // Dernière dépense de l'artisan (par id desc) → incrément du suffixe numérique.
      const [row] = await tx
        .select({ numero: depenses.numero })
        .from(depenses)
        .where(eq(depenses.artisan_id, ctx.artisanId))
        .orderBy(desc(depenses.id))
        .limit(1);
      return computeNextNumero(row?.numero ?? "");
    });
  }

  ownsRef(ctx: TenantContext, kind: DepenseRefKind, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const n = sql<number>`count(*)::int`;
      // Chaque table cible porte un `artisanId` (toutes RLS-isolées) → double cloisonnement.
      let row: { n: number } | undefined;
      switch (kind) {
        case "chantier":
          [row] = await tx.select({ n }).from(chantiers).where(and(eq(chantiers.id, id), eq(chantiers.artisanId, ctx.artisanId)));
          break;
        case "intervention":
          [row] = await tx.select({ n }).from(interventions).where(and(eq(interventions.id, id), eq(interventions.artisanId, ctx.artisanId)));
          break;
        case "client":
          [row] = await tx.select({ n }).from(clients).where(and(eq(clients.id, id), eq(clients.artisanId, ctx.artisanId)));
          break;
      }
      return (row?.n ?? 0) > 0;
    });
  }
}
