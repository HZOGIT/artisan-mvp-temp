import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICongeRepository, SoldeResult } from "./conge-repository";
import type { Conge } from "../domain/conge";
import { calculerJoursAcquisAnnee } from "./solde";

/*
 * Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
 * `TenantContext` (le repo l'applique). `getConge` sur une ressource d'un autre tenant → le
 * repo renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant).
 */

export function listConges(repo: ICongeRepository, ctx: TenantContext): Promise<Conge[]> {
  return repo.list(ctx);
}

/** Demandes en attente d'approbation, scopées tenant (vue manager). Parité legacy `enAttente`. */
export function listCongesEnAttente(repo: ICongeRepository, ctx: TenantContext): Promise<Conge[]> {
  return repo.listEnAttente(ctx);
}

export async function getConge(repo: ICongeRepository, ctx: TenantContext, id: number): Promise<Conge> {
  const conge = await repo.getById(ctx, id);
  if (!conge) throw new NotFoundError("Demande de congé introuvable");
  return conge;
}

/**
 * Solde CP enrichi : `joursAcquis` calculé à la lecture depuis `techniciens.createdAt`,
 * naturellement idempotent — même appel = même résultat.
 */
export async function getSoldeConge(repo: ICongeRepository, ctx: TenantContext, technicienId: number, annee: number): Promise<SoldeResult[]> {
  const [dateEmbauche, rows] = await Promise.all([
    repo.getTechnicienDateEmbauche(ctx, technicienId),
    repo.getSolde(ctx, technicienId, annee),
  ]);
  const joursAcquis = dateEmbauche ? calculerJoursAcquisAnnee(dateEmbauche, annee) : 0;
  const cpRow = rows.find((r) => r.type === "conge_paye");
  const autres = rows.filter((r) => r.type !== "conge_paye");
  const cpResult: SoldeResult = cpRow
    ? { ...cpRow, joursAcquis, soldeRestant: Math.max(0, joursAcquis - cpRow.joursPris) }
    : { type: "conge_paye", annee, soldeInitial: 0, joursAcquis, joursPris: 0, soldeRestant: joursAcquis };
  return [cpResult, ...autres];
}

export interface SoldeResume {
  readonly technicienId: number;
  readonly joursAcquis: number;
  readonly joursPris: number;
  readonly soldeRestant: number;
}

/** Soldes CP de tous les techniciens du tenant pour l'année (un seul appel DB). */
export async function listSoldesConges(repo: ICongeRepository, ctx: TenantContext, annee: number): Promise<SoldeResume[]> {
  const rows = await repo.listTechniciensSolde(ctx, annee);
  return rows.map(({ technicienId, dateEmbauche, joursPris }) => {
    const joursAcquis = calculerJoursAcquisAnnee(dateEmbauche, annee);
    return { technicienId, joursAcquis, joursPris, soldeRestant: Math.max(0, joursAcquis - joursPris) };
  });
}
