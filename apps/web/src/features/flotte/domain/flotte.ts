import type { RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAINE de la feature `flotte` (vue d'ensemble du parc de véhicules) (clean-archi) : types
 * dérivés des sorties du routeur tRPC + règles PURES testables sans réseau ni i18n.
 */

export type FlotteStats = RouterOutputs["vehicules"]["getStatistiquesFlotte"];
export type Vehicule = RouterOutputs["vehicules"]["list"][number];
export type EntretienAVenir = RouterOutputs["vehicules"]["getEntretiensAVenir"][number];
export type AssuranceExpirant = RouterOutputs["vehicules"]["getAssurancesExpirant"][number];

/*
 * Nombre de jours (entiers, arrondi sup) jusqu'à une date — négatif si passée, null si absente. PUR,
 * `now` injectable pour des tests déterministes.
 */
export function daysUntil(dateStr: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!dateStr) return null;
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}

/** Entretiens EN RETARD (date prochaine passée). PUR. */
export function entretiensEnRetard(
  entretiens: readonly EntretienAVenir[],
  now: Date = new Date(),
): EntretienAVenir[] {
  return entretiens.filter((e) => {
    const d = daysUntil(e.prochainEntretienDate, now);
    return d !== null && d < 0;
  });
}

/** Assurances expirant sous 30 jours (incluant déjà expirées). PUR. */
export function assurances30j(
  assurances: readonly AssuranceExpirant[],
  now: Date = new Date(),
): AssuranceExpirant[] {
  return assurances.filter((a) => {
    const d = daysUntil(a.dateFin, now);
    return d !== null && d <= 30;
  });
}

/** Index PUR vehiculeId → 1re ligne (équivaut au `.find` du legacy : garde la première occurrence). */
export function indexByVehiculeId<T extends { vehiculeId: number }>(rows: readonly T[]): Map<number, T> {
  const map = new Map<number, T>();
  for (const r of rows) if (!map.has(r.vehiculeId)) map.set(r.vehiculeId, r);
  return map;
}

/*
 * Index PUR id → véhicule. Sert à résoudre marque/modèle/immatriculation dans les alertes : les DTO
 * `EntretienAVenir`/`AssuranceExpirant` n'exposent PAS ces champs (le legacy les lisait via `any` →
 * libellés véhicule VIDES dans les alertes). On les résout depuis la liste des véhicules.
 */
export function indexVehiculesById(vehicules: readonly Vehicule[]): Map<number, Vehicule> {
  return new Map(vehicules.map((v) => [v.id, v]));
}
