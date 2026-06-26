import type { RouterInputs, RouterOutputs } from "@/shared/trpc";
import { TVA_CATEGORIES_MAP, type TvaCategorieId } from "@/shared/tva/taux-tva-fr";

/*
 * Couche DOMAIN de la feature `devis-nouveau` (création d'un devis : client, lignes, modèles, génération IA).
 * Types dérivés du routeur, calculs + mappings PURS testables. 0 React/tRPC.
 */

export type Client = RouterOutputs["clients"]["list"][number];
export type Encours = NonNullable<RouterOutputs["clients"]["getEncours"]>;
export type Modele = RouterOutputs["devis"]["getModeles"][number];
export type IAProposition = RouterOutputs["devis"]["genererLignesIA"];
export type IALigne = IAProposition["lignes"][number];
export type CreateDevisInput = RouterInputs["devis"]["create"];
export type AddLigneInput = RouterInputs["devis"]["addLigne"];
export type AddLigneModeleInput = RouterInputs["devis"]["addLigneToModele"];

/** Article renvoyé par `articles.search` (tRPC, camelCase — catalogue bibliothèque partagée). */
export type ArticleSearchResult = RouterOutputs["articles"]["search"][number];

export type LigneDevis = { id: string; description: string; quantite: number; prixUnitaireHT: number; tvaCategorieId: TvaCategorieId; unite: string; remise: number };

export function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "0,00 €";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
}

export function emptyLigne(): LigneDevis {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, description: "", quantite: 1, prixUnitaireHT: 0, tvaCategorieId: "FR_20", unite: "unité", remise: 0 };
}

function tauxStringToCategorie(taux: string | number | null | undefined): TvaCategorieId {
  const n = parseFloat(String(taux ?? "0"));
  if (n >= 20) return "FR_20";
  if (n >= 10) return "FR_10";
  if (n >= 5.5) return "FR_5_5";
  if (n >= 2.1) return "FR_2_1";
  if (n > 0) return "FR_5_5";
  return "FR_EXONERE";
}

/** Totaux du devis. PUR. */
export function totals(lignes: readonly LigneDevis[]): { totalHT: number; tva: number; totalTTC: number } {
  const totalHT = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireHT, 0);
  const tva = lignes.reduce((s, l) => {
    const taux = parseFloat(TVA_CATEGORIES_MAP[l.tvaCategorieId]?.taux ?? "20") || 0;
    return s + l.quantite * l.prixUnitaireHT * (taux / 100);
  }, 0);
  return { totalHT, tva, totalTTC: totalHT + tva };
}

/** Déplace une ligne (haut/bas) → nouveau tableau. PUR. */
export function moveLine(lignes: readonly LigneDevis[], index: number, dir: "up" | "down"): LigneDevis[] {
  const arr = [...lignes];
  const j = dir === "up" ? index - 1 : index + 1;
  if (j < 0 || j >= arr.length) return arr;
  [arr[index], arr[j]] = [arr[j], arr[index]];
  return arr;
}

/** Pré-remplit une ligne depuis un article (TVA de l'article sinon valeur courante). PUR. */
export function ligneFromArticle(ligne: LigneDevis, article: ArticleSearchResult): LigneDevis {
  const tvaCategorieId = article.tauxTVA != null && article.tauxTVA !== "" ? tauxStringToCategorie(article.tauxTVA) : ligne.tvaCategorieId;
  return { ...ligne, description: article.nom, prixUnitaireHT: parseFloat(article.prixBase) || 0, unite: article.unite || "unité", tvaCategorieId };
}

/** Mappe les lignes IA → lignes de formulaire. PUR. */
export function iaToLignes(proposition: IAProposition): LigneDevis[] {
  return proposition.lignes.map((l, i) => ({
    id: `ia-${Date.now()}-${i}`, description: l.designation || "", quantite: Number(l.quantite) || 1,
    prixUnitaireHT: Number(l.prixUnitaire) || 0,
    tvaCategorieId: (l.tvaCategorieId as TvaCategorieId | undefined) ?? tauxStringToCategorie(l.tauxTva),
    unite: l.unite || "u",
    remise: 0,
  }));
}

/** Totaux estimés des lignes IA. PUR. */
export function iaTotals(lignes: readonly IALigne[]): { ht: number; ttc: number } {
  let ht = 0, ttc = 0;
  for (const l of lignes) { const sht = Number(l.quantite || 0) * Number(l.prixUnitaire || 0); ht += sht; ttc += sht * (1 + Number(l.tauxTva || 0) / 100); }
  return { ht, ttc };
}

export function buildCreatePayload(clientId: number, objet: string, referenceClient: string, dateValidite: string, notes: string): CreateDevisInput {
  return { clientId, objet: objet || undefined, referenceClient: referenceClient || undefined, dateValidite, notes };
}

export function buildAddLignePayload(devisId: number, ligne: LigneDevis): AddLigneInput {
  return { devisId, designation: ligne.description, quantite: String(ligne.quantite), prixUnitaireHT: String(ligne.prixUnitaireHT), tvaCategorieId: ligne.tvaCategorieId, remise: ligne.remise };
}

export function buildModeleLignePayload(modeleId: number, ligne: LigneDevis): AddLigneModeleInput {
  const taux = parseFloat(TVA_CATEGORIES_MAP[ligne.tvaCategorieId]?.taux ?? "20") || 20;
  return { modeleId, designation: ligne.description, quantite: ligne.quantite, prixUnitaireHT: ligne.prixUnitaireHT, tauxTVA: taux, remise: ligne.remise, tvaCategorieId: ligne.tvaCategorieId, unite: ligne.unite || "unité" };
}
