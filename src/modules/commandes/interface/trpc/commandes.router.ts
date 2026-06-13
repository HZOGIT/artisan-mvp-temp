import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { ICommandeRepository } from "../../application/commande-repository";
import { listCommandes, getCommande, listLignesCommande } from "../../application/read-use-cases";
import { creerCommande, modifierCommande, supprimerCommande } from "../../application/write-use-cases";
import type { CreateLigneInput } from "../../domain/commande";

// Lignes en entrée : montants en number (transport) → mappés en string pour le repo.
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

// Routeur tRPC du domaine commandes fournisseurs. Transport mince : valide les inputs
// (zod), délègue aux use-cases (scoping tenant via ctx.tenant + totaux serveur), laisse
// remonter les Domain errors (NotFound→404, Validation→400). Repository injecté (DI).
export function createCommandesRouter(repo: ICommandeRepository) {
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
      .mutation(({ ctx, input }) =>
        creerCommande(repo, ctx.tenant, {
          fournisseurId: input.fournisseurId,
          reference: input.reference ?? null,
          dateLivraisonPrevue: input.dateLivraisonPrevue ? new Date(input.dateLivraisonPrevue) : null,
          adresseLivraison: input.adresseLivraison ?? null,
          notes: input.notes ?? null,
          lignes: toCreateLignes(input.lignes),
        }),
      ),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, dateLivraisonPrevue, ...rest } = input;
        const dlp = typeof dateLivraisonPrevue === "string" ? new Date(dateLivraisonPrevue) : dateLivraisonPrevue;
        return modifierCommande(repo, ctx.tenant, id, { ...rest, dateLivraisonPrevue: dlp });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerCommande(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
