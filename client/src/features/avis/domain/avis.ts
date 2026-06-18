import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAINE de la feature `avis` (avis clients) (clean-archi) : types dérivés des sorties du routeur
// tRPC + règles PURES testables sans réseau ni i18n.

export type Avis = RouterOutputs["avis"]["getAll"][number];
export type AvisStats = RouterOutputs["avis"]["getStats"];

export type AvisStatutKind = "publie" | "masque" | "en_attente" | "other";

// Catégorie PURE d'un statut d'avis (l'UI mappe vers badge + libellé i18n).
export function avisStatutKind(statut: string | null): AvisStatutKind {
  return statut === "publie" || statut === "masque" || statut === "en_attente" ? statut : "other";
}

// % PUR d'une note dans la distribution (0 si total nul).
export function distributionPercent(count: number, total: number): number {
  return total ? (count / total) * 100 : 0;
}

// Statut de modération suivant (toggle publié <-> masqué). PUR.
export function nextModerationStatut(statut: string | null): "publie" | "masque" {
  return statut === "publie" ? "masque" : "publie";
}

// Un avis peut-il encore recevoir une réponse de l'artisan ? PUR.
export function canReply(avis: Pick<Avis, "reponseArtisan">): boolean {
  return !avis.reponseArtisan;
}
