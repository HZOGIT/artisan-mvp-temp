import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IDemandeContactRepository } from "../../application/demande-contact-repository";
import { listDemandes, demandesParStatut, getDemande } from "../../application/read-use-cases";
import { creerDemande, modifierDemande, supprimerDemande } from "../../application/write-use-cases";
import { marquerContacte, convertir, marquerPerdu } from "../../application/transition-use-cases";

const statutEnum = z.enum(["nouveau", "contacte", "converti", "perdu"]);

/*
 * Bornes alignées sur la table `demandes_contact` (defense-in-depth). ⚠️ Le client NE fournit PAS
 * `statut` (forcé "nouveau" / transitions en 7/9) ni `clientId` (lié à la conversion en 7/9).
 */
const createSchema = z.object({
  nom: z.string().min(1).max(200),
  email: z.string().email().max(320).nullish(),
  telephone: z.string().max(30).nullish(),
  message: z.string().max(5000).nullish(),
  source: z.string().max(50).optional(),
});

const updateSchema = z.object({
  nom: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320).nullish(),
  telephone: z.string().max(30).nullish(),
  message: z.string().max(5000).nullish(),
  source: z.string().max(50).optional(),
});

/*
 * Routeur tRPC du domaine demandes-contact (inbox CRM). Transport mince : valide les inputs (zod),
 * délègue aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors
 * (NotFound→404, Validation→400, Conflict→409). ⚠️ Les transitions de statut (marquerContacte/
 * convertir/marquerPerdu) seront exposées en 7/9. Repo injecté.
 */
export function createDemandesContactRouter(repo: IDemandeContactRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listDemandes(repo, ctx.tenant)),

    byStatut: protectedProcedure
      .input(z.object({ statut: statutEnum }))
      .query(({ ctx, input }) => demandesParStatut(repo, ctx.tenant, input.statut)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getDemande(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerDemande(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierDemande(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerDemande(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    // Transitions de statut (état machine) — chacune valide la légalité depuis le statut courant.
    marquerContacte: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => marquerContacte(repo, ctx.tenant, input.id)),

    // Conversion : `clientId` optionnel (anti-IDOR vérifié au use-case).
    convertir: protectedProcedure
      .input(z.object({ id: z.number().int(), clientId: z.number().int().optional() }))
      .mutation(({ ctx, input }) => convertir(repo, ctx.tenant, input.id, input.clientId)),

    marquerPerdu: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => marquerPerdu(repo, ctx.tenant, input.id)),
  });
}
