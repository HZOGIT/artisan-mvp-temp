import type { RouterInputs, RouterOutputs } from "@/modern/shared/trpc";
import { matchSearch } from "@/lib/normalize";

// Couche DOMAINE de la feature `articles` (bibliothèque) (clean-archi) : types dérivés des sorties du
// routeur tRPC + règles PURES testables sans réseau ni i18n (recherche, marge, parsing CSV d'import).

export type BiblioArticle = RouterOutputs["articles"]["getBibliotheque"][number];
export type ImportRow = RouterInputs["articles"]["importBibliothequeArticles"][number];

const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export interface ArticleFilters {
  searchQuery: string;
  categoryFilter: string;
  metierFilter: string;
}

// Filtrage PUR (recherche nom/description/sous-catégorie + filtres catégorie & métier).
export function filterArticles(list: readonly BiblioArticle[], f: ArticleFilters): BiblioArticle[] {
  return list.filter((article) => {
    const matchesSearch =
      !f.searchQuery ||
      matchSearch(article.nom, f.searchQuery) ||
      matchSearch(article.description, f.searchQuery) ||
      matchSearch(article.sousCategorie, f.searchQuery);
    const matchesCategory = f.categoryFilter === "all" || article.categorie === f.categoryFilter;
    const matchesMetier = f.metierFilter === "all" || article.metier === f.metierFilter;
    return matchesSearch && matchesCategory && matchesMetier;
  });
}

// Valeurs distinctes (catégories / métiers présents) — pour peupler les filtres. PUR.
export function distinctCategories(list: readonly BiblioArticle[]): string[] {
  return Array.from(new Set(list.map((a) => a.categorie).filter((v): v is string => !!v)));
}
export function distinctMetiers(list: readonly BiblioArticle[]): string[] {
  return Array.from(new Set(list.map((a) => a.metier).filter((v): v is string => !!v)));
}

export interface Marge {
  montant: number;
  pct: number;
  positive: boolean;
}

// Marge indicative PURE (null si prix de vente <= 0 ou valeurs non numériques). Mêmes règles que le legacy.
export function computeMarge(prixBase: unknown, prixRevient: unknown): Marge | null {
  const pv = toNum(prixBase);
  const pr = toNum(prixRevient);
  if (pv == null || pr == null || pv <= 0) return null;
  const montant = pv - pr;
  return { montant, pct: Math.round((montant / pv) * 100), positive: montant >= 0 };
}

// Découpe PURE d'une ligne CSV en champs, en gérant les guillemets et les échappements `""` (donc les
// virgules à l'intérieur d'un champ entre guillemets). Produit EXACTEMENT N champs (1 par colonne).
// (Le legacy utilisait un `match` global qui intercalait des chaînes vides → indices valeurs décalés
// vs en-tête `split(",")` → mapping de colonnes cassé à l'import. Corrigé ici.)
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

// Parsing PUR d'un CSV d'import (texte → lignes typées). Détecte les colonnes par mots-clés d'en-tête
// (même découpe pour en-tête ET valeurs → indices alignés), applique les valeurs par défaut.
export function parseImportCsv(text: string): ImportRow[] {
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0] ?? "").map((h) => h.trim().toLowerCase());
  const find = (pred: (h: string) => boolean) => headers.findIndex(pred);
  const idx = {
    nom: find((h) => h.includes("nom") || h.includes("design")),
    desc: find((h) => h.includes("desc")),
    unite: find((h) => h.includes("unit")),
    prix: find((h) => h.includes("prix") || h.includes("ht")),
    cat: find((h) => h.includes("cat") && !h.includes("sous")),
    sous: find((h) => h.includes("sous")),
    metier: find((h) => h.includes("met") || h.includes("mét")),
  };
  return lines
    .slice(1)
    .map((line) => {
      const values = splitCsvLine(line);
      const at = (i: number) => (i >= 0 ? values[i] : undefined);
      return {
        nom: at(idx.nom) || values[0] || "",
        description: at(idx.desc) || "",
        unite: at(idx.unite) || "unité",
        prix_base: at(idx.prix)?.replace(",", ".") || "0",
        categorie: at(idx.cat) || "fourniture",
        sous_categorie: at(idx.sous) || "",
        metier: at(idx.metier) || "plombier",
      };
    })
    .filter((a) => !!a.nom);
}
