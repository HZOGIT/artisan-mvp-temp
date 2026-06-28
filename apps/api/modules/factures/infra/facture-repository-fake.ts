import type { TenantContext } from "../../../shared/tenant";
import type { DbClient } from "../../../shared/db";
import type { IFactureRepository, PaiementPatch, CreateAvoirInput, CreateFromDevisInput, Reglement, CreateReglementInput } from "../application/facture-repository";
import type {
  Facture,
  FactureLigne,
  CreateFactureInput,
  UpdateFactureInput,
  CreateFactureLigneInput,
  UpdateFactureLigneInput,
  AuditLogEntry,
} from "../domain/facture";
import { calculerMontantsLigne, calculerTotaux, appliquerRegimeTVA } from "../application/montants";
import { ValidationError } from "../../../shared/errors";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
 * tenant, la numérotation (préfixe "FAC" + compteur), le recalcul des totaux côté serveur et le
 * scoping des lignes via la facture parente (factures_lignes SANS artisanId). ⚠️ `update` ne
 * touche que les métadonnées (clientId/devisId/numero/statut/totaux/montantPaye réservés).
 */
export class FakeFactureRepository implements IFactureRepository {
  private factureStore: Facture[] = [];
  private lignesStore: FactureLigne[] = [];
  private reglementStore: Reglement[] = [];
  private seq = 0;
  private ligneSeq = 0;
  private reglementSeq = 0;
  private compteur = new Map<number, number>();
  private avoirCompteur = new Map<number, number>();
  private ownedClients = new Set<string>();
  private ownedDevis = new Set<string>();
  /** Journal d'audit simulé (avec artisanId pour le scope tenant). */
  private auditStore: Array<AuditLogEntry & { artisanId: number }> = [];
  private auditSeq = 0;

  /** Aide de test (hors port) : ajoute une entrée d'audit pour une facture. */
  seedAuditLog(artisanId: number, factureId: number, action: string, userId = 1, details: string | null = null): void {
    this.auditStore.push({
      id: ++this.auditSeq,
      artisanId,
      userId,
      entityType: "facture",
      entityId: factureId,
      action,
      details,
      createdAt: new Date(Date.now() + this.auditSeq),
    });
  }

