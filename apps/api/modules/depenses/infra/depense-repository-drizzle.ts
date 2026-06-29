import { and, between, desc, eq, gte, isNotNull, lte, ne, sql } from "drizzle-orm";
import { depenses, chantiers, interventions, clients } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDepenseRepository, DepenseRefKind } from "../application/depense-repository";
import type { Depense, CreateDepenseInput, UpdateDepenseInput, DoublonParams, DepenseDoublon, DepenseStats } from "../domain/depense";
import { computeNextNumero } from "../application/numero";

type DepenseRow = typeof depenses.$inferSelect;

/** ⚠️ Table `depenses` en snake_case → mapping snake↔camel ici (le domaine reste camelCase). */
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
    coeffDeductibilite: r.coeff_deductibilite ?? "100",
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

/** Construit le patch d'insert/update (camel → snake), en ne posant que les clés fournies. */
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
    coeff_deductibilite: input.coeffDeductibilite ?? undefined,
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
  if (input.coeffDeductibilite !== undefined) set.coeff_deductibilite = input.coeffDeductibilite;
  return set;
}

/*
 * Implémentation Drizzle du repository depenses. Double cloisonnement RLS + filtre `artisan_id`
 * (snake_case). ⚠️ `update` ne touche que les métadonnées (`UpdateDepenseInput` exclut
 * statut/rembourse/dateRemboursement) → le workflow de remboursement est porté ailleurs.
 */
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

  realisesParCategorie(ctx: TenantContext, mois: string): Promise<{ categorie: string; reel: string }[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const [y, m] = mois.split("-").map(Number);
      const debut = `${mois}-01`;
      /** dernier jour du mois */
      const fin = new Date(y, m, 0).toISOString().slice(0, 10);
      const rows = await tx
        .select({ categorie: depenses.categorie, reel: sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)::text` })
        .from(depenses)
        .where(and(eq(depenses.artisan_id, ctx.artisanId), between(depenses.date_depense, debut, fin)))
        .groupBy(depenses.categorie);
      return rows.map((r) => ({ categorie: r.categorie, reel: r.reel }));
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
        /** Aucun champ à modifier : renvoie l'état courant (scopé) sans UPDATE vide. */
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
      /** Dernière dépense de l'artisan (par id desc) → incrément du suffixe numérique. */
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
      /** Chaque table cible porte un `artisanId` (toutes RLS-isolées) → double cloisonnement. */
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

  findDoublons(ctx: TenantContext, params: DoublonParams): Promise<DepenseDoublon[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const conds = [
        eq(depenses.artisan_id, ctx.artisanId),
        sql`ABS(${depenses.montant_ttc} - ${params.montantTtc}) < 0.01`,
        eq(depenses.date_depense, params.dateDepense),
        sql`COALESCE(${depenses.fournisseur}, '') = COALESCE(${params.fournisseur ?? ""}, '')`,
      ];
      if (params.excludeId) conds.push(ne(depenses.id, params.excludeId));
      const rows = await tx
        .select({
          id: depenses.id,
          numero: depenses.numero,
          montantTtc: depenses.montant_ttc,
          dateDepense: depenses.date_depense,
          fournisseur: depenses.fournisseur,
          description: depenses.description,
          statut: depenses.statut,
        })
        .from(depenses)
        .where(and(...conds))
        .orderBy(desc(depenses.date_depense), desc(depenses.id))
        .limit(10);
      return rows.map((r) => ({
        id: r.id,
        numero: r.numero,
        montantTtc: r.montantTtc,
        dateDepense: r.dateDepense,
        fournisseur: r.fournisseur ?? null,
        description: r.description ?? null,
        statut: r.statut ?? "brouillon",
      }));
    });
  }

  getStats(ctx: TenantContext, mois: string): Promise<DepenseStats> {
    return withTenant(this.db, ctx, async (tx) => {
      const a = ctx.artisanId;
      const [y, mo] = mois.split("-").map(Number);
      const debutMois = `${mois}-01`;
      const finMois = new Date(y, mo, 0).toISOString().slice(0, 10);
      const moisPrec = new Date(y, mo - 2, 1).toISOString().slice(0, 7);
      const debutPrec = `${moisPrec}-01`;
      const finPrec = new Date(y, mo - 1, 0).toISOString().slice(0, 10);
      const anneeDebut = `${y}-01-01`;
      const anneeFin = `${y}-12-31`;
      const cinqMoisAvant = new Date(y, mo - 1 - 5, 1).toISOString().slice(0, 10);
      const sumTtc = sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)`;

      const [totMois] = await tx
        .select({
          total: sumTtc,
          nb: sql<number>`COUNT(*)::int`,
          aRembourser: sql<string>`COALESCE(SUM(CASE WHEN ${depenses.remboursable} = TRUE AND ${depenses.rembourse} = FALSE THEN ${depenses.montant_ttc} ELSE 0 END), 0)`,
          tvaRecup: sql<string>`COALESCE(SUM(CASE WHEN ${depenses.tva_deductible} = TRUE THEN ${depenses.montant_tva} * ${depenses.coeff_deductibilite} / 100 ELSE 0 END), 0)`,
        })
        .from(depenses)
        .where(and(eq(depenses.artisan_id, a), between(depenses.date_depense, debutMois, finMois)));

      const sumBetween = (d1: string, d2: string) =>
        tx.select({ total: sumTtc }).from(depenses).where(and(eq(depenses.artisan_id, a), between(depenses.date_depense, d1, d2)));
      const [totPrec] = await sumBetween(debutPrec, finPrec);
      const [totAnnee] = await sumBetween(anneeDebut, anneeFin);

      const parCategorie = await tx
        .select({ categorie: depenses.categorie, total: sumTtc, nb: sql<number>`COUNT(*)::int` })
        .from(depenses)
        .where(and(eq(depenses.artisan_id, a), between(depenses.date_depense, debutMois, finMois)))
        .groupBy(depenses.categorie)
        .orderBy(desc(sumTtc));

      const topDepenses = await tx
        .select({
          id: depenses.id,
          numero: depenses.numero,
          fournisseur: depenses.fournisseur,
          categorie: depenses.categorie,
          montant_ttc: depenses.montant_ttc,
          date_depense: depenses.date_depense,
        })
        .from(depenses)
        .where(and(eq(depenses.artisan_id, a), between(depenses.date_depense, debutMois, finMois)))
        .orderBy(desc(depenses.montant_ttc))
        .limit(5);

      const topFournisseurs = await tx
        .select({ fournisseur: depenses.fournisseur, total: sumTtc, nb: sql<number>`COUNT(*)::int` })
        .from(depenses)
        .where(
          and(
            eq(depenses.artisan_id, a),
            between(depenses.date_depense, debutMois, finMois),
            isNotNull(depenses.fournisseur),
            ne(depenses.fournisseur, ""),
          ),
        )
        .groupBy(depenses.fournisseur)
        .orderBy(desc(sumTtc))
        .limit(3);

      const parMois = await tx
        .select({ mois: sql<string>`to_char(${depenses.date_depense}, 'YYYY-MM')`, total: sumTtc })
        .from(depenses)
        .where(and(eq(depenses.artisan_id, a), gte(depenses.date_depense, cinqMoisAvant)))
        .groupBy(sql`to_char(${depenses.date_depense}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${depenses.date_depense}, 'YYYY-MM') ASC`);

      const totalM = Number(totMois?.total || 0);
      const totalP = Number(totPrec?.total || 0);
      return {
        mois,
        totalMois: totalM,
        nbDepensesMois: Number(totMois?.nb || 0),
        aRembourser: Number(totMois?.aRembourser || 0),
        tvaRecuperable: Number(totMois?.tvaRecup || 0),
        totalMoisPrecedent: totalP,
        variation: totalP > 0 ? ((totalM - totalP) / totalP) * 100 : null,
        totalAnnee: Number(totAnnee?.total || 0),
        parCategorie: parCategorie.map((r) => ({ categorie: r.categorie, total: String(r.total), nb: r.nb })),
        topDepenses: topDepenses.map((r) => ({
          id: r.id,
          numero: r.numero,
          fournisseur: r.fournisseur ?? null,
          categorie: r.categorie,
          montant_ttc: r.montant_ttc,
          date_depense: r.date_depense,
        })),
        topFournisseurs: topFournisseurs.map((r) => ({ fournisseur: r.fournisseur ?? null, total: String(r.total), nb: r.nb })),
        parMois: parMois.map((r) => ({ mois: r.mois, total: String(r.total) })),
      };
    });
  }

  setOcr(ctx: TenantContext, id: number, data: unknown): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(depenses)
        .set({ ocr_brut: JSON.stringify(data ?? {}).slice(0, 5000), ocr_traite: true })
        .where(and(eq(depenses.id, id), eq(depenses.artisan_id, ctx.artisanId)));
    });
  }

  listRecurrentesDues(ctx: TenantContext, asOf: string): Promise<Depense[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(depenses)
        .where(
          and(
            eq(depenses.artisan_id, ctx.artisanId),
            eq(depenses.recurrente, true),
            isNotNull(depenses.prochaine_occurrence),
            isNotNull(depenses.frequence_recurrence),
            lte(depenses.prochaine_occurrence, asOf),
          ),
        )
        .orderBy(depenses.id);
      return rows.map(toDepense);
    });
  }

  withDb(db: DbClient): DepenseRepositoryDrizzle {
    return new DepenseRepositoryDrizzle(db);
  }
}
