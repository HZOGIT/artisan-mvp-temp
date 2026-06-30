import { z } from "zod";
import { router, permissionProcedure } from "../../../../interface/trpc/trpc";
import { SiretSchema } from "../../../../../../packages/contract/validation";
import { ValidationError } from "../../../../shared/errors";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";

/*
 * Procédures gatées par permission (parité legacy) : lecture = `clients.voir`, écriture = `clients.gerer`.
 * Le propriétaire reçoit ALL_PERMISSIONS au provisioning ; un collaborateur sans la permission → 403.
 */
const voir = permissionProcedure("clients.voir");
const gerer = permissionProcedure("clients.gerer");
import type { ClientsModuleDeps } from "../../clients.module";
import {
  listClients,
  getClient,
  rechercherClients,
  getEncoursClient,
  getEncoursMap,
} from "../../application/read-use-cases";
import { creerClient, modifierClient, supprimerClient, fusionnerClients, anonymiserClient } from "../../application/write-use-cases";
import { importerClients } from "../../application/import-use-cases";
import { envoyerMessageClients } from "../../application/email-use-cases";

/*
 * Bornes alignées sur `ClientInputSchema` (shared/validation.ts) — defense-in-depth côté
 * transport. Le format e-mail (et le « nom requis ») sont aussi validés au use-case
 * (indépendant du transport) ; ici on borne surtout les longueurs colonnes PG.
 */
const createSchema = z.object({
  nom: z.string().min(1).max(100),
  prenom: z.string().max(100).nullish(),
  email: z.string().max(320).nullish(),
  telephone: z.string().max(20).nullish(),
  adresse: z.string().max(255).nullish(),
  codePostal: z.string().max(10).nullish(),
  ville: z.string().max(100).nullish(),
  adresseFacturation: z.string().max(255).nullish(),
  codePostalFacturation: z.string().max(10).nullish(),
  villeFacturation: z.string().max(100).nullish(),
  type: z.enum(["particulier", "professionnel"]).optional(),
  raisonSociale: z.string().max(255).nullish(),
  siret: SiretSchema.or(z.null()),
  numeroTVA: z.string().max(20).nullish(),
  etiquettes: z.string().max(500).nullish(),
  notes: z.string().nullish(),
});

/** Mise à jour partielle : tous les champs optionnels ; `nom` s'il est fourni reste non vide. */
const updateSchema = z.object({
  nom: z.string().min(1).max(100).optional(),
  prenom: z.string().max(100).nullish(),
  email: z.string().max(320).nullish(),
  telephone: z.string().max(20).nullish(),
  adresse: z.string().max(255).nullish(),
  codePostal: z.string().max(10).nullish(),
  ville: z.string().max(100).nullish(),
  adresseFacturation: z.string().max(255).nullish(),
  codePostalFacturation: z.string().max(10).nullish(),
  villeFacturation: z.string().max(100).nullish(),
  type: z.enum(["particulier", "professionnel"]).optional(),
  raisonSociale: z.string().max(255).nullish(),
  siret: SiretSchema.or(z.null()),
  numeroTVA: z.string().max(20).nullish(),
  etiquettes: z.string().max(500).nullish(),
  notes: z.string().nullish(),
});

/*
 * Routeur tRPC du domaine clients (CRM/PII). Transport mince : valide les inputs (zod),
 * délègue aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors
 * (NotFound→404, Validation→400, Conflict→409 pour une suppression refusée). Repo injecté (DI).
 */
