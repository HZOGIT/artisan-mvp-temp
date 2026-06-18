import { format } from "date-fns";
import type { Locale } from "date-fns";
import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `notes-frais` (clean-archi) : types dérivés du routeur (le backend
// expose enfin `depenses[]`/`nbDepenses` — OPE-490, donc 0 `any`) + helpers PURS (formatage, timeline
// workflow, filtrage des dépenses brouillon ajoutables). Aucune dépendance React/tRPC.

export type NoteFrais = RouterOutputs["depenses"]["listNotesFrais"][number]; // + nbDepenses
export type NoteFraisDetail = NonNullable<RouterOutputs["depenses"]["getNoteFraisById"]>; // + depenses[]
export type NoteFraisDepense = NoteFraisDetail["depenses"][number];
export type DepenseBrouillon = RouterOutputs["depenses"]["list"][number];
export type NoteStatut = NoteFrais["statut"];

// Étapes du workflow (la timeline visuelle ; `rejetee` est un état terminal hors timeline).
export const TIMELINE = ["brouillon", "soumise", "approuvee", "payee"] as const;

// Montant € (parité legacy : string|number|null → "x,xx €", 0 si invalide). PUR.
export function eur(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : Number(n ?? 0);
  return (Number.isNaN(v) ? 0 : v).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

// Format de date SÛR (ne jette jamais : date nulle/invalide → "—"). PUR.
export function fmtDate(value: string | number | Date | null | undefined, pattern: string, opts?: { locale?: Locale }): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, pattern, opts);
}

// Étape de timeline atteinte ? (l'index du statut courant ≥ celui de l'étape, ou note rejetée). PUR.
export function etapeReached(statut: string, index: number): boolean {
  return (TIMELINE as readonly string[]).indexOf(statut) >= index || statut === "rejetee";
}

// `depenses.list` (new-stack) n'a pas de filtre statut → on filtre les brouillons côté front
// (parité legacy qui passait `{ statut: "brouillon" }`). PUR.
export function filterBrouillon(depenses: readonly DepenseBrouillon[]): DepenseBrouillon[] {
  return depenses.filter((d) => d.statut === "brouillon");
}

// Dépenses brouillon ajoutables = celles PAS déjà incluses dans la note (limitées à `limit`). PUR.
export function availableBrouillons(
  brouillons: readonly DepenseBrouillon[],
  included: readonly NoteFraisDepense[],
  limit = 10,
): DepenseBrouillon[] {
  return brouillons.filter((d) => !included.some((dd) => dd.id === d.id)).slice(0, limit);
}
