import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAIN de la feature `commande-form` (création/édition d'un bon de commande fournisseur). Types
 * dérivés du routeur, recherche/mapping d'articles + totaux + payloads PURS testables. 0 React/tRPC.
 */

export type Fournisseur = RouterOutputs["fournisseurs"]["list"][number];
export type ArtisanArticle = RouterOutputs["articles"]["getArtisanArticles"][number];
export type DevisAccepte = RouterOutputs["commandesFournisseurs"]["listDevisAcceptes"][number];
export type IAProposition = RouterOutputs["commandesFournisseurs"]["genererDepuisDevisIA"];
export type Commande = NonNullable<RouterOutputs["commandesFournisseurs"]["getById"]>;
export type CommandeLigne = RouterOutputs["commandesFournisseurs"]["getLignes"][number];
export type CreateInput = RouterInputs["commandesFournisseurs"]["create"];
export type UpdateInput = RouterInputs["commandesFournisseurs"]["update"];

/** Article du catalogue bibliothèque partagée (`articles.search` tRPC, camelCase, sous-ensemble). */
export type BiblioArticle = { id: number; nom: string; unite: string | null; prixBase: string | null };

export type LigneCommande = { id: string; articleId?: number | null; stockId?: number; designation: string; reference?: string; quantite: number; unite: string; prixUnitaire?: number; tauxTVA: number };
export type SearchResult = { id: number | string; type: "artisan" | "bibliotheque"; nom: string; reference: string; unite: string; prixAchat?: number; prixVente?: number };

export type CommandeForm = { fournisseurId: number; dateLivraisonPrevue: string; adresseLivraison: string; notes: string };
export function defaultCommandeForm(): CommandeForm { return { fournisseurId: 0, dateLivraisonPrevue: "", adresseLivraison: "", notes: "" }; }

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number.isFinite(value) ? value : 0);
}

export function emptyLigne(): LigneCommande {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, designation: "", quantite: 1, unite: "unité", tauxTVA: 20 };
}

/** Totaux HT/TVA/TTC. PUR. */
export function totals(lignes: readonly LigneCommande[]): { totalHT: number; totalTVA: number; totalTTC: number } {
  const totalHT = lignes.reduce((s, l) => s + l.quantite * (l.prixUnitaire || 0), 0);
  const totalTVA = lignes.reduce((s, l) => s + l.quantite * (l.prixUnitaire || 0) * (l.tauxTVA / 100), 0);
  return { totalHT, totalTVA, totalTTC: totalHT + totalTVA };
}

/** Recherche locale dans les articles de l'artisan (accent-insensible, matchSearch injecté). PUR. */
export function mapArtisanArticles(articles: readonly ArtisanArticle[], query: string, matchSearch: (v: string | null | undefined, q: string) => boolean): SearchResult[] {
  return articles
    .filter((a) => matchSearch(a.designation, query) || matchSearch(a.reference, query))
    .slice(0, 5)
    .map((a) => ({ id: a.id, type: "artisan", nom: a.designation, reference: a.reference ?? "", unite: a.unite || "unité", prixAchat: undefined, prixVente: a.prixUnitaireHT ? parseFloat(a.prixUnitaireHT) : undefined }));
}

/** Mappe les résultats de la bibliothèque (REST). PUR. */
export function mapBiblioResults(data: readonly BiblioArticle[]): SearchResult[] {
  return data.slice(0, 5).map((a) => ({ id: `biblio-${a.id}`, type: "bibliotheque", nom: a.nom, reference: "", unite: a.unite || "unité", prixAchat: undefined, prixVente: a.prixBase ? parseFloat(a.prixBase) : undefined }));
}

/** Applique un article sélectionné à une ligne (prix d'achat uniquement, jamais le prix de vente). PUR. */
export function ligneFromSearchResult(ligne: LigneCommande, article: SearchResult): LigneCommande {
  return { ...ligne, articleId: article.type === "artisan" && typeof article.id === "number" ? article.id : null, designation: article.nom, reference: article.reference || "", unite: article.unite || "unité", prixUnitaire: article.prixAchat || undefined };
}

/** Mappe les lignes IA (génération depuis un devis accepté) → lignes de formulaire. PUR. */
export function mapIaLignes(proposition: IAProposition): LigneCommande[] {
  return proposition.lignes.map((l, idx) => ({ id: `${Date.now()}-${idx}`, articleId: l.articleId ?? null, designation: l.designation, reference: l.reference || "", quantite: Number(l.quantite) || 1, unite: l.unite || "u", prixUnitaire: Number(l.prixUnitaire) || undefined, tauxTVA: Number(l.tauxTVA) || 20 }));
}

/** Mappe une ligne existante (édition) → ligne de formulaire. PUR. */
export function ligneFromCommande(l: CommandeLigne): LigneCommande {
  return { id: String(l.id), articleId: l.articleId, designation: l.designation, reference: l.reference ?? "", quantite: parseFloat(String(l.quantite)) || 1, unite: l.unite || "unité", prixUnitaire: l.prixUnitaire ? parseFloat(String(l.prixUnitaire)) : undefined, tauxTVA: parseFloat(String(l.tauxTVA)) || 20 };
}

/** Validation → clé d'erreur i18n ou null. PUR. */
export function validateForm(fournisseurId: number, lignes: readonly LigneCommande[]): string | null {
  if (!fournisseurId) return "errFournisseur";
  if (lignes.length === 0) return "errAucuneLigne";
  if (lignes.some((l) => !l.designation.trim())) return "errDesignation";
  return null;
}

const toIso = (d: string): string | undefined => (d ? new Date(d).toISOString() : undefined);

/** Payload de création (lignes incluses). PUR. */
export function buildCreatePayload(form: CommandeForm, lignes: readonly LigneCommande[]): CreateInput {
  return {
    fournisseurId: form.fournisseurId, dateLivraisonPrevue: toIso(form.dateLivraisonPrevue),
    adresseLivraison: form.adresseLivraison || undefined, notes: form.notes || undefined,
    lignes: lignes.map((l) => ({ articleId: l.articleId ?? null, designation: l.designation, reference: l.reference || null, quantite: l.quantite, unite: l.unite, prixUnitaire: l.prixUnitaire ?? undefined, tauxTVA: l.tauxTVA })),
  };
}

/*
 * ⚠️ Payload de MISE À JOUR : le backend `update` n'accepte QUE les métadonnées (ni `lignes` ni
 * `fournisseurId`) — les lignes/fournisseur sont figés après création (pas d'endpoint de mutation de ligne). PUR.
 */
export function buildUpdatePayload(id: number, form: CommandeForm): { id: number } & UpdateInput {
  return { id, dateLivraisonPrevue: toIso(form.dateLivraisonPrevue), adresseLivraison: form.adresseLivraison || undefined, notes: form.notes || undefined };
}
