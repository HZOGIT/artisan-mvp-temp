import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { ICommandeRepository } from "../../application/commande-repository";
import type { IFournisseurRepository } from "../../../fournisseurs/application/fournisseur-repository";
import type { IDevisRepository } from "../../../devis/application/devis-repository";
import { listCommandes, getCommande, listLignesCommande } from "../../application/read-use-cases";
import { getPerformancesFournisseurs } from "../../application/performances-use-cases";
import { listerDevisAcceptes } from "../../application/devis-acceptes-use-cases";
import { creerCommande, modifierCommande, supprimerCommande } from "../../application/write-use-cases";
import { envoyerCommandeParEmail, type CommandeMailingDeps } from "../../application/envoyer-commande-email";
import { genererCommandeDepuisDevisIA, type CommandeIaDeps } from "../../application/generer-depuis-devis-ia";
import {
  changerStatutCommande,
  listerCommandesEnRetard,
  recevoirCommande,
  definirStatutFacturation,
} from "../../application/statut-use-cases";
import type { CreateLigneInput } from "../../domain/commande";

const statutEnum = z.enum(["brouillon", "envoyee", "confirmee", "partiellement_livree", "livree", "annulee"]);

/** Lignes en entrée : montants en number (transport) → mappés en string pour le repo. */
const ligneSchema = z.object({
  articleId: z.number().int().nullish(),
  designation: z.string().min(1).max(255),
  reference: z.string().max(50).nullish(),
  quantite: z.number().positive(),
  unite: z.string().max(20).optional(),
  prixUnitaire: z.number().min(0).optional(),
  tauxTVA: z.number().min(0).max(100).optional(),
});

const createSchema = z.object({
  fournisseurId: z.number().int(),
  reference: z.string().max(50).nullish(),
  dateLivraisonPrevue: z.string().datetime().nullish(),
  adresseLivraison: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
  lignes: z.array(ligneSchema).min(1).max(500),
});

const updateSchema = z.object({
  reference: z.string().max(50).nullish(),
  dateLivraisonPrevue: z.string().datetime().nullish(),
  adresseLivraison: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
});

function toCreateLignes(lignes: z.infer<typeof ligneSchema>[]): CreateLigneInput[] {
  return lignes.map((l) => ({
    articleId: l.articleId ?? null,
    designation: l.designation,
    reference: l.reference ?? null,
    quantite: String(l.quantite),
    unite: l.unite,
    prixUnitaire: l.prixUnitaire != null ? String(l.prixUnitaire) : null,
    tauxTVA: l.tauxTVA != null ? String(l.tauxTVA) : undefined,
  }));
}

/*
 * Routeur tRPC du domaine commandes fournisseurs. Transport mince : valide les inputs
 * (zod), délègue aux use-cases (scoping tenant via ctx.tenant + totaux serveur), laisse
 * remonter les Domain errors (NotFound→404, Validation→400). Repository injecté (DI).
 */
