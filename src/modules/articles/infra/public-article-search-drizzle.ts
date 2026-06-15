import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { bibliothequeArticles } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type {
  PublicArticleSearchReader,
  PublicArticleSearchFilters,
  PublicArticleRow,
} from "../application/public-article-search";

// Recherche dans le catalogue public `bibliotheque_articles` (parité legacy `searchBibliothequeArticles`)
// : visible=true, ILIKE nom/description/categorie, filtres optionnels métier/catégorie/sous-catégorie,
// tri par nom, **limite 10**. Aucun scope tenant (catalogue global) → pas de RLS.
export class PublicArticleSearchReaderDrizzle implements PublicArticleSearchReader {
  constructor(private readonly db: DbClient) {}

  async search(q: string, filters: PublicArticleSearchFilters): Promise<PublicArticleRow[]> {
    const like = `%${q}%`;
    const conds: SQL[] = [
      eq(bibliothequeArticles.visible, true),
      or(
        ilike(bibliothequeArticles.nom, like),
        ilike(bibliothequeArticles.description, like),
        ilike(bibliothequeArticles.categorie, like),
      ) as SQL,
    ];
    if (filters.metier) conds.push(eq(bibliothequeArticles.metier, filters.metier));
    if (filters.categorie) conds.push(eq(bibliothequeArticles.categorie, filters.categorie));
    if (filters.sousCategorie) conds.push(eq(bibliothequeArticles.sous_categorie, filters.sousCategorie));

    return this.db
      .select({
        id: bibliothequeArticles.id,
        nom: bibliothequeArticles.nom,
        description: bibliothequeArticles.description,
        prix_base: bibliothequeArticles.prix_base,
        unite: bibliothequeArticles.unite,
        metier: bibliothequeArticles.metier,
        categorie: bibliothequeArticles.categorie,
        sous_categorie: bibliothequeArticles.sous_categorie,
        duree_moyenne_minutes: bibliothequeArticles.duree_moyenne_minutes,
      })
      .from(bibliothequeArticles)
      .where(and(...conds))
      .orderBy(asc(bibliothequeArticles.nom))
      .limit(10);
  }
}
