import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICongeRepository } from "./conge-repository";
import type { Conge, CreateCongeInput, UpdateCongeInput } from "../domain/conge";
import { calculerJoursConge, typeAffecteSolde } from "./solde";

/*
 * Décompte (signe +) ou recrédit (signe −) du solde pour un congé conge_paye/rtt. Sans effet
 * pour les autres types. Imputé sur l'année de dateDebut (parité legacy, anti-corruption
 * inter-exercices). `signe` = +1 (approbation : on prend des jours) / −1 (annulation : on rend).
 */
async function ajusterSoldePourConge(
  repo: ICongeRepository,
  ctx: TenantContext,
  conge: Conge,
  signe: 1 | -1,
): Promise<void> {
  if (!typeAffecteSolde(conge.type)) return;
  const { jours, annee, periodeDebut, periodeFin } = calculerJoursConge(conge);
  await repo.ajusterSolde(ctx, { technicienId: conge.technicienId, type: conge.type, annee, periodeDebut, periodeFin, deltaJours: signe * jours });
}

/*
 * Use-cases d'écriture — purs, repository injecté. Validation des dates + ⚠️ **garde
 * anti-IDOR-FK** : une demande ne peut viser qu'un technicien (demandeur) du tenant.
 * Le workflow d'approbation (statut/validePar/solde) est porté séparément.
 */

function assertDatesCoherentes(dateDebut?: string, dateFin?: string): void {
  /** Dates au format ISO `YYYY-MM-DD` → comparaison lexicographique = chronologique. */
  if (dateDebut && dateFin && dateFin < dateDebut) {
    throw new ValidationError("La date de fin doit être postérieure ou égale à la date de début");
  }
}

export async function creerConge(repo: ICongeRepository, ctx: TenantContext, input: CreateCongeInput): Promise<Conge> {
  assertDatesCoherentes(input.dateDebut, input.dateFin);
  /* Anti-IDOR-FK : le technicien (demandeur) doit appartenir au tenant. */
  if (!(await repo.ownsTechnicien(ctx, input.technicienId))) {
    throw new NotFoundError("Technicien introuvable");
  }
  if (await repo.hasOverlap(ctx, { technicienId: input.technicienId, dateDebut: input.dateDebut, dateFin: input.dateFin })) {
    throw new ConflictError("Le technicien a déjà une demande de congé sur cette période");
  }
  if (typeAffecteSolde(input.type)) {
    const { jours, annee, periodeDebut } = calculerJoursConge({
      dateDebut: input.dateDebut,
      dateFin: input.dateFin,
      demiJourneeDebut: input.demiJourneeDebut ?? false,
      demiJourneeFin: input.demiJourneeFin ?? false,
    });
    const soldes = await repo.getSolde(ctx, input.technicienId, annee, periodeDebut);
    const solde = soldes.find((s) => s.type === input.type);
    if (solde && solde.soldeRestant < jours) {
      throw new ConflictError(`Solde insuffisant : ${solde.soldeRestant} jour(s) disponible(s), ${jours} demandé(s)`);
    }
  }
  return repo.create(ctx, input);
}

export async function modifierConge(
  repo: ICongeRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateCongeInput,
): Promise<Conge> {
  assertDatesCoherentes(input.dateDebut, input.dateFin);
  const existing = await repo.getById(ctx, id);
  if (!existing) throw new NotFoundError("Demande de congé introuvable");
  if (existing.statut !== "en_attente") throw new ConflictError("Impossible de modifier un congé " + existing.statut);
  const effectiveDebut = input.dateDebut ?? existing.dateDebut;
  const effectiveFin = input.dateFin ?? existing.dateFin;
  if (await repo.hasOverlap(ctx, { technicienId: existing.technicienId, dateDebut: effectiveDebut, dateFin: effectiveFin, excludeId: id })) {
    throw new ConflictError("Le technicien a déjà une demande de congé sur cette période");
  }
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Demande de congé introuvable");
  return updated;
}

