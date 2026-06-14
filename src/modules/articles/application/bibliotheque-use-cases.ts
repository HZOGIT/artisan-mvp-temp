import type { BibliothequeReader, BibliothequeArticle, BibliothequeFiltre } from "./bibliotheque-reader";

// Use-cases du catalogue partagé (lecture publique). Volontairement minces : aucun scope tenant
// (référentiel commun). Parité legacy `articles.getBibliotheque` / `articles.search`.

export async function getBibliotheque(reader: BibliothequeReader, filtre?: BibliothequeFiltre): Promise<BibliothequeArticle[]> {
  return reader.list(filtre);
}

// Recherche plein-texte. `query` vide/blanc → liste filtrée par métier seul (le reader gère le
// ILIKE %%, qui matche tout) ; on délègue au reader (limit 50 côté infra).
export async function rechercherBibliotheque(reader: BibliothequeReader, query: string, metier?: string): Promise<BibliothequeArticle[]> {
  return reader.search(query, metier);
}
