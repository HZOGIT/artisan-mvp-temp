import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { stocks, mouvementsStock, commandesFournisseurs, lignesCommandesFournisseurs } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IStockRepository, AdjustStockResult } from "../application/stock-repository";
import type {
  Stock,
  CreateStockInput,
  UpdateStockInput,
  AdjustStockInput,
  MouvementStock,
  MouvementType,
  StockEntrant,
} from "../domain/stock";

type StockRow = typeof stocks.$inferSelect;
type MouvementRow = typeof mouvementsStock.$inferSelect;

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

// Motif par défaut (parité legacy) quand l'appelant n'en fournit pas.
function defaultMotif(type: MouvementType): string {
  return type === "entree" ? "Ajout manuel" : type === "sortie" ? "Retrait manuel" : "Ajustement";
}

// Implémentation Drizzle du repository stocks. Double cloisonnement RLS + filtre artisanId
// sur `stocks`. ⚠️ `update` ne touche que les métadonnées (jamais `quantiteEnStock` :
// la quantité ne change que via un mouvement tracé). delete = cascade `mouvements_stock`
// (table SANS artisanId, scopée via le stock) après vérification d'ownership.
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

  create(ctx: TenantContext, input: CreateStockInput): Promise<Stock> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(stocks)
        .values({ ...input, artisanId: ctx.artisanId } as typeof stocks.$inferInsert)
        .returning();
      return toStock(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateStockInput): Promise<Stock | null> {
    return withTenant(this.db, ctx, async (tx) => {
      // `input` (UpdateStockInput) ne contient pas `quantiteEnStock` → la quantité reste
      // intacte ; seul un mouvement tracé l'ajuste (étape ultérieure).
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
      // Vérifie l'appartenance AVANT de purger les mouvements (mouvements_stock n'a pas
      // d'artisanId → on ne doit pas supprimer ceux d'un autre tenant). Atomique.
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
      // Ownership AVANT toute écriture : `mouvements_stock` n'a pas d'artisanId, on ne doit
      // jamais l'ajuster pour un stock hors tenant. Lecture + maj + log dans la MÊME
      // transaction (atomicité : pas de mouvement sans maj de quantité, ni l'inverse).
      const [stock] = await tx
        .select()
        .from(stocks)
        .where(and(eq(stocks.id, stockId), eq(stocks.artisanId, ctx.artisanId)))
        .limit(1);
      if (!stock) return { status: "not_found" };

      const avant = Number(stock.quantiteEnStock ?? "0");
      const delta = Number(input.quantite);
      // `entree`/`ajustement` ajoutent, `sortie` retranche (parité legacy adjustStock).
      const apresNum = input.type === "sortie" ? avant - delta : avant + delta;
      // Invariant : la quantité physique ne peut jamais devenir négative (sortie refusée).
      if (apresNum < 0) return { status: "insufficient_stock", disponible: avant.toFixed(2) };
      const apres = apresNum.toFixed(2);

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
      // Scope via le stock parent (mouvements_stock SANS artisanId) : null si hors tenant.
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

  listEntrant(ctx: TenantContext): Promise<StockEntrant[]> {
    return withTenant(this.db, ctx, async (tx) => {
      // Reste à recevoir = Σ max(quantite - quantiteRecue, 0) sur les lignes de commandes non soldées.
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
