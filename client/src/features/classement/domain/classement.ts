import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `classement` (gamification : podium + tableau + badges/objectifs par
// technicien). Types dérivés du routeur tRPC, règles pures testables. 0 dépendance React/tRPC.

export type Technicien = RouterOutputs["techniciens"]["getAll"][number];
export type ClassementEntry = RouterOutputs["badges"]["getClassement"][number];
export type BadgeTechnicien = RouterOutputs["badges"]["getBadgesTechnicien"][number];
export type Badge = RouterOutputs["badges"]["list"][number];
export type Objectif = RouterOutputs["badges"]["getObjectifsTechnicien"][number];
export type Periode = RouterInputs["badges"]["getClassement"]["periode"];

// Badge obtenu, enrichi des détails (nom/couleur/points) joints depuis `badges.list` : le new-stack
// `getBadgesTechnicien` ne renvoie que le lien brut (id/badgeId/dateObtention) — jointure côté client.
export type BadgeObtenu = { id: number; nom: string; couleur: string | null; points: number | null; dateObtention: Date };

export function enrichBadgesTechnicien(links: readonly BadgeTechnicien[], badges: readonly Badge[]): BadgeObtenu[] {
  const byId = new Map<number, Badge>(badges.map((b) => [b.id, b]));
  return links.map((l) => {
    const b = byId.get(l.badgeId);
    return { id: l.id, nom: b?.nom ?? "", couleur: b?.couleur ?? null, points: b?.points ?? null, dateObtention: l.dateObtention };
  });
}

export type ClassementRow = ClassementEntry & { technicien: Technicien | undefined };

export const PERIODES: readonly Periode[] = ["semaine", "mois", "trimestre", "annee"];

// Montant formaté en euros (entiers), tolérant string/number/null. PUR.
export function eur(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return (Number.isFinite(v) ? v : 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

// Initiales (prénom+nom), repli « ? ». PUR.
export function initials(tech: Pick<Technicien, "prenom" | "nom"> | undefined): string {
  const p = (tech?.prenom || "").trim();
  const n = (tech?.nom || "").trim();
  return ((p[0] || "") + (n[0] || "")).toUpperCase() || "?";
}

// Nom complet d'un technicien, repli « Tech #<id> ». PUR.
export function technicienName(tech: Pick<Technicien, "prenom" | "nom"> | undefined, technicienId: number): string {
  return tech ? `${tech.prenom || ""} ${tech.nom || ""}`.trim() || `Tech #${technicienId}` : `Tech #${technicienId}`;
}

// Enrichit le classement avec les infos technicien (jointure par id). PUR.
export function buildRanking(classement: readonly ClassementEntry[], techniciens: readonly Technicien[]): ClassementRow[] {
  const byId = new Map<number, Technicien>(techniciens.map((t) => [t.id, t]));
  return classement.map((c) => ({ ...c, technicien: byId.get(c.technicienId) }));
}

// Sépare le podium (3 premiers) du reste. PUR.
export function splitPodium(ranking: readonly ClassementRow[]): { top3: ClassementRow[]; rest: ClassementRow[] } {
  return { top3: ranking.slice(0, 3), rest: ranking.slice(3) };
}

// % d'atteinte d'un objectif (réalisé / cible), borné 0..100, 0 si cible nulle. PUR.
export function objectifPct(realise: number | string | null | undefined, objectif: number | string | null | undefined): number {
  const cible = Number(objectif || 0);
  if (cible <= 0) return 0;
  return Math.min(100, Math.round((Number(realise || 0) / cible) * 100));
}
