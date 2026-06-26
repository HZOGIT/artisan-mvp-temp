import type { RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAIN de la feature `ma-vitrine` (page publique + avis clients). Types dérivés du routeur,
 * règles pures testables (services, URL publique, statut d'avis, date). 0 dépendance React/tRPC.
 */

/** Les champs vitrine vivent dans le module `vitrine`, pas `parametres`. */
export type VitrineSettings = RouterOutputs["vitrine"]["getSettings"];
export type ArtisanProfile = RouterOutputs["artisan"]["getProfile"];
export type Avis = RouterOutputs["avis"]["getAll"][number];
export type ClientItem = RouterOutputs["clients"]["list"][number];

export type VitrineForm = {
  vitrineActive: boolean; vitrineDescription: string; vitrineZone: string;
  vitrineServices: string; vitrineExperience: string; slug: string;
};

/** Services stockés en JSON (tableau) → texte multi-lignes pour le formulaire ; repli sur la valeur brute. PUR. */
export function parseServices(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.join("\n") : raw;
  } catch {
    return raw;
  }
}

/** URL publique de la vitrine (vide si pas de slug). PUR. */
export function buildVitrineUrl(origin: string, slug: string): string {
  return slug ? `${origin}/vitrine/${slug}` : "";
}

/** Classe de fond de la pastille de statut d'un avis (null = variante secondary). PUR. */
export function avisStatutClass(statut: string): string | null {
  if (statut === "publie") return "bg-green-500";
  if (statut === "masque") return null;
  return "bg-orange-500";
}
export function avisStatutIsSecondary(statut: string): boolean {
  return statut === "masque";
}

/** Date longue FR. PUR. */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
