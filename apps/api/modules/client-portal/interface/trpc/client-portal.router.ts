import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { TenantContext } from "../../../../shared/tenant";
import type { LlmPort } from "../../../../shared/ports/llm";
import type { LlmUsageTracker } from "../../../../shared/ports/llm-usage-tracker";
import type { ArtisanReader } from "../../../../shared/readers/contact-readers";
import type { IPortalAccessRepository } from "../../application/portal-access-repository";
import type { IPortalDocsReader } from "../../application/portal-docs-reader";
import type { IPortalSchedulingReader } from "../../application/portal-scheduling-reader";
import type { ChatRepoForPortal } from "../../application/chat-use-cases";
import { generateAccess, getStatus, deactivate, verifyAccess, getClientInfo } from "../../application/use-cases";
import { getDevis, getFactures, getInterventions, getContrats, listerOptionsDevis, selectionnerOption } from "../../application/doc-use-cases";
import type { IPortalDevisOptionsWriter } from "../../application/portal-devis-options-writer";
import { getCreneauxDisponibles, demanderRdv, getMesRdv, getSuiviChantiers } from "../../application/scheduling-use-cases";
import { getConversations, getConversationMessages, sendClientMessage, markClientMessagesAsRead, demanderModification } from "../../application/chat-use-cases";
import { soumettreDemandeIA } from "../../application/ia-use-cases";
import type { AppLogger } from "../../../../shared/ports/logger";

/*
 * Toutes les dépendances des procs du portail (admin cookie + public token). Interface CONCRÈTE (les
 * types larges satisfont structurellement les deps étroites de chaque use-case lors de l'appel).
 */
export interface ClientPortalRouterDeps {
  /** origine de base des liens portail (fallback APP_URL au wiring) */
  readonly defaultOrigin: string;
  readonly access: IPortalAccessRepository;
  readonly docs: IPortalDocsReader;
  readonly scheduling: IPortalSchedulingReader;
  readonly chat: ChatRepoForPortal;
  readonly clients: { getById(ctx: TenantContext, id: number): Promise<{ id: number; nom: string; prenom: string | null; email: string | null; telephone: string | null } | null> };
  readonly notifications: { creer(ctx: TenantContext, input: { type: "info"; titre: string; message: string; lien: string }): Promise<unknown> };
  readonly artisanReader: { getArtisanPublic(artisanId: number): Promise<{ email: string | null } | null> };
  readonly artisanInfoReader: ArtisanReader;
  readonly email: { send(message: { to: string; subject: string; body: string }): Promise<void> };
  readonly rateLimiter: { check(key: string): Promise<boolean> };
  readonly llm: LlmPort;
  readonly trackLlm?: LlmUsageTracker;
  readonly genToken?: () => string;
  readonly devisOptionsWriter: IPortalDevisOptionsWriter;
}

/** UUID v4 (36 chars) avec marge pour évolutions futures — jamais de valeur vide ou géante */
const tokenSchema = z.string().min(1).max(128);
const tokenInput = z.object({ token: tokenSchema });

/*
 * Routeur tRPC `clientPortal` (espace client). ADMIN (cookie artisan) : génération/statut/désactivation
 * de l'accès. PUBLIC (token = capacité, pas de cookie) : identité, documents (devis/factures/
 * interventions/contrats), RDV, suivi chantiers, chat, demandes (modification + IA).
 */
