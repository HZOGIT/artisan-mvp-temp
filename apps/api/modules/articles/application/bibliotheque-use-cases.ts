import { NotFoundError } from "../../../shared/errors";
import type { BibliothequeReader, BibliothequeArticle, BibliothequeFiltre } from "./bibliotheque-reader";
import type { BibliothequeWriter, CreateBibliothequeInput, UpdateBibliothequeInput } from "./bibliotheque-writer";

/*
 * Use-cases du catalogue partagé. Lecture publique (read) ; écriture réservée admin (write — la
 * garde admin est portée par la procédure tRPC, pas ici). Aucun scope tenant (référentiel commun).
 * Parité legacy `articles.getBibliotheque`/`search`/`create`/`update`/`delete`/`importBibliothequeArticles`.
 */

export async function getBibliotheque(reader: BibliothequeReader, filtre?: BibliothequeFiltre): Promise<BibliothequeArticle[]> {
  return reader.list(filtre);
}

/*
 * Recherche plein-texte. `query` vide/blanc → liste filtrée par métier seul (le reader gère le
 * ILIKE %%, qui matche tout) ; on délègue au reader (limit 50 côté infra).
 */
export async function rechercherBibliotheque(reader: BibliothequeReader, query: string, metier?: string): Promise<BibliothequeArticle[]> {
  return reader.search(query, metier);
}

export async function creerArticleBibliotheque(writer: BibliothequeWriter, input: CreateBibliothequeInput): Promise<BibliothequeArticle> {
  return writer.create(input);
}

export async function modifierArticleBibliotheque(writer: BibliothequeWriter, id: number, input: UpdateBibliothequeInput): Promise<BibliothequeArticle> {
  const updated = await writer.update(id, input);
  if (!updated) throw new NotFoundError("Article de bibliothèque introuvable");
  return updated;
}

export async function supprimerArticleBibliotheque(writer: BibliothequeWriter, id: number): Promise<void> {
  await writer.delete(id);
}

export async function importerArticlesBibliotheque(writer: BibliothequeWriter, inputs: CreateBibliothequeInput[]): Promise<{ imported: number }> {
  const imported = await writer.importMany(inputs);
  return { imported };
}
