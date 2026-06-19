import { eq } from "drizzle-orm";
import { bibliothequeArticles } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { BibliothequeArticle } from "../application/bibliotheque-reader";
import type { BibliothequeWriter, CreateBibliothequeInput, UpdateBibliothequeInput } from "../application/bibliotheque-writer";

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

function toInsert(input: CreateBibliothequeInput): typeof bibliothequeArticles.$inferInsert {
  return {
    nom: input.nom,
    description: input.description ?? null,
    unite: input.unite,
    prix_base: input.prixBase,
    tauxTVA: input.tauxTVA ?? undefined,
    prixRevient: input.prixRevient ?? null,
    categorie: input.categorie,
    sous_categorie: input.sousCategorie,
    metier: input.metier,
  };
}

/*
 * Écritures du catalogue PARTAGÉ (table sans `artisanId`, RLS OFF) — pas de scope tenant. La garde
 * d'autorisation (admin) est portée par la procédure tRPC `adminProcedure`.
 */
export class BibliothequeWriterDrizzle implements BibliothequeWriter {
  constructor(private readonly db: DbClient) {}

  async create(input: CreateBibliothequeInput): Promise<BibliothequeArticle> {
    const [row] = await this.db.insert(bibliothequeArticles).values(toInsert(input)).returning();
    return toArticle(row);
  }

  async update(id: number, input: UpdateBibliothequeInput): Promise<BibliothequeArticle | null> {
    const set: Partial<typeof bibliothequeArticles.$inferInsert> = {};
    if (input.nom !== undefined) set.nom = input.nom;
    if (input.description !== undefined) set.description = input.description;
    if (input.unite !== undefined) set.unite = input.unite;
    if (input.prixBase !== undefined) set.prix_base = input.prixBase;
    if (input.tauxTVA !== undefined) set.tauxTVA = input.tauxTVA ?? null;
    if (input.prixRevient !== undefined) set.prixRevient = input.prixRevient ?? null;
    if (input.categorie !== undefined) set.categorie = input.categorie;
    if (input.sousCategorie !== undefined) set.sous_categorie = input.sousCategorie;
    if (input.metier !== undefined) set.metier = input.metier;
    if (Object.keys(set).length === 0) {
      const [cur] = await this.db.select().from(bibliothequeArticles).where(eq(bibliothequeArticles.id, id)).limit(1);
      return cur ? toArticle(cur) : null;
    }
    const [row] = await this.db.update(bibliothequeArticles).set(set).where(eq(bibliothequeArticles.id, id)).returning();
    return row ? toArticle(row) : null;
  }

  async delete(id: number): Promise<boolean> {
    const deleted = await this.db.delete(bibliothequeArticles).where(eq(bibliothequeArticles.id, id)).returning({ id: bibliothequeArticles.id });
    return deleted.length > 0;
  }

  async importMany(inputs: CreateBibliothequeInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const rows = await this.db.insert(bibliothequeArticles).values(inputs.map(toInsert)).returning({ id: bibliothequeArticles.id });
    return rows.length;
  }
}
