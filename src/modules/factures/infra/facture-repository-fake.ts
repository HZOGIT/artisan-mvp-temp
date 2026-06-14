import type { TenantContext } from "../../../shared/tenant";
import type { IFactureRepository, PaiementPatch, CreateAvoirInput } from "../application/facture-repository";
import type {
  Facture,
  FactureLigne,
  CreateFactureInput,
  UpdateFactureInput,
  CreateFactureLigneInput,
  UpdateFactureLigneInput,
} from "../domain/facture";
import { calculerMontantsLigne, calculerTotaux } from "../application/montants";

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
// tenant, la numérotation (préfixe "FAC" + compteur), le recalcul des totaux côté serveur et le
// scoping des lignes via la facture parente (factures_lignes SANS artisanId). ⚠️ `update` ne
// touche que les métadonnées (clientId/devisId/numero/statut/totaux/montantPaye réservés).
export class FakeFactureRepository implements IFactureRepository {
  private factureStore: Facture[] = [];
  private lignesStore: FactureLigne[] = [];
  private seq = 0;
  private ligneSeq = 0;
  private compteur = new Map<number, number>();
  private avoirCompteur = new Map<number, number>();
  private ownedClients = new Set<string>();
  private ownedDevis = new Set<string>();

  // Aides de test : déclarent qu'un client / devis appartient au tenant (anti-IDOR-FK).
  registerClient(artisanId: number, clientId: number): void {
    this.ownedClients.add(`${artisanId}:${clientId}`);
  }
  registerDevis(artisanId: number, devisId: number): void {
    this.ownedDevis.add(`${artisanId}:${devisId}`);
  }
  // Aide de test : force le statut d'une facture (non modifiable via l'interface publique —
  // piloté par le workflow en 7/9). Sert à tester l'immutabilité post-émission.
  setStatutForTest(id: number, statut: Facture["statut"]): void {
    this.factureStore = this.factureStore.map((f) => (f.id === id ? { ...f, statut } : f));
  }

