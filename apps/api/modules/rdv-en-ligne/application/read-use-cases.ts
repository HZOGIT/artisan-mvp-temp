import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IRdvRepository } from "./rdv-repository";
import type { IClientRepository } from "../../clients/application/client-repository";
import type { Client } from "../../clients/domain/client";
import type { Rdv } from "../domain/rdv";

/*
 * Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
 * `getRdv` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.
 */

export function listRdvs(repo: IRdvRepository, ctx: TenantContext): Promise<Rdv[]> {
  return repo.list(ctx);
}

/** RDV enrichi de son client (le client UI lit `rdv.client.prenom/nom`). */
export type RdvAvecClient = Rdv & { readonly client: Client | null };

/*
 * Liste des RDV du tenant, chacun enrichi de son `client` (parité legacy `list` :
 * `Promise.all(map → {...r, client})`). ⚠️ Cross-domaine : compose le repo `clients` (scopé tenant →
 * un RDV dont le client n'appartiendrait pas au tenant aurait `client: null`).
 */
export async function listRdvsAvecClient(
  rdvRepo: IRdvRepository,
  clientRepo: IClientRepository,
  ctx: TenantContext,
): Promise<RdvAvecClient[]> {
  const rdvs = await rdvRepo.list(ctx);
  if (rdvs.length === 0) return [];
  const clientIds = Array.from(new Set(rdvs.map((r) => r.clientId)));
  const fetched = await clientRepo.listByIds(ctx, clientIds);
  const byId = new Map(fetched.map((c) => [c.id, c]));
  return rdvs.map((rdv) => ({ ...rdv, client: byId.get(rdv.clientId) ?? null }));
}

export async function getRdv(repo: IRdvRepository, ctx: TenantContext, id: number): Promise<Rdv> {
  const rdv = await repo.getById(ctx, id);
  if (!rdv) throw new NotFoundError("Rendez-vous introuvable");
  return rdv;
}

/** Comptes des RDV par statut, scopés tenant (parité legacy `rdv.getStats`). */
export interface RdvStats {
  readonly enAttente: number;
  readonly confirmes: number;
  readonly refuses: number;
}

export async function getRdvStats(repo: IRdvRepository, ctx: TenantContext): Promise<RdvStats> {
  const rdvs = await repo.list(ctx);
  return {
    enAttente: rdvs.filter((r) => r.statut === "en_attente").length,
    confirmes: rdvs.filter((r) => r.statut === "confirme").length,
    refuses: rdvs.filter((r) => r.statut === "refuse").length,
  };
}

/** Nombre de RDV en attente, scopé tenant (parité legacy `rdv.getPendingCount`). */
export async function getRdvPendingCount(repo: IRdvRepository, ctx: TenantContext): Promise<number> {
  const rdvs = await repo.list(ctx);
  return rdvs.filter((r) => r.statut === "en_attente").length;
}