export function createClientsRouter(deps: ClientsModuleDeps) {
  const { repository: repo } = deps;
  return router({
    list: voir.query(({ ctx }) => listClients(repo, ctx.tenant)),

    getById: voir
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getClient(repo, ctx.tenant, input.id)),

    search: voir
      .input(z.object({ query: z.string().min(1).max(100) }))
      .query(({ ctx, input }) => rechercherClients(repo, ctx.tenant, input.query)),

    /** Encours financier (reste dû des factures impayées). Lecture seule, scopée tenant. */
    getEncours: voir
      .input(z.object({ clientId: z.number().int() }))
      .query(({ ctx, input }) => getEncoursClient(repo, ctx.tenant, input.clientId)),

    getEncoursMap: voir.query(({ ctx }) => getEncoursMap(repo, ctx.tenant)),

    create: gerer
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        return withOutbox(deps.db, repo, async (r, tx) => {
          const result = await creerClient(r, ctx.tenant, input);
          ctx.log.info({ event: "client_created", clientId: result.id, type: input.type ?? "particulier" }, "Nouveau client créé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "client.cree", entityType: "client", entityId: result.id, payload: { nom: result.nom, type: result.type } });
          return result;
        });
      }),

    update: gerer
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(deps.db, repo, async (r, tx) => {
          const result = await modifierClient(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "client.modifie", entityType: "client", entityId: id, payload: { nom: data.nom ?? null, type: data.type ?? null } });
          return result;
        });
      }),

    delete: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(deps.db, repo, async (r, tx) => {
          await supprimerClient(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "client_deleted", clientId: input.id }, "Client supprimé définitivement");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "client.supprime", entityType: "client", entityId: input.id, payload: {} });
          return { success: true };
        });
      }),

    /**
     * RGPD Art. 17 — droit à l'effacement. Anonymise les PII du client (nom/email/tel/adresse…)
     * sans supprimer la ligne ni les documents légaux liés (factures conservées 10 ans).
     */
    anonymiser: gerer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(deps.db, repo, async (r, tx) => {
          await anonymiserClient(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "client_anonymise", clientId: input.id }, "Client anonymisé (RGPD Art. 17)");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "client.anonymise", entityType: "client", entityId: input.id, payload: {} });
          return { success: true };
        });
      }),

    /*
     * Fusion de doublons : réaffecte tout l'historique du `doublonId` vers `survivantId` (une
     * transaction, all-or-nothing) puis archive le doublon. Cloisonnement tenant strict (cross-tenant
     * → NotFound). Idempotent.
     */
    fusionner: gerer
      .input(z.object({ survivantId: z.number().int(), doublonId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await fusionnerClients(repo, ctx.tenant, input.survivantId, input.doublonId);
        ctx.log.warn(
          { event: "clients_merged", survivantId: input.survivantId, doublonId: input.doublonId },
          "Fusion de doublons clients",
        );
        return result;
      }),

    /*
     * Import en masse (parité client `trpc.clients.importFromExcel`). Lignes déjà parsées côté
     * client (max 5000). Best-effort par ligne → { imported, skipped }. Bornes defense-in-depth.
     */
    importFromExcel: gerer
      .input(
        z.object({
          clients: z
            .array(
              z.object({
                nom: z.string().max(200),
                prenom: z.string().max(200).optional(),
                email: z.string().email().max(320).optional(),
                telephone: z.string().max(40).optional(),
                adresse: z.string().max(500).optional(),
                codePostal: z.string().max(20).optional(),
                ville: z.string().max(200).optional(),
                notes: z.string().max(5000).optional(),
              }),
            )
            .max(5000, "Import limité à 5000 clients par envoi"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const result = await importerClients(repo, ctx.tenant, input.clients);
        ctx.log.info({ event: "clients_imported", total: input.clients.length, imported: result.imported, skipped: result.skipped }, `Import clients : ${result.imported} importés, ${result.skipped} ignorés`);
        return result;
      }),

    /*
     * Envoi d'un message email à une sélection de clients du tenant (relance groupée, offre ponctuelle…).
     * Respecte l'opt-out (email_optouts) : les désinscrits sont skippés silencieusement. Loggé.
     * Gate `clients.gerer` (écriture) — un artisan n'écrit qu'à SES clients (scoping repo.list + RLS).
     */
    envoyerMessage: gerer
      .input(
        z.object({
          clientIds: z.array(z.number().int()).min(1).max(200),
          sujet: z.string().min(1).max(500),
          corps: z.string().min(1).max(50000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!deps.email || !deps.optoutRepo || !deps.db) {
          throw new ValidationError("Service email non disponible");
        }
        const result = await envoyerMessageClients(repo, deps.optoutRepo, deps.email, deps.db, ctx.tenant, {
          ...input,
          appUrl: deps.appUrl ?? "https://www.operioz.com",
          unsubscribeSecret: deps.unsubscribeSecret ?? "dev-unsubscribe-secret",
        });
        ctx.log.info(
          { event: "clients_message_envoye", envoyes: result.envoyes, skips: result.skips, errors: result.errors },
          `Message envoyé à ${result.envoyes} client(s)`,
        );
        return result;
      }),
  });
}