  async list(ctx: TenantContext): Promise<Facture[]> {
    return this.factureStore.filter((f) => f.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Facture | null> {
    return this.factureStore.find((f) => f.id === id && f.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateFactureInput): Promise<Facture> {
    const now = new Date();
    const f: Facture = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      clientId: input.clientId,
      devisId: input.devisId ?? null,
      numero: input.numero,
      dateFacture: now,
      dateEcheance: input.dateEcheance ?? null,
      statut: "brouillon",
      typeDocument: input.typeDocument ?? "facture",
      factureOrigineId: input.factureOrigineId ?? null,
      objet: input.objet ?? null,
      referenceClient: input.referenceClient ?? null,
      siretDestinataire: input.siretDestinataire ?? null,
      conditionsPaiement: input.conditionsPaiement ?? null,
      notes: input.notes ?? null,
      totalHT: "0.00",
      totalTVA: "0.00",
      totalTTC: "0.00",
      montantPaye: "0.00",
      datePaiement: null,
      modePaiement: null,
      createdAt: now,
      updatedAt: now,
    };
    this.factureStore.push(f);
    return f;
  }

  async update(ctx: TenantContext, id: number, input: UpdateFactureInput): Promise<Facture | null> {
    const f = await this.getById(ctx, id);
    if (!f) return null;
    const updated: Facture = {
      ...f,
      objet: input.objet !== undefined ? input.objet : f.objet,
      referenceClient: input.referenceClient !== undefined ? input.referenceClient : f.referenceClient,
      siretDestinataire: input.siretDestinataire !== undefined ? input.siretDestinataire : f.siretDestinataire,
      conditionsPaiement: input.conditionsPaiement !== undefined ? input.conditionsPaiement : f.conditionsPaiement,
      notes: input.notes !== undefined ? input.notes : f.notes,
      dateEcheance: input.dateEcheance !== undefined ? input.dateEcheance : f.dateEcheance,
      updatedAt: new Date(),
    };
    this.factureStore = this.factureStore.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const f = await this.getById(ctx, id);
    if (!f) return false;
    this.factureStore = this.factureStore.filter((x) => x.id !== id);
    this.lignesStore = this.lignesStore.filter((l) => l.factureId !== id); // cascade
    return true;
  }

  async setStatut(ctx: TenantContext, id: number, statut: Facture["statut"]): Promise<Facture | null> {
    const f = await this.getById(ctx, id);
    if (!f) return null;
    const updated: Facture = { ...f, statut, updatedAt: new Date() };
    this.factureStore = this.factureStore.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async enregistrerPaiement(ctx: TenantContext, id: number, patch: PaiementPatch): Promise<Facture | null> {
    const f = await this.getById(ctx, id);
    if (!f) return null;
    const updated: Facture = {
      ...f,
      montantPaye: patch.montantPaye,
      datePaiement: patch.datePaiement,
      modePaiement: patch.modePaiement,
      statut: patch.statut,
      updatedAt: new Date(),
    };
    this.factureStore = this.factureStore.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async nextNumero(ctx: TenantContext): Promise<string> {
    const compteurParam = (this.compteur.get(ctx.artisanId) ?? 0) + 1;
    let maxFromDb = 0;
    for (const f of this.factureStore.filter((x) => x.artisanId === ctx.artisanId)) {
      const m = f.numero.match(/-(\d+)$/);
      if (m) maxFromDb = Math.max(maxFromDb, parseInt(m[1], 10) + 1);
    }
    const compteur = Math.max(compteurParam, maxFromDb);
    this.compteur.set(ctx.artisanId, compteur);
    return `FAC-${String(compteur).padStart(5, "0")}`;
  }

  async nextNumeroAvoir(ctx: TenantContext): Promise<string> {
    const compteurParam = (this.avoirCompteur.get(ctx.artisanId) ?? 0) + 1;
    let maxFromDb = 0;
    for (const f of this.factureStore.filter((x) => x.artisanId === ctx.artisanId && x.typeDocument === "avoir")) {
      const m = f.numero.match(/-(\d+)$/);
      if (m) maxFromDb = Math.max(maxFromDb, parseInt(m[1], 10) + 1);
    }
    const compteur = Math.max(compteurParam, maxFromDb);
    this.avoirCompteur.set(ctx.artisanId, compteur);
    return `AV-${String(compteur).padStart(5, "0")}`;
  }

  async listAvoirs(ctx: TenantContext, factureOrigineId: number): Promise<Facture[]> {
    return this.factureStore.filter(
      (f) => f.artisanId === ctx.artisanId && f.typeDocument === "avoir" && f.factureOrigineId === factureOrigineId,
    );
  }

  async createAvoir(ctx: TenantContext, input: CreateAvoirInput): Promise<Facture | null> {
    if (!(await this.getById(ctx, input.factureOrigineId))) return null;
    const totaux = calculerTotaux(input.lignes);
    const now = new Date();
    const avoir: Facture = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      clientId: input.clientId,
      devisId: null,
      numero: input.numero,
      dateFacture: now,
      dateEcheance: null,
      statut: "validee",
      typeDocument: "avoir",
      factureOrigineId: input.factureOrigineId,
      objet: input.objet,
      referenceClient: null,
      siretDestinataire: null,
      conditionsPaiement: input.conditionsPaiement,
      notes: input.notes,
      totalHT: totaux.totalHT,
      totalTVA: totaux.totalTVA,
      totalTTC: totaux.totalTTC,
      montantPaye: "0.00",
      datePaiement: null,
      modePaiement: null,
      createdAt: now,
      updatedAt: now,
    };
    this.factureStore.push(avoir);
    input.lignes.forEach((l, i) => {
      this.lignesStore.push({
        id: ++this.ligneSeq,
        factureId: avoir.id,
        ordre: i,
        reference: null,
        designation: l.designation,
        description: l.description,
        quantite: l.quantite,
        unite: l.unite ?? "unité",
        prixUnitaireHT: l.prixUnitaireHT,
        tauxTVA: l.tauxTVA,
        montantHT: l.montantHT,
        montantTVA: l.montantTVA,
        montantTTC: l.montantTTC,
        type: "produit",
      });
    });
    return avoir;
  }

  async ownsClient(ctx: TenantContext, clientId: number): Promise<boolean> {
    return this.ownedClients.has(`${ctx.artisanId}:${clientId}`);
  }

  async ownsDevis(ctx: TenantContext, devisId: number): Promise<boolean> {
    return this.ownedDevis.has(`${ctx.artisanId}:${devisId}`);
  }

  async listLignes(ctx: TenantContext, factureId: number): Promise<FactureLigne[]> {
    if (!(await this.getById(ctx, factureId))) return [];
    return this.lignesStore
      .filter((l) => l.factureId === factureId)
      .sort((a, b) => a.ordre - b.ordre || a.id - b.id);
  }

  async addLigne(ctx: TenantContext, factureId: number, input: CreateFactureLigneInput): Promise<FactureLigne | null> {
    if (!(await this.getById(ctx, factureId))) return null;
    const type = input.type ?? "produit";
    const isDisplay = type === "section" || type === "note";
    const quantite = isDisplay ? "0" : input.quantite ?? "1";
    const prixUnitaireHT = isDisplay ? "0" : input.prixUnitaireHT;
    const tauxTVA = isDisplay ? "0" : input.tauxTVA ?? "20.00";
    const montants = calculerMontantsLigne(type, quantite, prixUnitaireHT, tauxTVA);
    const ligne: FactureLigne = {
      id: ++this.ligneSeq,
      factureId,
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
    this.recalculerTotaux(factureId);
    return ligne;
  }

  async updateLigne(ctx: TenantContext, ligneId: number, input: UpdateFactureLigneInput): Promise<FactureLigne | null> {
    const ligne = this.lignesStore.find((l) => l.id === ligneId);
    if (!ligne || !(await this.getById(ctx, ligne.factureId))) return null;
    const type = input.type ?? ligne.type;
    const isDisplay = type === "section" || type === "note";
    const quantite = isDisplay ? "0" : input.quantite ?? ligne.quantite;
    const prixUnitaireHT = isDisplay ? "0" : input.prixUnitaireHT ?? ligne.prixUnitaireHT;
    const tauxTVA = isDisplay ? "0" : input.tauxTVA ?? ligne.tauxTVA;
    const montants = calculerMontantsLigne(type, quantite, prixUnitaireHT, tauxTVA);
    const updated: FactureLigne = {
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
    this.recalculerTotaux(ligne.factureId);
    return updated;
  }

  async deleteLigne(ctx: TenantContext, ligneId: number): Promise<boolean> {
    const ligne = this.lignesStore.find((l) => l.id === ligneId);
    if (!ligne || !(await this.getById(ctx, ligne.factureId))) return false;
    this.lignesStore = this.lignesStore.filter((l) => l.id !== ligneId);
    this.recalculerTotaux(ligne.factureId);
    return true;
  }

  private recalculerTotaux(factureId: number): void {
    const lignes = this.lignesStore.filter((l) => l.factureId === factureId);
    const totaux = calculerTotaux(lignes);
    this.factureStore = this.factureStore.map((f) =>
      f.id === factureId ? { ...f, totalHT: totaux.totalHT, totalTVA: totaux.totalTVA, totalTTC: totaux.totalTTC, updatedAt: new Date() } : f,
    );
  }
}
