/**
 * Référentiel légal des catégories de TVA françaises (France métropolitaine).
 * Source : CGI art. 278–293 B. Non tenant-specific — référentiel légal immuable.
 */

export const TVA_CATEGORIE_IDS = [
  "FR_20",
  "FR_10",
  "FR_5_5",
  "FR_2_1",
  "FR_FRANCHISE",
  "FR_EXONERE",
  "FR_AUTO",
] as const;

export type TvaCategorieId = (typeof TVA_CATEGORIE_IDS)[number];

export interface TvaCategorieDef {
  readonly id: TvaCategorieId;
  readonly taux: string;
  readonly label: string;
  readonly mentionLegale: string | null;
  readonly codeFacturX: string;
  readonly compteCollecte: string | null;
  readonly ordre: number;
}

export const TVA_CATEGORIES: readonly TvaCategorieDef[] = [
  { id: "FR_20",        taux: "20",  label: "20 % — Taux normal",            mentionLegale: null,                                    codeFacturX: "S",  compteCollecte: "44571", ordre: 1 },
  { id: "FR_10",        taux: "10",  label: "10 % — Taux intermédiaire",      mentionLegale: null,                                    codeFacturX: "S",  compteCollecte: "44572", ordre: 2 },
  { id: "FR_5_5",       taux: "5.5", label: "5,5 % — Rénovation énergétique", mentionLegale: null,                                    codeFacturX: "S",  compteCollecte: "44573", ordre: 3 },
  { id: "FR_2_1",       taux: "2.1", label: "2,1 % — Taux particulier",       mentionLegale: null,                                    codeFacturX: "S",  compteCollecte: "44574", ordre: 4 },
  { id: "FR_FRANCHISE", taux: "0",   label: "0 % — Franchise en base",        mentionLegale: "TVA non applicable, art. 293 B du CGI", codeFacturX: "E",  compteCollecte: null,    ordre: 5 },
  { id: "FR_EXONERE",   taux: "0",   label: "0 % — Exonéré",                  mentionLegale: null,                                    codeFacturX: "E",  compteCollecte: null,    ordre: 6 },
  { id: "FR_AUTO",      taux: "0",   label: "0 % — Autoliquidation",           mentionLegale: "Autoliquidation",                       codeFacturX: "AE", compteCollecte: null,    ordre: 7 },
];

export const TVA_CATEGORIES_MAP = Object.fromEntries(
  TVA_CATEGORIES.map((c) => [c.id, c]),
) as Record<TvaCategorieId, TvaCategorieDef>;

export const TAUX_TVA_LEGAUX = new Set(TVA_CATEGORIES.map((c) => parseFloat(c.taux)));

export function tauxStringToCategorie(taux: string | number | null | undefined): TvaCategorieId {
  const n = parseFloat(String(taux ?? 0));
  if (n >= 20) return "FR_20";
  if (n >= 10) return "FR_10";
  if (n >= 5.5) return "FR_5_5";
  if (n >= 2.1) return "FR_2_1";
  if (n > 0) return "FR_5_5";
  return "FR_EXONERE";
}
