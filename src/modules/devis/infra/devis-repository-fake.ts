import type { TenantContext } from "../../../shared/tenant";
import type { IDevisRepository } from "../application/devis-repository";
import type {
  Devis,
  DevisLigne,
  CreateDevisInput,
  UpdateDevisInput,
  CreateDevisLigneInput,
  UpdateDevisLigneInput,
} from "../domain/devis";
import { calculerMontantsLigne, calculerTotaux } from "../application/montants";

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
// tenant, la numérotation (préfixe "DEV" + compteur), le recalcul des totaux côté serveur et le
// scoping des lignes via le devis parent (devis_lignes SANS artisanId). ⚠️ `update` ne touche
// que les métadonnées (clientId/numero/statut/totaux réservés).
export class FakeDevisRepository implements IDevisRepository {
  private devisStore: Devis[] = [];
  private lignesStore: DevisLigne[] = [];
  private seq = 0;
  private ligneSeq = 0;
  private compteur = new Map<number, number>();
  // Clients appartenant à un tenant (injectable) : clé `${artisanId}:${clientId}`.
  private ownedClients = new Set<string>();

  // Aide de test : déclare qu'un client appartient au tenant (pour valider ownsClient/anti-IDOR).
  registerClient(artisanId: number, clientId: number): void {
    this.ownedClients.add(`${artisanId}:${clientId}`);
  }

