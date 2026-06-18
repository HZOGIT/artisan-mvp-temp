import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `badges` (gamification techniciens). Types dérivés du routeur tRPC,
// règles pures testables (médaille de rang, % de progression, méta catégorie). 0 dépendance React/tRPC.

export type Badge = RouterOutputs["badges"]["list"][number];
export type ClassementEntry = RouterOutputs["badges"]["getClassement"][number];
export type Technicien = RouterOutputs["techniciens"]["getAll"][number];
export type Periode = RouterInputs["badges"]["getClassement"]["periode"];
export type BadgeForm = RouterInputs["badges"]["create"];

export const PERIODES: readonly Periode[] = ["semaine", "mois", "trimestre", "annee"];
export const ICONES = ["trophy", "star", "medal", "crown", "award"] as const;
export const CATEGORIES = ["interventions", "avis", "ca", "anciennete", "special"] as const;

// Classe de couleur de la pastille d'une catégorie de badge (libellé i18n `categorieBadge.<cat>`). PUR.
export function categorieClass(categorie: string): string {
  switch (categorie) {
    case "interventions": return "bg-blue-500";
    case "avis": return "bg-green-500";
    case "ca": return "bg-purple-500";
    case "anciennete": return "bg-orange-500";
    case "special": return "bg-pink-500";
    default: return "";
  }
}

// Médaille (emoji) du rang 0/1/2, sinon `null` (le rang numérique est affiché à la place). PUR.
export function rankMedal(index: number): string | null {
  return ["🥇", "🥈", "🥉"][index] ?? null;
}

// % de progression d'une entrée de classement vs le meilleur total (borné 0..100). PUR.
export function progressPct(points: number, maxPoints: number): number {
  if (maxPoints <= 0) return 0;
  return Math.max(0, Math.min(100, (points / maxPoints) * 100));
}

// Total max de points du classement (référence des barres de progression). PUR.
export function maxPoints(classement: readonly ClassementEntry[]): number {
  return classement[0]?.pointsTotal || 1;
}

// Libellé d'affichage d'un technicien (prénom + nom, repli « Technicien »). PUR.
export function technicienLabel(tech: Pick<Technicien, "prenom" | "nom"> | undefined): string {
  return tech ? `${tech.prenom} ${tech.nom}` : "Technicien";
}
