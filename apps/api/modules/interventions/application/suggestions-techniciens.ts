import type { TenantContext } from "../../../shared/tenant";
import type { IInterventionRepository } from "./intervention-repository";
import type { ITechnicienRepository } from "../../techniciens/application/technicien-repository";

/*
 * Suggestion de technicien pour une intervention géolocalisée (parité legacy
 * `getSuggestionsTechniciens`). ⚠️ GÉO/RGPD : les positions des techniciens sont des données
 * sensibles — l'accès passe par `technicienRepo.getDernierePosition` (scopé tenant : un artisan ne
 * voit JAMAIS les positions des techniciens d'un autre tenant). Le tri par proximité + disponibilité
 * reste une logique PURE et testable.
 */

export interface SuggestionInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly dateIntervention: Date;
}

export interface SuggestionTechnicien {
  readonly technicien: { readonly id: number; readonly nom: string; readonly couleur: string | null; readonly specialite: string | null };
  /** km (arrondi 0,1) */
  readonly distance: number;
  /** minutes estimées (~40 km/h) */
  readonly tempsTrajet: number;
  readonly disponible: boolean;
  readonly position: { readonly latitude: string; readonly longitude: string } | null;
  readonly score: number;
}

/** Distance haversine (km) entre deux points GPS. Pur. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getSuggestionsTechniciens(
  interventionRepo: IInterventionRepository,
  technicienRepo: ITechnicienRepository,
  ctx: TenantContext,
  input: SuggestionInput,
): Promise<SuggestionTechnicien[]> {
  const techs = (await technicienRepo.list(ctx)).filter((t) => t.statut === "actif");
  if (techs.length === 0) return [];

  /** Interventions du jour (disponibilité : conflit si autre intervention du technicien à ±2h). */
  const dayStart = new Date(input.dateIntervention);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(input.dateIntervention);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const [dayInterventions, positions] = await Promise.all([
    interventionRepo.listJour(ctx, dayStart, dayEnd),
    technicienRepo.getDernierePositionBatch(ctx, techs.map((t) => t.id)),
  ]);

  const targetHour = input.dateIntervention.getUTCHours();
  const suggestions = techs.map((tech) => {
    const busy = dayInterventions.some((i) => i.technicienId === tech.id && Math.abs(i.dateDebut.getUTCHours() - targetHour) < 2);
    const position = positions.get(tech.id) ?? null;
    let distance = 0;
    let tempsTrajet = 0;
    if (position) {
      distance = haversineKm(Number(position.latitude), Number(position.longitude), input.latitude, input.longitude);
      tempsTrajet = Math.round((distance / 40) * 60);
    }
    const score = (busy ? 0 : 50) + Math.max(0, 50 - distance);
    return {
      technicien: { id: tech.id, nom: `${tech.prenom ?? ""} ${tech.nom}`.trim(), couleur: tech.couleur, specialite: tech.specialite },
      distance: Math.round(distance * 10) / 10,
      tempsTrajet,
      disponible: !busy,
      position: position ? { latitude: position.latitude, longitude: position.longitude } : null,
      score,
    };
  });

  return suggestions.sort((a, b) => b.score - a.score);
}
