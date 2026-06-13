import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ITechnicienRepository } from "./technicien-repository";
import type { Technicien } from "../domain/technicien";
import type { Disponibilite } from "../domain/disponibilite";
import type { Position } from "../domain/position";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté
// par le `TenantContext` (le repo l'applique). `getTechnicien` sur une ressource d'un
// autre tenant → le repo renvoie null → NotFoundError (ne révèle pas l'existence).

export function listTechniciens(repo: ITechnicienRepository, ctx: TenantContext): Promise<Technicien[]> {
  return repo.list(ctx);
}

export async function getTechnicien(repo: ITechnicienRepository, ctx: TenantContext, id: number): Promise<Technicien> {
  const technicien = await repo.getById(ctx, id);
  if (!technicien) throw new NotFoundError("Technicien introuvable");
  return technicien;
}

// Disponibilités d'un technicien — [] si le technicien n'appartient pas au tenant
// (lecture sans oracle, anti-IDOR).
export function listDisponibilites(
  repo: ITechnicienRepository,
  ctx: TenantContext,
  technicienId: number,
): Promise<Disponibilite[]> {
  return repo.listDisponibilites(ctx, technicienId);
}

// Dernière position GPS d'un technicien — null si technicien hors tenant ou aucune
// position (lecture sans oracle, anti-IDOR géoloc).
export function getDernierePosition(
  repo: ITechnicienRepository,
  ctx: TenantContext,
  technicienId: number,
): Promise<Position | null> {
  return repo.getDernierePosition(ctx, technicienId);
}
