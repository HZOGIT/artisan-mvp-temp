import type { RouterOutputs } from "@/shared/trpc";
import { matchSearch } from "@/shared/lib/normalize";

/*
 * Couche DOMAINE de la feature `interventions` (clean-archi) : types dérivés des sorties du routeur
 * tRPC (source de vérité serveur) + règles PURES testables sans réseau ni i18n.
 */

export type Intervention = RouterOutputs["interventions"]["list"][number];
export type InterventionClient = RouterOutputs["clients"]["list"][number];
export type Technicien = RouterOutputs["techniciens"]["getAll"][number];
export type EquipeMembre = RouterOutputs["interventions"]["getEquipe"][number];
export type EquipeByArtisanRow = RouterOutputs["interventions"]["getEquipesByArtisan"][number];

export const STATUT_KEYS = ["planifiee", "en_cours", "terminee", "annulee"] as const;
export type InterventionStatut = (typeof STATUT_KEYS)[number];

/** Garde/normalisation PURE : ramène une chaîne libre vers un statut géré (défaut planifiee). */
export function toInterventionStatut(s: string | null | undefined): InterventionStatut {
  return (STATUT_KEYS as readonly string[]).includes(s ?? "") ? (s as InterventionStatut) : "planifiee";
}

export interface InterventionFilters {
  statusFilter: string;
  searchQuery: string;
}

/** Filtrage PUR (statut + recherche titre/description/adresse). Mêmes règles que le legacy. */
export function filterInterventions(
  list: readonly Intervention[],
  f: InterventionFilters,
): Intervention[] {
  return list.filter((i) => {
    if (f.statusFilter !== "all" && i.statut !== f.statusFilter) return false;
    if (!f.searchQuery) return true;
    return (
      matchSearch(i.titre, f.searchQuery) ||
      matchSearch(i.description, f.searchQuery) ||
      matchSearch(i.adresse, f.searchQuery)
    );
  });
}

/** Index PUR interventionId → membres d'équipe (évite le N+1, 1 requête getEquipesByArtisan). */
export function groupEquipeByIntervention(
  rows: readonly EquipeByArtisanRow[],
): Map<number, EquipeByArtisanRow[]> {
  const map = new Map<number, EquipeByArtisanRow[]>();
  for (const m of rows) {
    const arr = map.get(m.interventionId) ?? [];
    arr.push(m);
    map.set(m.interventionId, arr);
  }
  return map;
}

/** Nom affichable d'un membre/technicien (sans i18n) : "Prénom Nom" ou "" si inconnu (fallback i18n côté UI). */
export function membreName(m: { prenom?: string | null; nom?: string | null }): string {
  return [m.prenom, m.nom].filter(Boolean).join(" ");
}

/** Techniciens encore assignables (pas déjà dans l'équipe). PUR. */
export function availableTechniciens(
  techniciens: readonly Technicien[],
  equipe: readonly EquipeMembre[],
): Technicien[] {
  return techniciens.filter((tech) => !equipe.some((m) => m.technicienId === tech.id));
}

/** Adresse pré-remplie depuis le client choisi ("adresse, CP Ville"), nettoyée. PUR. */
export function buildAdresse(
  client: Pick<InterventionClient, "adresse" | "codePostal" | "ville"> | undefined,
): string {
  if (!client?.adresse) return "";
  return `${client.adresse}, ${client.codePostal || ""} ${client.ville || ""}`.trim().replace(/,\s*$/, "");
}

export function dureeReelleMinutes(i: Intervention): number | null {
  if (!i.heureArrivee || !i.heureDepart) return null;
  const diff = Math.round((new Date(i.heureDepart).getTime() - new Date(i.heureArrivee).getTime()) / 60000);
  return diff >= 0 ? diff : null;
}

/** Descripteur PUR de durée (l'UI choisit la clé i18n). null = pas de durée. */
export type DureeDescriptor =
  | { kind: "none" }
  | { kind: "hm"; h: number; mm: string }
  | { kind: "min"; m: number };

export function dureeDescriptor(min: number | null | undefined): DureeDescriptor {
  if (min == null) return { kind: "none" };
  if (min >= 60) return { kind: "hm", h: Math.floor(min / 60), mm: String(min % 60).padStart(2, "0") };
  return { kind: "min", m: min };
}
