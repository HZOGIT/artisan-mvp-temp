import type { TenantContext } from "../../../shared/tenant";
import type { ICommandeRepository } from "../application/commande-repository";
import type {
  Commande,
  LigneCommande,
  CreateCommandeInput,
  CreateLigneInput,
  UpdateCommandeInput,
  CommandeStatut,
} from "../domain/commande";

function calculerTotaux(lignes: readonly CreateLigneInput[]): { totalHT: number; totalTVA: number; lignesHT: number[] } {
  let totalHT = 0;
  let totalTVA = 0;
  const lignesHT: number[] = [];
  for (const l of lignes) {
    const ligneHT = Number(l.quantite) * Number(l.prixUnitaire ?? 0);
    lignesHT.push(ligneHT);
    totalHT += ligneHT;
    totalTVA += ligneHT * (Number(l.tauxTVA ?? "20") / 100);
  }
  return { totalHT, totalTVA, lignesHT };
}

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
// scoping tenant + l'ownership fournisseur (anti-IDOR-FK) + le calcul serveur des totaux.
export class FakeCommandeRepository implements ICommandeRepository {
  private store: Commande[] = [];
  private lignesStore: LigneCommande[] = [];
  private fournisseurs: Array<{ id: number; artisanId: number }> = [];
  private seq = 0;
  private ligneSeq = 0;

  // Utilitaire de test (hors port) : déclare un fournisseur appartenant à un tenant.
  seedFournisseur(id: number, artisanId: number): void {
    this.fournisseurs.push({ id, artisanId });
  }
  private ownsFournisseur(ctx: TenantContext, id: number): boolean {
    return this.fournisseurs.some((f) => f.id === id && f.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<Commande[]> {
    return this.store.filter((c) => c.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Commande | null> {
    return this.store.find((c) => c.id === id && c.artisanId === ctx.artisanId) ?? null;
  }

  async listLignes(ctx: TenantContext, commandeId: number): Promise<LigneCommande[]> {
    if (!(await this.getById(ctx, commandeId))) return [];
    return this.lignesStore.filter((l) => l.commandeId === commandeId);
  }

  async create(ctx: TenantContext, input: CreateCommandeInput): Promise<Commande | null> {
    if (!this.ownsFournisseur(ctx, input.fournisseurId)) return null;
    const { totalHT, totalTVA, lignesHT } = calculerTotaux(input.lignes);
    const now = new Date();
    const id = ++this.seq;
    const commande: Commande = {
      id,
      artisanId: ctx.artisanId,
      fournisseurId: input.fournisseurId,
      numero: `CMD-${String(id).padStart(5, "0")}`,
      reference: input.reference ?? null,
      dateCommande: now,
      dateLivraisonPrevue: input.dateLivraisonPrevue ?? null,
      dateLivraisonReelle: null,
      statut: "brouillon",
      totalHT: totalHT.toFixed(2),
      totalTVA: totalTVA.toFixed(2),
      totalTTC: (totalHT + totalTVA).toFixed(2),
      montantTotal: (totalHT + totalTVA).toFixed(2),
      adresseLivraison: input.adresseLivraison ?? null,
      notes: input.notes ?? null,
      statutFacturation: "a_facturer",
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(commande);
    input.lignes.forEach((l, i) => {
      this.lignesStore.push({
        id: ++this.ligneSeq,
        commandeId: id,
        articleId: l.articleId ?? null,
        stockId: null,
        designation: l.designation,
        reference: l.reference ?? null,
        quantite: Number(l.quantite).toFixed(2),
        quantiteRecue: "0.00",
        unite: l.unite ?? "unité",
        prixUnitaire: l.prixUnitaire != null ? Number(l.prixUnitaire).toFixed(2) : null,
        tauxTVA: Number(l.tauxTVA ?? "20").toFixed(2),
        montantTotal: lignesHT[i].toFixed(2),
      });
    });
    return commande;
  }

  async update(ctx: TenantContext, id: number, input: UpdateCommandeInput): Promise<Commande | null> {
    const c = await this.getById(ctx, id);
    if (!c) return null;
    const updated: Commande = { ...c, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const c = await this.getById(ctx, id);
    if (!c) return false;
    this.store = this.store.filter((x) => x.id !== id);
    this.lignesStore = this.lignesStore.filter((l) => l.commandeId !== id);
    return true;
  }

  async updateStatut(
    ctx: TenantContext,
    id: number,
    statut: CommandeStatut,
    dateLivraisonReelle?: Date | null,
  ): Promise<Commande | null> {
    const c = await this.getById(ctx, id);
    if (!c) return null;
    const updated: Commande = {
      ...c,
      statut,
      dateLivraisonReelle: dateLivraisonReelle !== undefined ? dateLivraisonReelle : c.dateLivraisonReelle,
      updatedAt: new Date(),
    };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async listEnRetard(ctx: TenantContext): Promise<Commande[]> {
    const now = Date.now();
    return this.store.filter(
      (c) =>
        c.artisanId === ctx.artisanId &&
        c.dateLivraisonPrevue != null &&
        c.dateLivraisonPrevue.getTime() < now &&
        c.statut !== "livree" &&
        c.statut !== "annulee",
    );
  }
}
