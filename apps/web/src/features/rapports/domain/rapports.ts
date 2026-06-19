import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAIN de la feature `rapports` (rapports personnalisables). Types dérivés du routeur, règles
 * pures testables (humanisation des colonnes, favoris). 0 dépendance React/tRPC.
 */

export type Rapport = RouterOutputs["rapports"]["list"][number];
/*
 * ⚠️ Le new-stack `executer` renvoie `{ resultats, nombreLignes, tempsExecution }` (pas `colonnes`/`lignes`/
 * `totaux` comme le legacy) → on dérive les colonnes côté client ; les `totaux` (calcul backend legacy)
 * ne sont PAS disponibles (finding backend à combler).
 */
export type ResultatRapport = RouterOutputs["rapports"]["executer"];
export type ResultatLigne = Record<string, unknown>;
export type RapportType = RouterInputs["rapports"]["create"]["type"];
export type RapportFormat = RouterInputs["rapports"]["create"]["format"];
export type GraphiqueType = NonNullable<RouterInputs["rapports"]["create"]["graphiqueType"]>;

export type RapportForm = {
  nom: string; description: string; type: RapportType; format: RapportFormat;
  graphiqueType: GraphiqueType; dateDebut: string; dateFin: string;
};

/** Types/formats proposés à l'UI (libellés + icônes résolus côté UI). Parité legacy (6 types affichés). */
export const TYPE_VALUES = ["ventes", "clients", "interventions", "stocks", "techniciens", "financier"] as const;
export const FORMAT_VALUES = ["tableau", "graphique", "liste"] as const;
export const GRAPHIQUE_VALUES = ["bar", "line", "pie", "doughnut"] as const;

export const EMPTY_FORM: RapportForm = {
  nom: "", description: "", type: "ventes", format: "tableau", graphiqueType: "bar", dateDebut: "", dateFin: "",
};

/** Humanise un nom de colonne camelCase (« montantTTC » → « montant TTC »). PUR. */
export function humanizeColumn(col: string): string {
  return col.replace(/([A-Z])/g, " $1").trim();
}

/** Rapports favoris. PUR. */
export function favoris(rapports: readonly Rapport[]): Rapport[] {
  return rapports.filter((r) => r.favori);
}

/** Colonnes dérivées des résultats (clés de la 1re ligne) — le new-stack ne renvoie pas `colonnes`. PUR. */
export function deriveColonnes(resultats: readonly unknown[]): string[] {
  const first = resultats[0];
  return first && typeof first === "object" ? Object.keys(first as Record<string, unknown>) : [];
}

/** Rendu d'une cellule de résultat (Date → JJ/MM/AAAA, nombre formaté, sinon texte / « - »). PUR. */
export function formatCell(value: unknown): string {
  if (value instanceof Date) return value.toLocaleDateString("fr-FR");
  if (typeof value === "number") return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return String(value ?? "-");
}
