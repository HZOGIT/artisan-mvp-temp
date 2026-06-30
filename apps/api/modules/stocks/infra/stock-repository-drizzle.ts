import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { stocks, mouvementsStock, commandesFournisseurs, lignesCommandesFournisseurs, inventaires, inventairesLignes } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import { round2 } from "../../../shared/money";
import type { IStockRepository, AdjustStockResult } from "../application/stock-repository";
import type {
  Stock,
  CreateStockInput,
  UpdateStockInput,
  AdjustStockInput,
  MouvementStock,
  MouvementType,
  StockEntrant,
  Inventaire,
  InventaireLigne,
  InventaireAvecLignes,
  DemarrerInventaireInput,
} from "../domain/stock";

type StockRow = typeof stocks.$inferSelect;
type MouvementRow = typeof mouvementsStock.$inferSelect;
type InventaireRow = typeof inventaires.$inferSelect;
type InventaireLigneRow = typeof inventairesLignes.$inferSelect;

function toInventaire(r: InventaireRow): Inventaire {
  return {
    id: r.id,
    artisanId: r.artisanId,
    date: r.date,
    statut: r.statut as Inventaire["statut"],
    note: r.note ?? null,
    valeurEcart: r.valeurEcart ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toLigne(r: InventaireLigneRow): InventaireLigne {
  return {
    id: r.id,
    inventaireId: r.inventaireId,
    stockId: r.stockId,
    reference: r.reference,
    designation: r.designation,
    unite: r.unite,
    quantiteTheorique: r.quantiteTheorique,
    quantiteReelle: r.quantiteReelle ?? null,
    ecart: r.ecart ?? null,
  };
}

function toStock(r: StockRow): Stock {
  return {
    id: r.id,
    artisanId: r.artisanId,
    articleId: r.articleId ?? null,
    articleType: (r.articleType ?? "bibliotheque") as Stock["articleType"],
    reference: r.reference,
    designation: r.designation,
    quantiteEnStock: r.quantiteEnStock ?? "0.00",
    seuilAlerte: r.seuilAlerte ?? "5.00",
    unite: r.unite ?? "unité",
    prixAchat: r.prixAchat ?? null,
    emplacement: r.emplacement ?? null,
    fournisseur: r.fournisseur ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toMouvement(r: MouvementRow): MouvementStock {
  return {
    id: r.id,
    stockId: r.stockId,
    type: r.type as MouvementType,
    quantite: r.quantite,
    quantiteAvant: r.quantiteAvant,
    quantiteApres: r.quantiteApres,
    motif: r.motif ?? null,
    reference: r.reference ?? null,
    createdAt: r.createdAt,
  };
}

/** Motif par défaut (parité legacy) quand l'appelant n'en fournit pas. */
function defaultMotif(type: MouvementType): string {
  return type === "entree" ? "Ajout manuel" : type === "sortie" ? "Retrait manuel" : "Ajustement";
}

/*
 * Implémentation Drizzle du repository stocks. Double cloisonnement RLS + filtre artisanId
 * sur `stocks`. ⚠️ `update` ne touche que les métadonnées (jamais `quantiteEnStock` :
 * la quantité ne change que via un mouvement tracé). delete = cascade `mouvements_stock`
 * (table SANS artisanId, scopée via le stock) après vérification d'ownership.
 */
export class StockRepositoryDrizzle implements IStockRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Stock[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(stocks)
        .where(eq(stocks.artisanId, ctx.artisanId))
        .orderBy(asc(stocks.designation), asc(stocks.id));
      return rows.map(toStock);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Stock | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(stocks)
        .where(and(eq(stocks.id, id), eq(stocks.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toStock(row) : null;
    });
  }

  findByArticleId(ctx: TenantContext, articleId: number): Promise<Stock | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(stocks)
        .where(and(eq(stocks.artisanId, ctx.artisanId), eq(stocks.articleId, articleId)))
        .limit(1);
      return row ? toStock(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateStockInput): Promise<Stock> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(stocks)
        .values({ ...input, artisanId: ctx.artisanId } as typeof stocks.$inferInsert)
        .returning();
      const qty = Number(input.quantiteEnStock ?? "0");
      if (qty > 0) {
        await tx.insert(mouvementsStock).values({
          stockId: row.id,
          type: "entree",
          quantite: qty.toFixed(2),
          quantiteAvant: "0.00",
          quantiteApres: qty.toFixed(2),
          motif: "Stock initial",
          reference: null,
        });
      }
      return toStock(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateStockInput): Promise<Stock | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /*
       * `input` (UpdateStockInput) ne contient pas `quantiteEnStock` → la quantité reste
       * intacte ; seul un mouvement tracé l'ajuste (étape ultérieure).
       */
      const [row] = await tx
        .update(stocks)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(stocks.id, id), eq(stocks.artisanId, ctx.artisanId)))
        .returning();
      return row ? toStock(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      /*
       * Vérifie l'appartenance AVANT de purger les mouvements (mouvements_stock n'a pas
       * d'artisanId → on ne doit pas supprimer ceux d'un autre tenant). Atomique.
       */
      const [owned] = await tx
        .select({ id: stocks.id })
        .from(stocks)
        .where(and(eq(stocks.id, id), eq(stocks.artisanId, ctx.artisanId)))
        .limit(1);
      if (!owned) return false;

      await tx.delete(mouvementsStock).where(eq(mouvementsStock.stockId, id));
      const deleted = await tx
        .delete(stocks)
        .where(and(eq(stocks.id, id), eq(stocks.artisanId, ctx.artisanId)))
        .returning({ id: stocks.id });
      return deleted.length > 0;
    });
  }

  adjustQuantity(ctx: TenantContext, stockId: number, input: AdjustStockInput): Promise<AdjustStockResult> {
    return withTenant(this.db, ctx, async (tx) => {
      /*
       * Ownership AVANT toute écriture : `mouvements_stock` n'a pas d'artisanId, on ne doit
       * jamais l'ajuster pour un stock hors tenant. Lecture + maj + log dans la MÊME
       * transaction (atomicité : pas de mouvement sans maj de quantité, ni l'inverse).
       */
      /* ponytail: FOR UPDATE sérialise les décréments concurrents (facturation mobile parallèle) */
      const [stock] = await tx
        .select()
        .from(stocks)
        .where(and(eq(stocks.id, stockId), eq(stocks.artisanId, ctx.artisanId)))
        .for("update")
        .limit(1);
      if (!stock) return { status: "not_found" };

      const avant = Number(stock.quantiteEnStock ?? "0");
      const delta = Number(input.quantite);
      /** `entree`/`ajustement` ajoutent, `sortie` retranche (parité legacy adjustStock). */
      const apresNum = input.type === "sortie" ? avant - delta : avant + delta;
      /** Invariant : la quantité physique ne peut jamais devenir négative (sortie refusée). */
      if (apresNum < 0) return { status: "insufficient_stock", disponible: avant.toFixed(2) };
      const apres = round2(apresNum).toFixed(2);

      await tx
        .update(stocks)
        .set({ quantiteEnStock: apres, updatedAt: new Date() })
        .where(and(eq(stocks.id, stockId), eq(stocks.artisanId, ctx.artisanId)));

      await tx.insert(mouvementsStock).values({
        stockId,
        type: input.type,
        quantite: delta.toFixed(2),
        quantiteAvant: avant.toFixed(2),
        quantiteApres: apres,
        motif: input.motif ?? defaultMotif(input.type),
        reference: input.reference ?? null,
      });

      const [updated] = await tx
        .select()
        .from(stocks)
        .where(and(eq(stocks.id, stockId), eq(stocks.artisanId, ctx.artisanId)))
        .limit(1);
      return { status: "ok", stock: toStock(updated) };
    });
  }

  listMouvements(ctx: TenantContext, stockId: number): Promise<MouvementStock[] | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Scope via le stock parent (mouvements_stock SANS artisanId) : null si hors tenant. */
      const [owned] = await tx
        .select({ id: stocks.id })
        .from(stocks)
        .where(and(eq(stocks.id, stockId), eq(stocks.artisanId, ctx.artisanId)))
        .limit(1);
      if (!owned) return null;
      const rows = await tx
        .select()
        .from(mouvementsStock)
        .where(eq(mouvementsStock.stockId, stockId))
        .orderBy(desc(mouvementsStock.createdAt), desc(mouvementsStock.id));
      return rows.map(toMouvement);
    });
  }

  listLowStock(ctx: TenantContext): Promise<Stock[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(stocks)
        .where(
          and(
            eq(stocks.artisanId, ctx.artisanId),
            sql`${stocks.quantiteEnStock} <= ${stocks.seuilAlerte}`,
          ),
        )
        .orderBy(asc(stocks.designation), asc(stocks.id));
      return rows.map(toStock);
    });
  }

  listEnRupture(ctx: TenantContext): Promise<Stock[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(stocks)
        .where(and(eq(stocks.artisanId, ctx.artisanId), sql`${stocks.quantiteEnStock} <= 0`))
        .orderBy(asc(stocks.designation), asc(stocks.id));
      return rows.map(toStock);
    });
  }

  withDb(db: DbClient): StockRepositoryDrizzle {
    return new StockRepositoryDrizzle(db);
  }

  /* ─── Inventaire physique ─── */

  demarrerInventaire(ctx: TenantContext, input: DemarrerInventaireInput): Promise<InventaireAvecLignes> {
    return withTenant(this.db, ctx, async (tx) => {
      const stockRows = await tx
        .select()
        .from(stocks)
        .where(eq(stocks.artisanId, ctx.artisanId))
        .orderBy(asc(stocks.designation), asc(stocks.id));

      const [inv] = await tx
        .insert(inventaires)
        .values({ artisanId: ctx.artisanId, date: input.date ?? new Date().toISOString().slice(0, 10), note: input.note ?? null })
        .returning();

      const lignesRows =
        stockRows.length > 0
          ? await tx
              .insert(inventairesLignes)
              .values(stockRows.map((s) => ({
                inventaireId: inv.id,
                stockId: s.id,
                reference: s.reference,
                designation: s.designation,
                unite: s.unite ?? "unité",
                quantiteTheorique: s.quantiteEnStock ?? "0.00",
              })))
              .returning()
          : [];

      return {
        inventaire: toInventaire(inv),
        lignes: lignesRows.map(toLigne),
      };
    });
  }

  getInventaire(ctx: TenantContext, id: number): Promise<InventaireAvecLignes | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [inv] = await tx
        .select()
        .from(inventaires)
        .where(and(eq(inventaires.id, id), eq(inventaires.artisanId, ctx.artisanId)))
        .limit(1);
      if (!inv) return null;

      const lignesRows = await tx
        .select()
        .from(inventairesLignes)
        .where(eq(inventairesLignes.inventaireId, id))
        .orderBy(asc(inventairesLignes.designation), asc(inventairesLignes.id));

      return {
        inventaire: toInventaire(inv),
        lignes: lignesRows.map(toLigne),
      };
    });
  }

  listInventaires(ctx: TenantContext): Promise<Inventaire[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(inventaires)
        .where(eq(inventaires.artisanId, ctx.artisanId))
        .orderBy(desc(inventaires.createdAt), desc(inventaires.id));
      return rows.map(toInventaire);
    });
  }

  saisirComptage(ctx: TenantContext, ligneId: number, quantiteReelle: string): Promise<InventaireAvecLignes | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /* Vérifie l'appartenance tenant via la jointure inventaire (inventaires_lignes n'a pas artisanId). */
      const [ligneRow] = await tx
        .select({ ligne: inventairesLignes, inv: inventaires })
        .from(inventairesLignes)
        .innerJoin(inventaires, eq(inventaires.id, inventairesLignes.inventaireId))
        .where(and(eq(inventairesLignes.id, ligneId), eq(inventaires.artisanId, ctx.artisanId)))
        .limit(1);
      if (!ligneRow) return null;
      if (ligneRow.inv.statut === "valide") return null;

      const ecart = (Number(quantiteReelle) - Number(ligneRow.ligne.quantiteTheorique)).toFixed(2);
      await tx
        .update(inventairesLignes)
        .set({ quantiteReelle, ecart })
        .where(eq(inventairesLignes.id, ligneId));

      /* Re-fetch inline dans la même tx pour éviter une 2ème connexion (non-committed reads). */
      const invId = ligneRow.inv.id;
      const [freshInv] = await tx.select().from(inventaires).where(eq(inventaires.id, invId)).limit(1);
      const freshLignes = await tx
        .select()
        .from(inventairesLignes)
        .where(eq(inventairesLignes.inventaireId, invId))
        .orderBy(asc(inventairesLignes.designation), asc(inventairesLignes.id));
      return { inventaire: toInventaire(freshInv), lignes: freshLignes.map(toLigne) };
    });
  }

  validerInventaire(ctx: TenantContext, id: number): Promise<InventaireAvecLignes | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [inv] = await tx
        .select()
        .from(inventaires)
        .where(and(eq(inventaires.id, id), eq(inventaires.artisanId, ctx.artisanId)))
        .for("update")
        .limit(1);
      if (!inv) return null;

      const lignesRows = await tx
        .select({ ligne: inventairesLignes, stock: stocks })
        .from(inventairesLignes)
        .innerJoin(stocks, eq(stocks.id, inventairesLignes.stockId))
        .where(eq(inventairesLignes.inventaireId, id));

      let valeurEcartTotal = 0;

      for (const { ligne, stock } of lignesRows) {
        const ecartNum = Number(ligne.ecart ?? "0");
        if (ecartNum === 0) continue;

        const avant = Number(stock.quantiteEnStock ?? "0");
        const apres = round2(avant + ecartNum).toFixed(2);
        const deltaAbs = Math.abs(ecartNum).toFixed(2);
        const motif = `Régularisation inventaire #${id}`;

        await tx
          .update(stocks)
          .set({ quantiteEnStock: apres, updatedAt: new Date() })
          .where(eq(stocks.id, stock.id));

        await tx.insert(mouvementsStock).values({
          stockId: stock.id,
          type: "ajustement",
          quantite: deltaAbs,
          quantiteAvant: avant.toFixed(2),
          quantiteApres: apres,
          motif,
          reference: `INV-${id}`,
        });

        /* Valorise l'écart : |ecart| × prixAchat (si connu). */
        const px = Number(stock.prixAchat ?? "0");
        valeurEcartTotal += Math.abs(ecartNum) * px;
      }

      const valeurEcartStr = round2(valeurEcartTotal).toFixed(2);
      await tx
        .update(inventaires)
        .set({ statut: "valide", valeurEcart: valeurEcartStr, updatedAt: new Date() })
        .where(eq(inventaires.id, id));

      /* Re-fetch inline dans la même tx pour éviter une 2ème connexion (non-committed reads). */
      const [freshInv] = await tx.select().from(inventaires).where(eq(inventaires.id, id)).limit(1);
      const freshLignes = await tx
        .select()
        .from(inventairesLignes)
        .where(eq(inventairesLignes.inventaireId, id))
        .orderBy(asc(inventairesLignes.designation), asc(inventairesLignes.id));
      return { inventaire: toInventaire(freshInv), lignes: freshLignes.map(toLigne) };
    });
  }

  listEntrant(ctx: TenantContext): Promise<StockEntrant[]> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Reste à recevoir = Σ max(quantite - quantiteRecue, 0) sur les lignes de commandes non soldées. */
      const entrantExpr = sql<string>`COALESCE(SUM(GREATEST(${lignesCommandesFournisseurs.quantite} - ${lignesCommandesFournisseurs.quantiteRecue}, 0)), 0)`;
      const rows = await tx
        .select({ stockId: lignesCommandesFournisseurs.stockId, entrant: entrantExpr })
        .from(lignesCommandesFournisseurs)
        .innerJoin(commandesFournisseurs, eq(commandesFournisseurs.id, lignesCommandesFournisseurs.commandeId))
        .where(
          and(
            eq(commandesFournisseurs.artisanId, ctx.artisanId),
            inArray(commandesFournisseurs.statut, ["envoyee", "confirmee", "partiellement_livree"]),
            isNotNull(lignesCommandesFournisseurs.stockId),
          ),
        )
        .groupBy(lignesCommandesFournisseurs.stockId)
        .having(sql`${entrantExpr} > 0`);
      return rows.map((r) => ({ stockId: Number(r.stockId), entrant: Number(r.entrant) || 0 }));
    });
  }
}
