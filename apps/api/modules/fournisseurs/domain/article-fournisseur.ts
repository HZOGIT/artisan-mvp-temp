/*
 * Association article↔fournisseur (référence externe, prix d'achat, délai de livraison).
 * Données tenant-privées : la table `articles_fournisseurs` n'a PAS d'artisanId →
 * l'isolation passe par l'appartenance de l'article ET du fournisseur au tenant
 * (anti-IDOR : ne jamais exposer/modifier le prix d'achat d'un autre artisan).
 */
export interface ArticleFournisseur {
  readonly id: number;
  readonly articleId: number;
  readonly fournisseurId: number;
  readonly referenceExterne: string | null;
  readonly prixAchat: string | null; // numeric PG en string (précision préservée)
  readonly delaiLivraison: number | null;
  readonly createdAt: Date;
}

export interface AjouterAssociationInput {
  readonly articleId: number;
  readonly fournisseurId: number;
  readonly referenceExterne?: string | null;
  readonly prixAchat?: string | null;
  readonly delaiLivraison?: number | null;
}
