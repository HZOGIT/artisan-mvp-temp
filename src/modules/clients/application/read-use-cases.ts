import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IClientRepository } from "./client-repository";
import type { Client } from "../domain/client";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
// `TenantContext` (le repo l'applique). `getClient` sur une ressource d'un autre tenant → le
// repo renvoie null → NotFoundError (anti-oracle PII : ne révèle pas l'existence d'un client
// cross-tenant).

export function listClients(repo: IClientRepository, ctx: TenantContext): Promise<Client[]> {
  return repo.list(ctx);
}

export async function getClient(repo: IClientRepository, ctx: TenantContext, id: number): Promise<Client> {
  const client = await repo.getById(ctx, id);
  if (!client) throw new NotFoundError("Client introuvable");
  return client;
}
