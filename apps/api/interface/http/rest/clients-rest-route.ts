import type { FastifyInstance } from "fastify";
import type { IClientRepository } from "../../../modules/clients/application/client-repository";
import { listClients, getClient } from "../../../modules/clients/application/read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import { authArtisanFromCookie, type CookieAuthDeps } from "../cookie-auth";

export interface ClientsRestDeps extends CookieAuthDeps {
  readonly repo: IClientRepository;
}

// PoC OPE-366 — façade REST du domaine clients, EN PARALLÈLE de tRPC (`clients.list`/`clients.getById`).
// Réutilise les mêmes use-cases purs (`listClients`/`getClient`) et la même auth cookie `token` que le
// reste du new-stack : aucune logique métier dupliquée, le transport REST est mince (parité tRPC).
// C'est la brique consommée par le front moderne via le client généré par openapi-typescript.
export function registerClientsRestRoute(app: FastifyInstance, deps: ClientsRestDeps): void {
  app.get("/api/rest/clients", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

    const clients = await listClients(deps.repo, { artisanId: auth.artisanId, userId: auth.userId });
    // Sérialisation REST stable : pas de superjson, les dates partent en ISO (le schéma OpenAPI les
    // type en `string`). Le contrat est ainsi auto-descriptible et générable en types côté front.
    return reply.send(clients);
  });

  app.get("/api/rest/clients/:id", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

    const id = Number((req.params as { id?: string } | undefined)?.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "Identifiant invalide" });

    try {
      const client = await getClient(deps.repo, { artisanId: auth.artisanId, userId: auth.userId }, id);
      return reply.send(client);
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: "Client introuvable" });
      throw err;
    }
  });
}