export function createClientPortalRouter(deps: ClientPortalRouterDeps) {
  return router({
    /** ── ADMIN (protégé) ── */
    generateAccess: protectedProcedure.input(z.object({ clientId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await generateAccess(deps, ctx.tenant, input.clientId, deps.defaultOrigin);
      ctx.log.info({ event: "portail_access_created", clientId: input.clientId }, "Accès portail client généré");
      return result;
    }),
    getStatus: protectedProcedure.input(z.object({ clientId: z.number().int().positive() })).query(({ ctx, input }) => getStatus(deps, ctx.tenant, input.clientId)),
    deactivate: protectedProcedure.input(z.object({ clientId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deactivate(deps, ctx.tenant, input.clientId);
      ctx.log.warn({ event: "portail_access_revoked", clientId: input.clientId }, "Accès portail client révoqué");
      return result;
    }),

    /** ── PUBLIC (token) — identité + documents ── */
    verifyAccess: publicProcedure.input(tokenInput).query(({ input }) => verifyAccess(deps, input.token)),
    getClientInfo: publicProcedure.input(tokenInput).query(({ input }) => getClientInfo(deps, input.token)),
    getDevis: publicProcedure.input(tokenInput).query(({ input }) => getDevis(deps, input.token)),
    getFactures: publicProcedure.input(tokenInput).query(({ input }) => getFactures(deps, input.token)),
    getInterventions: publicProcedure.input(tokenInput).query(({ input }) => getInterventions(deps, input.token)),
    getContrats: publicProcedure.input(tokenInput).query(({ input }) => getContrats(deps, input.token)),

    /** ── PUBLIC (token) — RDV + chantiers ── */
    getCreneauxDisponibles: publicProcedure.input(tokenInput).query(({ input }) => getCreneauxDisponibles(deps, input.token)),
    demanderRdv: publicProcedure
      .input(z.object({ token: tokenSchema, titre: z.string().min(1).max(200), description: z.string().max(5000).optional(), urgence: z.enum(["normale", "urgente", "tres_urgente"]).default("normale"), dateProposee: z.string().max(40) }))
      .mutation(({ input }) => demanderRdv(deps, input.token, { titre: input.titre, description: input.description, urgence: input.urgence, dateProposee: input.dateProposee })),
    getMesRdv: publicProcedure.input(tokenInput).query(({ input }) => getMesRdv(deps, input.token)),
    getSuiviChantiers: publicProcedure.input(tokenInput).query(({ input }) => getSuiviChantiers(deps, input.token)),

    /** ── PUBLIC (token) — chat + demandes ── */
    getConversations: publicProcedure.input(tokenInput).query(({ input }) => getConversations(deps, input.token)),
    getConversationMessages: publicProcedure.input(z.object({ token: tokenSchema, conversationId: z.number().int().positive() })).query(({ input }) => getConversationMessages(deps, input.token, input.conversationId)),
    sendClientMessage: publicProcedure.input(z.object({ token: tokenSchema, conversationId: z.number().int().positive(), contenu: z.string().min(1).max(5000) })).mutation(({ input }) => sendClientMessage(deps, input.token, input.conversationId, input.contenu)),
    markClientMessagesAsRead: publicProcedure.input(z.object({ token: tokenSchema, conversationId: z.number().int().positive() })).mutation(({ input }) => markClientMessagesAsRead(deps, input.token, input.conversationId)),
    demanderModification: publicProcedure.input(z.object({ token: tokenSchema, message: z.string().min(1).max(5000) })).mutation(({ input }) => demanderModification(deps, input.token, input.message)),
    soumettreDemandeIA: publicProcedure.input(z.object({ token: tokenSchema, description: z.string().min(10).max(2000) })).mutation(({ ctx, input }) => soumettreDemandeIA(deps, input.token, input.description, ctx.log as unknown as AppLogger)),

    /** ── PUBLIC (token) — options/variantes d'un devis ── */
    listerOptionsDevis: publicProcedure
      .input(z.object({ token: tokenSchema, devisId: z.number().int().positive() }))
      .query(({ input }) => listerOptionsDevis(deps, input.token, input.devisId)),

    selectionnerOption: publicProcedure
      .input(z.object({ token: tokenSchema, optionId: z.number().int().positive() }))
      .mutation(({ input }) =>
        selectionnerOption({ access: deps.access, docs: deps.docs, devisOptionsWriter: deps.devisOptionsWriter, rateLimiter: deps.rateLimiter }, input.token, input.optionId),
      ),
  });
}
