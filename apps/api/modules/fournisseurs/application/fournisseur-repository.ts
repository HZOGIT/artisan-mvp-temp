import type { TenantContext } from "../../../shared/tenant";
import type { Fournisseur, CreateFournisseurInput, UpdateFournisseurInput } from "../domain/fournisseur";
import type { ArticleFournisseur, AjouterAssociationInput } from "../domain/article-fournisseur";

// Port du repository fournisseurs. Chaque méthode exige le TenantContext (scope tenant +
// RLS). `fournisseurs` possède un `artisanId` → double cloisonnement RLS + filtre.
// Les associations article↔fournisseur (prix d'achat, références — tenant-privées, table
// SANS artisanId) seront ajoutées à une étape ultérieure, scopées via l'ownership du
// fournisseur (anti-IDOR historique).
export interface IFournisseurRepository {
  list(ctx: TenantContext): Promise<Fournisseur[]>;
  getById(ctx: TenantContext, id: number): Promise<Fournisseur | null>;
  create(ctx: TenantContext, input: CreateFournisseurInput): Promise<Fournisseur>;
  // null si le fournisseur n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateFournisseurInput): Promise<Fournisseur | null>;
  // false si le fournisseur n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;

  // Associations article↔fournisseur (prix d'achat) — scopées via ownership tenant.
  // Lectures sans oracle : [] si l'article/fournisseur n'appartient pas au tenant.
  listAssociationsArticle(ctx: TenantContext, articleId: number): Promise<ArticleFournisseur[]>;
  listAssociationsFournisseur(ctx: TenantContext, fournisseurId: number): Promise<ArticleFournisseur[]>;
  // null si l'article OU le fournisseur n'appartient pas au tenant (anti-IDOR sur les 2 FK).
  ajouterAssociation(ctx: TenantContext, input: AjouterAssociationInput): Promise<ArticleFournisseur | null>;
  // false si l'association ne relève pas d'un fournisseur du tenant.
  supprimerAssociation(ctx: TenantContext, id: number): Promise<boolean>;
}
