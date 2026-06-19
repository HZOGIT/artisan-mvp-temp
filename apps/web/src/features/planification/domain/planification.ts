import type { RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAIN de la feature `planification` (assignation du technicien le plus proche/disponible). Types
 * dérivés du routeur, constructeurs HTML PURS pour les marqueurs Leaflet + règles pures testables.
 */

export type Intervention = RouterOutputs["interventions"]["list"][number];
export type Suggestion = RouterOutputs["interventions"]["getSuggestionsTechniciens"][number];
export type AssignResult = RouterOutputs["interventions"]["assignerTechnicien"];

/** Interventions à planifier (non assignées + statut « planifiee »). PUR. */
export function interventionsNonAssignees(interventions: readonly Intervention[]): Intervention[] {
  return interventions.filter((i) => !i.technicienId && i.statut === "planifiee");
}

/** Comptes de conflits d'une assignation (chevauchement d'interventions / congé approuvé). PUR. */
export function conflictCounts(data: AssignResult): { nbInter: number; nbConge: number } {
  const c = data.conflits;
  return { nbInter: c?.interventions?.length ?? 0, nbConge: c?.conges?.length ?? 0 };
}

/** HTML du marqueur de destination (épingle rouge). PUR. */
export function destMarkerHtml(): string {
  return `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;"><svg width="32" height="32" viewBox="0 0 24 24" fill="#ef4444" stroke="white" stroke-width="1"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg></div>`;
}

/** HTML du marqueur d'un technicien (pastille colorée, bordure verte/rouge selon disponibilité). PUR. */
export function techMarkerHtml(couleur: string, disponible: boolean): string {
  return `<div style="background-color:${couleur};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid ${disponible ? "#22c55e" : "#ef4444"};box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>`;
}

/** HTML du popup d'un technicien (nom, spécialité, distance/temps). `unites` injectées par l'UI. PUR. */
export function techPopupHtml(s: Suggestion, unites: { km: string; min: string }): string {
  return `<strong>${s.technicien.nom}</strong><br/>${s.technicien.specialite || ""}<br/>${s.distance} ${unites.km} - ~${s.tempsTrajet} ${unites.min}`;
}
