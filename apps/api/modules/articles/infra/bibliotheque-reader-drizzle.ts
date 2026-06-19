import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import { bibliothequeArticles } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { BibliothequeReader, BibliothequeArticle, BibliothequeFiltre } from "../application/bibliotheque-reader";

type Row = typeof bibliothequeArticles.$inferSelect;

function toArticle(r: Row): BibliothequeArticle {
  return {
    id: r.id,
    metier: r.metier,
    categorie: r.categorie,
    sousCategorie: r.sous_categorie,
    nom: r.nom,
    description: r.description ?? null,
    prixBase: r.prix_base,
    unite: r.unite,
    tauxTVA: r.tauxTVA ?? null,
    prixRevient: r.prixRevient ?? null,
    dureeMoyenneMinutes: r.duree_moyenne_minutes ?? null,
    visible: r.visible ?? true,
  };
}

/*
 * `bibliotheque_articles` est PARTAGÉE (pas d'`artisanId`, RLS OFF) → lecture directe sous le rôle
 * app_tenant sans GUC tenant (toutes les lignes visibles). Aucune écriture.
 */
export class BibliothequeReaderDrizzle implements BibliothequeReader {
  constructor(private readonly db: DbClient) {}

  async list(filtre?: BibliothequeFiltre): Promise<BibliothequeArticle[]> {
    const conds: SQL[] = [];
    if (filtre?.metier) conds.push(eq(bibliothequeArticles.metier, filtre.metier));
    if (filtre?.categorie) conds.push(eq(bibliothequeArticles.categorie, filtre.categorie));
    const rows = conds.length
      ? await this.db.select().from(bibliothequeArticles).where(and(...conds))
      : await this.db.select().from(bibliothequeArticles);
    return rows.map(toArticle);
  }

  async search(query: string, metier?: string): Promise<BibliothequeArticle[]> {
    const term = `%${query}%`;
    const conds: SQL[] = [
      or(ilike(bibliothequeArticles.nom, term), ilike(bibliothequeArticles.description, term)) as SQL,
    ];
    if (metier) conds.push(eq(bibliothequeArticles.metier, metier));
    const rows = await this.db.select().from(bibliothequeArticles).where(and(...conds)).limit(50);
    return rows.map(toArticle);
  }
}
