import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICongeRepository, SoldeResult } from "./conge-repository";
import type { Conge } from "../domain/conge";
import { calculerJoursAcquisPeriode, periodeReference } from "./solde";

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
 * Solde CP enrichi : `joursAcquis` calculé à la lecture depuis `techniciens.createdAt`.
 * `periodeDebut` = premier jour de la période de référence (ex. « 2025-06-01 »).
 */
export async function getSoldeConge(
  repo: ICongeRepository,
  ctx: TenantContext,
  technicienId: number,
  periodeDebut: string,
): Promise<SoldeResult[]> {
  const periode = periodeReference(periodeDebut);
  const annee = Number(periodeDebut.split("-")[0]);
  const [dateEmbauche, rows] = await Promise.all([
    repo.getTechnicienDateEmbauche(ctx, technicienId),
    repo.getSolde(ctx, technicienId, annee, periodeDebut),
  ]);
  const joursAcquis = dateEmbauche
    ? calculerJoursAcquisPeriode(dateEmbauche, periodeDebut, periode.periodeFin)
    : 0;

  const cpRow = rows.find((r) => r.type === "conge_paye");
  const autres = rows.filter((r) => r.type !== "conge_paye");
  const joursReportes = cpRow?.joursReportes ?? 0;
  const cpResult: SoldeResult = cpRow
    ? { ...cpRow, joursAcquis, soldeRestant: Math.max(0, joursAcquis + joursReportes - cpRow.joursPris) }
    : {
        type: "conge_paye",
        annee,
        periodeDebut: periode.periodeDebut,
        periodeFin: periode.periodeFin,
        exercice: periode.exercice,
        soldeInitial: 0,
        joursAcquis,
        joursPris: 0,
        joursReportes: 0,
        soldeRestant: joursAcquis,
      };
  return [cpResult, ...autres];
}

export interface SoldeResume {
  readonly technicienId: number;
  readonly exercice: string | null;
  readonly periodeDebut: string | null;
  readonly periodeFin: string | null;
  readonly joursAcquis: number;
  readonly joursPris: number;
  readonly joursReportes: number;
  readonly soldeRestant: number;
}

/** Soldes CP de tous les techniciens du tenant pour la période (un seul appel DB). */
export async function listSoldesConges(
  repo: ICongeRepository,
  ctx: TenantContext,
  periodeDebut: string,
): Promise<SoldeResume[]> {
  const annee = Number(periodeDebut.split("-")[0]);
  const periode = periodeReference(periodeDebut);
  const rows = await repo.listTechniciensSolde(ctx, annee, periodeDebut);
  return rows.map(({ technicienId, dateEmbauche, joursPris, joursReportes }) => {
    const joursAcquis = calculerJoursAcquisPeriode(dateEmbauche, periodeDebut, periode.periodeFin);
    return {
      technicienId,
      exercice: periode.exercice,
      periodeDebut: periode.periodeDebut,
      periodeFin: periode.periodeFin,
      joursAcquis,
      joursPris,
      joursReportes,
      soldeRestant: Math.max(0, joursAcquis + joursReportes - joursPris),
    };
  });
}

/**
 * Clôture de période : calcule le report des CP non pris pour chaque technicien du tenant
 * et l'écrit dans la période suivante. Idempotent.
 * `periodeDebutSource` = premier jour de la période à clôturer (ex. « 2025-06-01 »).
 */
export async function cloturerPeriode(
  repo: ICongeRepository,
  ctx: TenantContext,
  periodeDebutSource: string,
): Promise<{ technicienId: number; joursReportes: number }[]> {
  const { periodeFin: periodeFinSource, exercice: exerciceSource } = periodeReference(periodeDebutSource);
  const anneeSource = Number(exerciceSource.split("-")[0]);
  /** Période suivante : toujours le 1er juin de l'année N+1. */
  const periodeDebutSuivante = `${anneeSource + 1}-06-01`;
  const suivante = periodeReference(periodeDebutSuivante);

  const techniciens = await repo.listTechniciensSolde(ctx, anneeSource, periodeDebutSource);
  const rapports: { technicienId: number; joursReportes: number }[] = [];

  for (const { technicienId, dateEmbauche, joursPris, joursReportes } of techniciens) {
    const joursAcquis = calculerJoursAcquisPeriode(dateEmbauche, periodeDebutSource, periodeFinSource);
    const restant = Math.max(0, joursAcquis + joursReportes - joursPris);
    if (restant <= 0) continue;
    await repo.reporterSolde(ctx, {
      technicienId,
      type: "conge_paye",
      anneeSource,
      periodeDebutSource,
      joursReportes: restant,
      annee: anneeSource + 1,
      periodeDebut: `${anneeSource + 1}-06-01`,
      periodeFin: suivante.periodeFin,
    });
    rapports.push({ technicienId, joursReportes: restant });
  }
  return rapports;
}
