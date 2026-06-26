import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { IStockRepository } from "../../application/stock-repository";
import type { INotificationRepository } from "../../../notifications/application/notification-repository";
import type { IFournisseurRepository } from "../../../fournisseurs/application/fournisseur-repository";
import { genererAlertesStock } from "../../application/alertes-use-cases";
import { genererRapportCommande } from "../../application/rapport-use-cases";
import {
  listStocks,
  getStock,
  getMouvementsStock,
  listStocksEnAlerte,
  listStocksEnRupture,
  listStockEntrant,
} from "../../application/read-use-cases";
import {
  creerStock,
  modifierStock,
  supprimerStock,
  ajusterQuantiteStock,
} from "../../application/write-use-cases";

/** Décimal positif (≥ 0) : la regex (pas de signe) interdit déjà toute valeur négative. */
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Valeur décimale invalide");

/** Bornes alignées sur la table `stocks` (defense-in-depth). */
const createSchema = z.object({
  articleId: z.number().int().nullish(),
  articleType: z.enum(["bibliotheque", "artisan"]).optional(),
  reference: z.string().min(1).max(50),
  designation: z.string().min(1).max(500),
  quantiteEnStock: decimal.optional(),
  seuilAlerte: decimal.optional(),
  unite: z.string().max(20).optional(),
  prixAchat: decimal.nullish(),
  emplacement: z.string().max(100).nullish(),
  fournisseur: z.string().max(255).nullish(),
});

/*
 * ⚠️ `quantiteEnStock` ABSENT du schéma d'update : la quantité ne change que via un
 * mouvement tracé (invariant d'audit).
 */
const updateSchema = z.object({
  reference: z.string().min(1).max(50).optional(),
  designation: z.string().min(1).max(500).optional(),
  seuilAlerte: decimal.optional(),
  unite: z.string().max(20).optional(),
  prixAchat: decimal.nullish(),
  emplacement: z.string().max(100).nullish(),
  fournisseur: z.string().max(255).nullish(),
});

/*
 * Routeur tRPC du domaine stocks. Transport mince : valide les inputs (zod), délègue aux
 * use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors
 * (NotFound→404, Validation→400). Repositories injectés (DI) → `repo` (stocks) + `notificationRepo`
 * (composé pour generateAlerts, qui crée des notifications « Stock bas »).
 */
export function createStocksRouter(
  repo: IStockRepository,
  notificationRepo: INotificationRepository,
  fournisseurRepo: IFournisseurRepository,
  db?: DbClient,
) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listStocks(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getStock(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerStock(r, ctx.tenant, input);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "stock.cree", entityType: "stock", entityId: result.id, payload: { stockId: result.id, reference: result.reference, designation: result.designation, quantite: result.quantiteEnStock } });
          return result;
        });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierStock(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "stock.modifie", entityType: "stock", entityId: id, payload: { stockId: id } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerStock(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "stock.supprime", entityType: "stock", entityId: input.id, payload: { snapshot: { stockId: input.id, reference: before?.reference, designation: before?.designation } } });
          return { success: true };
        });
      }),

    /** ⚠️ L'UNIQUE voie de modification de la quantité : un mouvement tracé (audit). */
    adjustQuantity: protectedProcedure
      .input(
        z.object({
          stockId: z.number().int(),
          type: z.enum(["entree", "sortie", "ajustement"]),
          quantite: decimal,
          motif: z.string().max(255).nullish(),
          reference: z.string().max(100).nullish(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { stockId, ...mouvement } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const avant = await r.getById(ctx.tenant, stockId);
          const result = await ajusterQuantiteStock(r, ctx.tenant, stockId, mouvement);
          const level = input.type === "ajustement" ? "warn" : "info";
          ctx.log[level](
            { event: "stock_mouvement", stockId, type: input.type, quantite: Number(input.quantite), motif: input.motif ?? null },
            `Mouvement stock : ${input.type} de ${input.quantite}`,
          );
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "stock.quantite_ajustee", entityType: "stock", entityId: stockId, payload: { stockId, ancienneQuantite: avant?.quantiteEnStock ?? "0.00", nouvelleQuantite: result.quantiteEnStock, delta: input.quantite, motif: input.motif ?? null } });
          return result;
        });
      }),

    getMouvements: protectedProcedure
      .input(z.object({ stockId: z.number().int() }))
      .query(({ ctx, input }) => getMouvementsStock(repo, ctx.tenant, input.stockId)),

    /** Alertes de seuil (lecture seule, scopées tenant). */
    getLowStock: protectedProcedure.query(({ ctx }) => listStocksEnAlerte(repo, ctx.tenant)),

    getStocksEnRupture: protectedProcedure.query(({ ctx }) => listStocksEnRupture(repo, ctx.tenant)),

    /** Quantités en commande (non reçues) par stock (parité client trpc.stocks.getEntrant). */
    getEntrant: protectedProcedure.query(({ ctx }) => listStockEntrant(repo, ctx.tenant)),

    /*
     * Génère une notification « Stock bas » par stock sous le seuil (parité client + legacy).
     * Cross-domaine : compose le repo notifications. Renvoie { alertsCreated }.
     */
    generateAlerts: protectedProcedure.mutation(({ ctx }) => genererAlertesStock(repo, notificationRepo, ctx.tenant)),

    /*
     * Rapport de réapprovisionnement groupé par fournisseur (parité client trpc.stocks.getRapportCommande).
     * Cross-domaine : compose le repo fournisseurs (associations article↔fournisseur + fiches).
     */
    getRapportCommande: protectedProcedure.query(({ ctx }) => genererRapportCommande(repo, fournisseurRepo, ctx.tenant)),
  });
}
