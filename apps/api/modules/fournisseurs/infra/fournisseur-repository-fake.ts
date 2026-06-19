import type { TenantContext } from "../../../shared/tenant";
import type { IFournisseurRepository } from "../application/fournisseur-repository";
import type { Fournisseur, CreateFournisseurInput, UpdateFournisseurInput } from "../domain/fournisseur";
import type { ArticleFournisseur, AjouterAssociationInput } from "../domain/article-fournisseur";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
 * scoping tenant : artisanId forcé du contexte, ressource hors tenant invisible.
 */
export class FakeFournisseurRepository implements IFournisseurRepository {
  private store: Fournisseur[] = [];
  private articles: Array<{ id: number; artisanId: number }> = [];
  private assocs: ArticleFournisseur[] = [];
  private seq = 0;
  private assocSeq = 0;

  /** Utilitaire de test (hors port) : déclare un article appartenant à un tenant. */
  seedArticle(id: number, artisanId: number): void {
    this.articles.push({ id, artisanId });
  }

  private ownsArticle(ctx: TenantContext, articleId: number): boolean {
    return this.articles.some((a) => a.id === articleId && a.artisanId === ctx.artisanId);
  }
  private ownsFournisseur(ctx: TenantContext, fournisseurId: number): boolean {
    return this.store.some((f) => f.id === fournisseurId && f.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<Fournisseur[]> {
    return this.store.filter((f) => f.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Fournisseur | null> {
    return this.store.find((f) => f.id === id && f.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateFournisseurInput): Promise<Fournisseur> {
    const now = new Date();
    const f: Fournisseur = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      nom: input.nom,
      contact: input.contact ?? null,
      email: input.email ?? null,
      telephone: input.telephone ?? null,
      adresse: input.adresse ?? null,
      codePostal: input.codePostal ?? null,
      ville: input.ville ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(f);
    return f;
  }

  async update(ctx: TenantContext, id: number, input: UpdateFournisseurInput): Promise<Fournisseur | null> {
    const f = await this.getById(ctx, id);
    if (!f) return null;
    const updated: Fournisseur = { ...f, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const f = await this.getById(ctx, id);
    if (!f) return false;
    this.store = this.store.filter((x) => x.id !== id);
    this.assocs = this.assocs.filter((a) => a.fournisseurId !== id);
    return true;
  }

  async listAssociationsArticle(ctx: TenantContext, articleId: number): Promise<ArticleFournisseur[]> {
    if (!this.ownsArticle(ctx, articleId)) return [];
    return this.assocs.filter((a) => a.articleId === articleId && this.ownsFournisseur(ctx, a.fournisseurId));
  }

  async listAssociationsFournisseur(ctx: TenantContext, fournisseurId: number): Promise<ArticleFournisseur[]> {
    if (!this.ownsFournisseur(ctx, fournisseurId)) return [];
    return this.assocs.filter((a) => a.fournisseurId === fournisseurId);
  }

  async ajouterAssociation(ctx: TenantContext, input: AjouterAssociationInput): Promise<ArticleFournisseur | null> {
    if (!this.ownsArticle(ctx, input.articleId)) return null;
    if (!this.ownsFournisseur(ctx, input.fournisseurId)) return null;
    const a: ArticleFournisseur = {
      id: ++this.assocSeq,
      articleId: input.articleId,
      fournisseurId: input.fournisseurId,
      referenceExterne: input.referenceExterne ?? null,
      prixAchat: input.prixAchat ?? null,
      delaiLivraison: input.delaiLivraison ?? null,
      createdAt: new Date(),
    };
    this.assocs.push(a);
    return a;
  }

  async supprimerAssociation(ctx: TenantContext, id: number): Promise<boolean> {
    const a = this.assocs.find((x) => x.id === id);
    if (!a || !this.ownsFournisseur(ctx, a.fournisseurId)) return false;
    this.assocs = this.assocs.filter((x) => x.id !== id);
    return true;
  }
}