export async function supprimerConge(repo: ICongeRepository, ctx: TenantContext, id: number): Promise<void> {
  const conge = await repo.getById(ctx, id);
  if (!conge) throw new NotFoundError("Demande de congé introuvable");
  /** Recrédit du solde si on supprime un congé approuvé (qui avait décompté) — parité legacy. */
  if (conge.statut === "approuve") await ajusterSoldePourConge(repo, ctx, conge, -1);
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Demande de congé introuvable");
}

/*
 * --- Workflow d'approbation (transitions de statut). ⚠️ L'intégration du SOLDE (décompte
 * idempotent + recrédit) est portée séparément ; ici, les gardes de transition + la garde
 * **anti self-approbation**. ---
 */

async function chargerCongeDuTenant(repo: ICongeRepository, ctx: TenantContext, id: number): Promise<Conge> {
  const conge = await repo.getById(ctx, id);
  if (!conge) throw new NotFoundError("Demande de congé introuvable");
  return conge;
}

/*
 * ⚠️ Anti self-approbation : l'utilisateur courant ne doit pas être le demandeur. On compare
 * la fiche technicien liée à l'utilisateur au `technicienId` de la demande. Un approbateur non
 * lié à une fiche (owner/secrétaire) peut toujours valider (findTechnicienIdForUser → null).
 */
async function assertPasSelfApprobation(repo: ICongeRepository, ctx: TenantContext, conge: Conge): Promise<void> {
  const approbateurTech = await repo.findTechnicienIdForUser(ctx);
  if (approbateurTech !== null && approbateurTech === conge.technicienId) {
    throw new ForbiddenError("Vous ne pouvez pas approuver votre propre demande de congé");
  }
}

export async function approuverConge(
  repo: ICongeRepository,
  ctx: TenantContext,
  id: number,
  commentaire?: string | null,
): Promise<Conge> {
  const conge = await chargerCongeDuTenant(repo, ctx, id);
  /** idempotent (pas de re-décompte de solde) */
  if (conge.statut === "approuve") return conge;
  if (conge.statut !== "en_attente") throw new ConflictError("Cette demande a déjà été traitée");
  await assertPasSelfApprobation(repo, ctx, conge);
  /*
   * Décompte du solde UNIQUEMENT à la transition en_attente→approuve (idempotence garantie
   * par le garde ci-dessus).
   */
  await ajusterSoldePourConge(repo, ctx, conge, 1);
  const updated = await repo.setStatut(ctx, id, "approuve", ctx.userId, commentaire);
  if (!updated) throw new NotFoundError("Demande de congé introuvable");
  return updated;
}

export async function refuserConge(
  repo: ICongeRepository,
  ctx: TenantContext,
  id: number,
  commentaire?: string | null,
): Promise<Conge> {
  const conge = await chargerCongeDuTenant(repo, ctx, id);
  /** idempotent */
  if (conge.statut === "refuse") return conge;
  if (conge.statut !== "en_attente") throw new ConflictError("Cette demande a déjà été traitée");
  /*
   * Refuser sa propre demande = se la refuser à soi-même : sans risque, mais on garde la
   * symétrie de la décision en bloquant aussi le self (cohérence du workflow d'approbation).
   */
  await assertPasSelfApprobation(repo, ctx, conge);
  const updated = await repo.setStatut(ctx, id, "refuse", ctx.userId, commentaire);
  if (!updated) throw new NotFoundError("Demande de congé introuvable");
  return updated;
}

export async function annulerConge(repo: ICongeRepository, ctx: TenantContext, id: number): Promise<Conge> {
  const conge = await chargerCongeDuTenant(repo, ctx, id);
  /** idempotent (pas de double recrédit de solde) */
  if (conge.statut === "annule") return conge;
  if (conge.statut === "refuse") throw new ConflictError("Une demande refusée ne peut pas être annulée");
  /** Recrédit du solde UNIQUEMENT si on QUITTE l'état approuve (qui avait décompté). */
  if (conge.statut === "approuve") await ajusterSoldePourConge(repo, ctx, conge, -1);
  const updated = await repo.setStatut(ctx, id, "annule", ctx.userId);
  if (!updated) throw new NotFoundError("Demande de congé introuvable");
  return updated;
}
