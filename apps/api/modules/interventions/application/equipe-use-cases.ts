import { NotFoundError, ForbiddenError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IInterventionRepository } from "./intervention-repository";
import type { EquipeMembre, EquipeMembreArtisan } from "../domain/intervention";

/*
 * Use-cases « équipe d'intervention » (sous-ressource `interventions_techniciens`). Purs (repo
 * injecté). ⚠️ Anti-IDOR (parité legacy) : tout accès est borné par l'intervention parente
 * possédée (→ NotFound sinon) ; à l'ajout, le **technicien** doit aussi appartenir au tenant
 * (→ Forbidden sinon, parité « Technicien non autorisé »). `artisanId` forcé serveur par le repo.
 */

// Membres d'équipe d'une intervention (ownership de l'intervention requis → 404 sinon).
export async function getEquipeIntervention(
  repo: IInterventionRepository,
  ctx: TenantContext,
  interventionId: number,
): Promise<EquipeMembre[]> {
  if (!(await repo.getById(ctx, interventionId))) throw new NotFoundError("Intervention introuvable");
  return repo.listEquipe(ctx, interventionId);
}

// Toutes les équipes du tenant (1 requête). Lecture scopée — pas d'ownership ponctuel.
export function getEquipesArtisan(repo: IInterventionRepository, ctx: TenantContext): Promise<EquipeMembreArtisan[]> {
  return repo.listEquipesArtisan(ctx);
}

// Ajoute un membre : intervention possédée (404) + technicien du tenant (403) ; idempotent.
export async function ajouterMembreEquipe(
  repo: IInterventionRepository,
  ctx: TenantContext,
  input: { interventionId: number; technicienId: number; role?: string | null },
): Promise<EquipeMembre> {
  if (!(await repo.getById(ctx, input.interventionId))) throw new NotFoundError("Intervention introuvable");
  if (!(await repo.ownsRef(ctx, "technicien", input.technicienId))) throw new ForbiddenError("Technicien non autorisé");
  return repo.addMembreEquipe(ctx, { interventionId: input.interventionId, technicienId: input.technicienId, role: input.role ?? null });
}

// Retire un membre par id de liaison (scopé tenant ; idempotent — no-op si absent/hors tenant).
export async function retirerMembreEquipe(repo: IInterventionRepository, ctx: TenantContext, id: number): Promise<void> {
  await repo.removeMembreEquipe(ctx, id);
}

/*
 * ── Couleurs calendrier (préférence d'affichage par artisan) ──────────────────────────────────
 * Carte `{ interventionId: couleur }` des interventions du tenant (parité legacy `getCouleursCalendrier`).
 */
export async function getCouleursCalendrier(repo: IInterventionRepository, ctx: TenantContext): Promise<Record<number, string>> {
  const rows = await repo.listCouleurs(ctx);
  const map: Record<number, string> = {};
  for (const r of rows) map[r.interventionId] = r.couleur;
  return map;
}

/*
 * Définit la couleur d'affichage d'une intervention (upsert scopé tenant). Métadonnée d'affichage
 * (clé `couleurs_interventions` par [artisanId, interventionId]) — pas de fuite cross-tenant.
 */
export async function definirCouleurIntervention(
  repo: IInterventionRepository,
  ctx: TenantContext,
  interventionId: number,
  couleur: string,
): Promise<void> {
  await repo.setCouleur(ctx, interventionId, couleur);
}
