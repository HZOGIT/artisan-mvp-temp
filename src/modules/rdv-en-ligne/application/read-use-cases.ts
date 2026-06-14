import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IRdvRepository } from "./rdv-repository";
import type { Rdv } from "../domain/rdv";

// Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
// `getRdv` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.

export function listRdvs(repo: IRdvRepository, ctx: TenantContext): Promise<Rdv[]> {
  return repo.list(ctx);
}

export async function getRdv(repo: IRdvRepository, ctx: TenantContext, id: number): Promise<Rdv> {
  const rdv = await repo.getById(ctx, id);
  if (!rdv) throw new NotFoundError("Rendez-vous introuvable");
  return rdv;
}

// Comptes des RDV par statut, scopés tenant (parité legacy `rdv.getStats`).
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

// Nombre de RDV en attente, scopé tenant (parité legacy `rdv.getPendingCount`).
export async function getRdvPendingCount(repo: IRdvRepository, ctx: TenantContext): Promise<number> {
  const rdvs = await repo.list(ctx);
  return rdvs.filter((r) => r.statut === "en_attente").length;
}