  /** Aides de test : déclarent qu'un client / devis appartient au tenant (anti-IDOR-FK). */
  registerClient(artisanId: number, clientId: number): void {
    this.ownedClients.add(`${artisanId}:${clientId}`);
  }
  registerDevis(artisanId: number, devisId: number): void {
    this.ownedDevis.add(`${artisanId}:${devisId}`);
  }
  /*
   * Aide de test : force le statut d'une facture (non modifiable via l'interface publique —
   * piloté par le workflow en 7/9). Sert à tester l'immutabilité post-émission.
   */
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
      nombreRelances: 0,
      regimeTVA: input.regimeTVA ?? "normal",
    };
    this.factureStore.push(f);
    return f;
  }

  async createWithLignes(ctx: TenantContext, header: CreateFactureInput, lignes: readonly CreateFactureLigneInput[], inTx?: (tx: DbClient) => Promise<void>): Promise<Facture> {
    const now = new Date();
    const id = ++this.seq;
    const processedLignes = lignes.map((l, i) => {
      const type = l.type ?? "produit";
      const isDisplay = type === "section" || type === "note";
      const quantite = isDisplay ? "0" : l.quantite ?? "1";
      const prixUnitaireHT = isDisplay ? "0" : l.prixUnitaireHT;
      const tauxTVA = isDisplay ? "0" : l.tauxTVA ?? "20.00";
      const montants = calculerMontantsLigne(type, quantite, prixUnitaireHT, tauxTVA);
      return {
        ligne: {
          factureId: id,
          ordre: l.ordre ?? i,
          articleId: isDisplay ? null : (l.articleId ?? null),
          reference: isDisplay ? null : l.reference ?? null,
          designation: l.designation,
          description: l.description ?? null,
          quantite,
          unite: isDisplay ? "unité" : l.unite ?? "unité",
          prixUnitaireHT,
          tauxTVA,
          tvaCategorieId: isDisplay ? null : (l.tvaCategorieId ?? null),
          montantHT: montants.montantHT,
          montantTVA: montants.montantTVA,
          montantTTC: montants.montantTTC,
          type,
        } as Omit<FactureLigne, "id">,
        montants,
      };
    });
    const totauxBruts = calculerTotaux(processedLignes.map((p) => p.montants));
    const totaux = appliquerRegimeTVA(totauxBruts, header.regimeTVA ?? "normal");
    const facture: Facture = {
      id,
      artisanId: ctx.artisanId,
      clientId: header.clientId,
      devisId: header.devisId ?? null,
      numero: header.numero,
      dateFacture: now,
      dateEcheance: header.dateEcheance ?? null,
      statut: "brouillon",
      typeDocument: header.typeDocument ?? "facture",
      factureOrigineId: header.factureOrigineId ?? null,
      objet: header.objet ?? null,
      referenceClient: header.referenceClient ?? null,
      siretDestinataire: header.siretDestinataire ?? null,
      conditionsPaiement: header.conditionsPaiement ?? null,
      notes: header.notes ?? null,
      totalHT: totaux.totalHT,
      totalTVA: totaux.totalTVA,
      totalTTC: totaux.totalTTC,
      montantPaye: "0.00",
      datePaiement: null,
      modePaiement: null,
      createdAt: now,
      updatedAt: now,
      nombreRelances: 0,
      regimeTVA: header.regimeTVA ?? "normal",
    };
    this.factureStore.push(facture);
    const lignesAdded: number[] = [];
    for (const { ligne } of processedLignes) {
      const id2 = ++this.ligneSeq;
      this.lignesStore.push({ ...ligne, id: id2 });
      lignesAdded.push(id2);
    }
    if (inTx) {
      try {
        await inTx(null as unknown as DbClient);
      } catch (e) {
        /** Simulate rollback on inTx failure. */
        this.factureStore.splice(this.factureStore.indexOf(facture), 1);
        this.lignesStore = this.lignesStore.filter((l) => !lignesAdded.includes(l.id));
        throw e;
      }
    }
    return facture;
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
      nombreRelances: input.nombreRelances !== undefined ? input.nombreRelances : f.nombreRelances,
      regimeTVA: input.regimeTVA !== undefined ? input.regimeTVA : f.regimeTVA,
      updatedAt: new Date(),
    };
    this.factureStore = this.factureStore.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const f = await this.getById(ctx, id);
    if (!f) return false;
    this.factureStore = this.factureStore.filter((x) => x.id !== id);
    /** cascade */
    this.lignesStore = this.lignesStore.filter((l) => l.factureId !== id);
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

  async ajouterReglement(ctx: TenantContext, input: CreateReglementInput): Promise<Reglement | null> {
    const facture = await this.getById(ctx, input.factureId);
    if (!facture) return null;

    const currentSum = this.reglementStore
      .filter((r) => r.factureId === input.factureId)
      .reduce((sum, r) => sum + Number(r.montant), 0);
    const montantNum = Number(input.montant);
    const totalTTC = Number(facture.totalTTC) || 0;
    const cumul = currentSum + montantNum;

    if (cumul > totalTTC + 0.005) {
      throw new ValidationError("Le montant payé dépasse le total TTC de la facture");
    }

    const reglement: Reglement = {
      id: ++this.reglementSeq,
      factureId: input.factureId,
      artisanId: ctx.artisanId,
      montant: input.montant,
      date: input.date,
      mode: input.mode,
      reference: input.reference ?? null,
      note: input.note ?? null,
      createdAt: new Date(),
    };

    this.reglementStore.push(reglement);

    const soldee = totalTTC > 0 && cumul >= totalTTC - 0.005;
    const updated: Facture = {
      ...facture,
      montantPaye: cumul.toFixed(2),
      statut: soldee ? "payee" : facture.statut,
      updatedAt: new Date(),
    };
    this.factureStore = this.factureStore.map((x) => (x.id === input.factureId ? updated : x));

    return reglement;
  }

  async nextNumero(ctx: TenantContext): Promise<string> {
    const compteurParam = (this.compteur.get(ctx.artisanId) ?? 0) + 1;
    let maxFromDb = 0;
    for (const f of this.factureStore.filter((x) => x.artisanId === ctx.artisanId)) {
      const m = f.numero?.match(/-(\d+)$/);
      if (m) maxFromDb = Math.max(maxFromDb, parseInt(m[1], 10) + 1);
    }
    const compteur = Math.max(compteurParam, maxFromDb);
    this.compteur.set(ctx.artisanId, compteur);
    return `FAC-${String(compteur).padStart(5, "0")}`;
  }

  async assignNumero(ctx: TenantContext, id: number, numero: string): Promise<void> {
    this.factureStore = this.factureStore.map((f) =>
      f.id === id && f.artisanId === ctx.artisanId ? { ...f, numero, updatedAt: new Date() } : f,
    );
  }

  async nextNumeroAvoir(ctx: TenantContext): Promise<string> {
    const compteurParam = (this.avoirCompteur.get(ctx.artisanId) ?? 0) + 1;
    let maxFromDb = 0;
    for (const f of this.factureStore.filter((x) => x.artisanId === ctx.artisanId && x.typeDocument === "avoir")) {
      const m = f.numero?.match(/-(\d+)$/);
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

  async listAuditLog(ctx: TenantContext, factureId: number): Promise<AuditLogEntry[]> {
    return this.auditStore
      .filter((a) => a.artisanId === ctx.artisanId && a.entityType === "facture" && a.entityId === factureId)
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
      .map(({ artisanId: _a, ...e }) => e);
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
      nombreRelances: 0,
      regimeTVA: "normal",
    };
    this.factureStore.push(avoir);
    input.lignes.forEach((l, i) => {
      this.lignesStore.push({
        id: ++this.ligneSeq,
        factureId: avoir.id,
        ordre: i,
        articleId: null,
        reference: null,
        designation: l.designation,
        description: l.description,
        quantite: l.quantite,
        unite: l.unite ?? "unité",
        prixUnitaireHT: l.prixUnitaireHT,
        tauxTVA: l.tauxTVA,
        remise: "0.00",
        tvaCategorieId: (l as { tvaCategorieId?: string | null }).tvaCategorieId ?? null,
        montantHT: l.montantHT,
        montantTVA: l.montantTVA,
        montantTTC: l.montantTTC,
        type: "produit",
      });
    });
    return avoir;
  }

  async existsForDevis(ctx: TenantContext, devisId: number): Promise<boolean> {
    return this.factureStore.some(
      (f) => f.artisanId === ctx.artisanId && f.devisId === devisId && f.typeDocument === "facture",
    );
  }

  async createFromDevis(ctx: TenantContext, input: CreateFromDevisInput): Promise<Facture | null> {
    if (!this.ownedClients.has(`${ctx.artisanId}:${input.clientId}`)) return null;
    const totaux = calculerTotaux(input.lignes);
    const now = new Date();
    const facture: Facture = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      clientId: input.clientId,
      devisId: input.devisId,
      numero: input.numero,
      dateFacture: now,
      dateEcheance: null,
      statut: "brouillon",
      typeDocument: "facture",
      factureOrigineId: null,
      objet: input.objet,
      referenceClient: input.referenceClient,
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
      nombreRelances: 0,
      regimeTVA: "normal",
    };
    this.factureStore.push(facture);
    input.lignes.forEach((l) => {
      this.lignesStore.push({
        id: ++this.ligneSeq,
        factureId: facture.id,
        ordre: l.ordre,
        articleId: null,
        reference: l.reference,
        designation: l.designation,
        description: l.description,
        quantite: l.quantite,
        unite: l.unite,
        prixUnitaireHT: l.prixUnitaireHT,
        tauxTVA: l.tauxTVA,
        remise: l.remise ?? "0.00",
        tvaCategorieId: l.tvaCategorieId ?? null,
        montantHT: l.montantHT,
        montantTVA: l.montantTVA,
        montantTTC: l.montantTTC,
        type: l.type as "produit" | "section" | "note",
      });
    });
    return facture;
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
      articleId: isDisplay ? null : (input.articleId ?? null),
      reference: isDisplay ? null : input.reference ?? null,
      designation: input.designation,
      description: input.description ?? null,
      quantite,
      unite: isDisplay ? "unité" : input.unite ?? "unité",
      prixUnitaireHT,
      tauxTVA,
      remise: isDisplay ? "0" : input.remise ?? "0",
      tvaCategorieId: isDisplay ? null : (input.tvaCategorieId ?? null),
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

  withDb(_db: DbClient): FakeFactureRepository {
    return this;
  }

  private recalculerTotaux(factureId: number): void {
    const lignes = this.lignesStore.filter((l) => l.factureId === factureId);
    const totaux = calculerTotaux(lignes);
    this.factureStore = this.factureStore.map((f) =>
      f.id === factureId ? { ...f, totalHT: totaux.totalHT, totalTVA: totaux.totalTVA, totalTTC: totaux.totalTTC, updatedAt: new Date() } : f,
    );
  }
}
