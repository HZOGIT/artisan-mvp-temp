import type { RouterInputs, RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `devis-ligne` (ajout d'une ligne à un devis : produit/section/note, recherche
// bibliothèque + suggestions IA). Types dérivés du routeur, unification d'articles + calculs PURS testables.

export type Devis = NonNullable<RouterOutputs["devis"]["getById"]>;
export type BiblioArticle = RouterOutputs["articles"]["getBibliotheque"][number];
export type Suggestion = RouterOutputs["articles"]["suggererArticlesIA"][number];
export type AddLigneInput = RouterInputs["devis"]["addLigne"];
export type LigneType = "produit" | "section" | "note";

export type LigneForm = { reference: string; designation: string; description: string; quantite: string; unite: string; prixUnitaireHT: string; tauxTVA: string };

export function defaultLigneForm(): LigneForm {
  return { reference: "", designation: "", description: "", quantite: "1", unite: "unité", prixUnitaireHT: "", tauxTVA: "20" };
}

export function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "0,00 €";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
}

// ⚠️ La bibliothèque expose `nom`/`prixBase`/`sousCategorie`/`tauxTVA` (le legacy lisait `prix_base`/
// `sous_categorie` en snake_case → toujours undefined → prix & réf manquants). Helpers d'accès typés :
export const articleDesignation = (a: BiblioArticle): string => a.nom;
export const articlePrix = (a: BiblioArticle): string => String(a.prixBase ?? "");
export const articleRef = (a: BiblioArticle): string => a.sousCategorie ?? "";
export const articleTauxTVA = (a: BiblioArticle): string => (a.tauxTVA != null && a.tauxTVA !== "" ? String(parseFloat(a.tauxTVA)) : "20");

// Filtre les articles (accent-insensible) sur réf/nom/description/catégorie. PUR (matchSearch injecté).
export function filterArticles(articles: readonly BiblioArticle[], query: string, matchSearch: (v: string | null | undefined, q: string) => boolean): BiblioArticle[] {
  if (!query) return articles.slice(0, 100);
  return articles.filter((a) => matchSearch(a.sousCategorie, query) || matchSearch(a.nom, query) || matchSearch(a.description, query) || matchSearch(a.categorie, query)).slice(0, 100);
}

// Groupe les articles par catégorie. PUR.
export function groupByCategorie(articles: readonly BiblioArticle[]): Record<string, BiblioArticle[]> {
  const groups: Record<string, BiblioArticle[]> = {};
  for (const a of articles) { const c = a.categorie || "Autres"; (groups[c] ||= []).push(a); }
  return groups;
}

// Totaux d'une ligne produit. PUR.
export function lineTotals(form: LigneForm): { totalHT: number; totalTVA: number; totalTTC: number; tauxTVA: number } {
  const q = parseFloat(form.quantite) || 0;
  const pu = parseFloat(form.prixUnitaireHT) || 0;
  const taux = parseFloat(form.tauxTVA) || 0;
  const totalHT = q * pu;
  const totalTVA = totalHT * (taux / 100);
  return { totalHT, totalTVA, totalTTC: totalHT + totalTVA, tauxTVA: taux };
}

// Pré-remplit le formulaire depuis un article bibliothèque. PUR.
export function formFromArticle(a: BiblioArticle): LigneForm {
  return { reference: articleRef(a), designation: articleDesignation(a), description: a.description || "", quantite: "1", unite: a.unite || "unité", prixUnitaireHT: articlePrix(a), tauxTVA: articleTauxTVA(a) };
}

// Pré-remplit le formulaire depuis une suggestion IA. PUR.
export function formFromSuggestion(s: Suggestion): LigneForm {
  return { reference: s.reference || "", designation: s.designation || "", description: s.description || "", quantite: "1", unite: s.unite || "unité", prixUnitaireHT: String(s.prixUnitaire ?? ""), tauxTVA: "20" };
}

// Construit le payload addLigne. Pour section/note : seule la désignation + prix 0 (hors totaux serveur). PUR.
export function buildAddLignePayload(devisId: number, form: LigneForm, type: LigneType): AddLigneInput {
  if (type === "section" || type === "note") {
    return { devisId, designation: form.designation, prixUnitaireHT: "0", type };
  }
  return {
    devisId, reference: form.reference, designation: form.designation, description: form.description,
    quantite: String(parseFloat(form.quantite) || 1), unite: form.unite,
    prixUnitaireHT: String(parseFloat(form.prixUnitaireHT) || 0), tauxTVA: String(parseFloat(form.tauxTVA) || 20), type: "produit",
  };
}
