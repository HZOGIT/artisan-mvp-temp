/**
 * Référentiel légal des catégories de TVA françaises (France métropolitaine).
 * Source : CGI art. 278–293 B. Miroir du fichier API — ne pas diverger.
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
  readonly ordre: number;
}

export const TVA_CATEGORIES: readonly TvaCategorieDef[] = [
  { id: "FR_20",        taux: "20",  label: "20 % — Taux normal",            mentionLegale: null,                                    ordre: 1 },
  { id: "FR_10",        taux: "10",  label: "10 % — Taux intermédiaire",      mentionLegale: null,                                    ordre: 2 },
  { id: "FR_5_5",       taux: "5.5", label: "5,5 % — Rénovation énergétique", mentionLegale: null,                                    ordre: 3 },
  { id: "FR_2_1",       taux: "2.1", label: "2,1 % — Taux particulier",       mentionLegale: null,                                    ordre: 4 },
  { id: "FR_FRANCHISE", taux: "0",   label: "0 % — Franchise en base",        mentionLegale: "TVA non applicable, art. 293 B du CGI", ordre: 5 },
  { id: "FR_EXONERE",   taux: "0",   label: "0 % — Exonéré",                  mentionLegale: null,                                    ordre: 6 },
  { id: "FR_AUTO",      taux: "0",   label: "0 % — Autoliquidation",           mentionLegale: "Autoliquidation",                       ordre: 7 },
];

export const TVA_CATEGORIES_MAP = Object.fromEntries(
  TVA_CATEGORIES.map((c) => [c.id, c]),
) as Record<TvaCategorieId, TvaCategorieDef>;