export function createCommandesRouter(
  repo: ICommandeRepository,
  fournisseurRepo: IFournisseurRepository,
  devisRepo: IDevisRepository,
  mailing: CommandeMailingDeps,
  ia: CommandeIaDeps,
  db?: DbClient,
) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listCommandes(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getCommande(repo, ctx.tenant, input.id)),

    getLignes: protectedProcedure
      .input(z.object({ commandeId: z.number().int() }))
      .query(({ ctx, input }) => listLignesCommande(repo, ctx.tenant, input.commandeId)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerCommande(r, ctx.tenant, {
            fournisseurId: input.fournisseurId,
            reference: input.reference ?? null,
            dateLivraisonPrevue: input.dateLivraisonPrevue ? new Date(input.dateLivraisonPrevue) : null,
            adresseLivraison: input.adresseLivraison ?? null,
            notes: input.notes ?? null,
            lignes: toCreateLignes(input.lignes),
          });
          ctx.log.info({ event: "commande_creee", commandeId: result.id, fournisseurId: input.fournisseurId, nbLignes: input.lignes.length }, "Commande fournisseur créée");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "commande.creee", entityType: "commande", entityId: result.id, payload: { fournisseurId: result.fournisseurId, numero: result.numero, totalTTC: result.totalTTC, statut: result.statut, nbLignes: input.lignes.length } });
          return result;
        });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, dateLivraisonPrevue, ...rest } = input;
        const dlp = typeof dateLivraisonPrevue === "string" ? new Date(dateLivraisonPrevue) : dateLivraisonPrevue;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierCommande(r, ctx.tenant, id, { ...rest, dateLivraisonPrevue: dlp });
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "commande.modifiee", entityType: "commande", entityId: id, payload: { reference: result.reference, notes: result.notes } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerCommande(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "commande_supprimee", commandeId: input.id }, "Commande fournisseur supprimée");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "commande.supprimee", entityType: "commande", entityId: input.id, payload: { snapshot: { numero: before?.numero, fournisseurId: before?.fournisseurId, totalTTC: before?.totalTTC, statut: before?.statut } } });
          return { success: true };
        });
      }),

    /** ── Transitions de statut + indicateur retard ── */
    updateStatut: protectedProcedure
      .input(z.object({ id: z.number().int(), statut: statutEnum, dateLivraisonReelle: z.string().datetime().nullish() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          const result = await changerStatutCommande(
            r,
            ctx.tenant,
            input.id,
            input.statut,
            input.dateLivraisonReelle ? new Date(input.dateLivraisonReelle) : undefined,
          );
          const level = input.statut === "annulee" ? "warn" : "info";
          ctx.log[level]({ event: "commande_statut_changed", commandeId: input.id, newStatut: input.statut }, `Commande statut → ${input.statut}`);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "commande.statut_modifie", entityType: "commande", entityId: input.id, payload: { avant: { statut: before?.statut }, apres: { statut: result.statut }, totalTTC: result.totalTTC } });
          return result;
        });
      }),

    getEnRetard: protectedProcedure.query(({ ctx }) => listerCommandesEnRetard(repo, ctx.tenant)),

    /*
     * Performances par fournisseur (parité client `trpc.commandesFournisseurs.getPerformances`) :
     * stats dérivées des commandes × fournisseurs du tenant (cross-domaine, scopé).
     */
    getPerformances: protectedProcedure.query(({ ctx }) => getPerformancesFournisseurs(repo, fournisseurRepo, ctx.tenant)),

    /*
     * Devis acceptés du tenant, enrichis du nom client (parité client `listDevisAcceptes`) — base
     * de création d'une commande fournisseur. Cross-domaine (devis × clients), scopé.
     */
    listDevisAcceptes: protectedProcedure.query(({ ctx }) => listerDevisAcceptes(devisRepo, ctx.tenant)),

    recevoir: protectedProcedure
      .input(
        z.object({
          id: z.number().int(),
          lignes: z
            .array(z.object({ ligneId: z.number().int(), quantiteRecue: z.number().min(0).max(1_000_000) }))
            .max(500),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await recevoirCommande(
            r,
            ctx.tenant,
            input.id,
            input.lignes.map((l) => ({ ligneId: l.ligneId, quantiteRecue: l.quantiteRecue })),
          );
          ctx.log.info({ event: "commande_recue", commandeId: input.id, nbLignesRecues: input.lignes.length }, "Réception commande fournisseur enregistrée");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "commande.recue", entityType: "commande", entityId: input.id, payload: { nbLignes: input.lignes.length, statut: result.statut } });
          return result;
        });
      }),

    setStatutFacturation: protectedProcedure
      .input(
        z.object({
          id: z.number().int(),
          statutFacturation: z.enum(["a_facturer", "facturee"]),
          depenseId: z.number().int().nullish(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await definirStatutFacturation(r, ctx.tenant, input.id, input.statutFacturation, input.depenseId ?? null);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "commande.facturation_definie", entityType: "commande", entityId: input.id, payload: { statutFacturation: input.statutFacturation, depenseId: input.depenseId ?? null } });
          return result;
        });
      }),

    /*
     * Envoi du bon de commande au fournisseur par email (PDF en PJ) — parité `sendEmail`.
     * ownership 404 / fournisseur.email 400 / rate-limit 429 ; statut → envoyee après envoi.
     */
    sendEmail: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => envoyerCommandeParEmail(mailing, ctx.tenant, input.id)),

    /*
     * Proposition IA de lignes de commande à partir d'un devis accepté (LECTURE SEULE, non persistée).
     * rate-limit IA 429 / devis 404 / statut accepté 400. Parité `genererDepuisDevisIA`.
     */
    genererDepuisDevisIA: protectedProcedure
      .input(z.object({ devisId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => genererCommandeDepuisDevisIA(ia, ctx.tenant, input.devisId)),
  });
}
