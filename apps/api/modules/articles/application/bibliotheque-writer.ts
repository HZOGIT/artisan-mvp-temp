import type { BibliothequeArticle } from "./bibliotheque-reader";

/*
 * Écritures du catalogue PARTAGÉ (`bibliotheque_articles`). ⚠️ Réservé au staff Operioz
 * (`adminProcedure`) : la bibliothèque est servie à TOUS les tenants → une écriture par un artisan
 * polluerait le catalogue commun. Aucun scope tenant (table sans `artisanId`).
 */

export interface CreateBibliothequeInput {
  readonly nom: string;
  readonly description?: string | null;
  readonly unite: string;
  readonly prixBase: string;
  readonly tauxTVA?: string | null;
  readonly prixRevient?: string | null;
  readonly categorie: string;
  readonly sousCategorie: string;
  readonly metier: string;
}

export interface UpdateBibliothequeInput {
  readonly nom?: string;
  readonly description?: string | null;
  readonly unite?: string;
  readonly prixBase?: string;
  readonly tauxTVA?: string | null;
  readonly prixRevient?: string | null;
  readonly categorie?: string;
  readonly sousCategorie?: string;
  readonly metier?: string;
}

export interface BibliothequeWriter {
  create(input: CreateBibliothequeInput): Promise<BibliothequeArticle>;
  // null si l'article n'existe pas.
  update(id: number, input: UpdateBibliothequeInput): Promise<BibliothequeArticle | null>;
  // false si l'article n'existe pas. Idempotent.
  delete(id: number): Promise<boolean>;
  // Insertion en masse — renvoie le nombre d'articles importés.
  importMany(inputs: CreateBibliothequeInput[]): Promise<number>;
}