  async list(ctx: TenantContext): Promise<Devis[]> {
    return this.devisStore.filter((d) => d.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Devis | null> {
    return this.devisStore.find((d) => d.id === id && d.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateDevisInput): Promise<Devis> {
    const now = new Date();
    const d: Devis = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      clientId: input.clientId,
      numero: input.numero,
      dateDevis: now,
      dateValidite: input.dateValidite ?? null,
      dateVue: null,
      statut: "brouillon",
      objet: input.objet ?? null,
      referenceClient: input.referenceClient ?? null,
      conditionsPaiement: input.conditionsPaiement ?? null,
      notes: input.notes ?? null,
      totalHT: "0.00",
      totalTVA: "0.00",
      totalTTC: "0.00",
      createdAt: now,
      updatedAt: now,
    };
    this.devisStore.push(d);
    return d;
  }

  async update(ctx: TenantContext, id: number, input: UpdateDevisInput): Promise<Devis | null> {
    const d = await this.getById(ctx, id);
    if (!d) return null;
    // Métadonnées seulement (UpdateDevisInput exclut clientId/numero/statut/totaux).
    const updated: Devis = {
      ...d,
      objet: input.objet !== undefined ? input.objet : d.objet,
      referenceClient: input.referenceClient !== undefined ? input.referenceClient : d.referenceClient,
      conditionsPaiement: input.conditionsPaiement !== undefined ? input.conditionsPaiement : d.conditionsPaiement,
      notes: input.notes !== undefined ? input.notes : d.notes,
      dateValidite: input.dateValidite !== undefined ? input.dateValidite : d.dateValidite,
      updatedAt: new Date(),
    };
    this.devisStore = this.devisStore.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const d = await this.getById(ctx, id);
    if (!d) return false;
    this.devisStore = this.devisStore.filter((x) => x.id !== id);
    this.lignesStore = this.lignesStore.filter((l) => l.devisId !== id); // cascade
    return true;
  }

  async nextNumero(ctx: TenantContext): Promise<string> {
    const compteurParam = (this.compteur.get(ctx.artisanId) ?? 0) + 1;
    let maxFromDb = 0;
    for (const d of this.devisStore.filter((x) => x.artisanId === ctx.artisanId)) {
      const m = d.numero.match(/-(\d+)$/);
      if (m) maxFromDb = Math.max(maxFromDb, parseInt(m[1], 10) + 1);
    }
    const compteur = Math.max(compteurParam, maxFromDb);
    this.compteur.set(ctx.artisanId, compteur);
    return `DEV-${String(compteur).padStart(5, "0")}`;
  }

  async ownsClient(ctx: TenantContext, clientId: number): Promise<boolean> {
    return this.ownedClients.has(`${ctx.artisanId}:${clientId}`);
  }

  async listLignes(ctx: TenantContext, devisId: number): Promise<DevisLigne[]> {
    if (!(await this.getById(ctx, devisId))) return [];
    return this.lignesStore
      .filter((l) => l.devisId === devisId)
      .sort((a, b) => a.ordre - b.ordre || a.id - b.id);
  }

  async addLigne(ctx: TenantContext, devisId: number, input: CreateDevisLigneInput): Promise<DevisLigne | null> {
    if (!(await this.getById(ctx, devisId))) return null;
    const type = input.type ?? "produit";
    const isDisplay = type === "section" || type === "note";
    const quantite = isDisplay ? "0" : input.quantite ?? "1";
    const prixUnitaireHT = isDisplay ? "0" : input.prixUnitaireHT;
    const tauxTVA = isDisplay ? "0" : input.tauxTVA ?? "20.00";
    const montants = calculerMontantsLigne(type, quantite, prixUnitaireHT, tauxTVA);
    const ligne: DevisLigne = {
      id: ++this.ligneSeq,
      devisId,
      ordre: input.ordre ?? 0,
      reference: isDisplay ? null : input.reference ?? null,
      designation: input.designation,
      description: input.description ?? null,
      quantite,
      unite: isDisplay ? "unité" : input.unite ?? "unité",
      prixUnitaireHT,
      tauxTVA,
      montantHT: montants.montantHT,
      montantTVA: montants.montantTVA,
      montantTTC: montants.montantTTC,
      type,
    };
    this.lignesStore.push(ligne);
    this.recalculerTotaux(devisId);
    return ligne;
  }

  async updateLigne(ctx: TenantContext, ligneId: number, input: UpdateDevisLigneInput): Promise<DevisLigne | null> {
    const ligne = this.lignesStore.find((l) => l.id === ligneId);
    if (!ligne || !(await this.getById(ctx, ligne.devisId))) return null;
    const type = input.type ?? ligne.type;
    const isDisplay = type === "section" || type === "note";
    const quantite = isDisplay ? "0" : input.quantite ?? ligne.quantite;
    const prixUnitaireHT = isDisplay ? "0" : input.prixUnitaireHT ?? ligne.prixUnitaireHT;
    const tauxTVA = isDisplay ? "0" : input.tauxTVA ?? ligne.tauxTVA;
    const montants = calculerMontantsLigne(type, quantite, prixUnitaireHT, tauxTVA);
    const updated: DevisLigne = {
      ...ligne,
      designation: input.designation !== undefined ? input.designation : ligne.designation,
      description: input.description !== undefined ? input.description : ligne.description,
      reference: input.reference !== undefined ? (isDisplay ? null : input.reference) : ligne.reference,
      unite: input.unite !== undefined ? (isDisplay ? "unité" : input.unite) : ligne.unite,
      ordre: input.ordre !== undefined ? input.ordre : ligne.ordre,
      quantite,
      prixUnitaireHT,
      tauxTVA,
      type,
      montantHT: montants.montantHT,
      montantTVA: montants.montantTVA,
      montantTTC: montants.montantTTC,
    };
    this.lignesStore = this.lignesStore.map((l) => (l.id === ligneId ? updated : l));
    this.recalculerTotaux(ligne.devisId);
    return updated;
  }

  async deleteLigne(ctx: TenantContext, ligneId: number): Promise<boolean> {
    const ligne = this.lignesStore.find((l) => l.id === ligneId);
    if (!ligne || !(await this.getById(ctx, ligne.devisId))) return false;
    this.lignesStore = this.lignesStore.filter((l) => l.id !== ligneId);
    this.recalculerTotaux(ligne.devisId);
    return true;
  }

  private recalculerTotaux(devisId: number): void {
    const lignes = this.lignesStore.filter((l) => l.devisId === devisId);
    const totaux = calculerTotaux(lignes);
    this.devisStore = this.devisStore.map((d) =>
      d.id === devisId ? { ...d, totalHT: totaux.totalHT, totalTVA: totaux.totalTVA, totalTTC: totaux.totalTTC, updatedAt: new Date() } : d,
    );
  }
}
