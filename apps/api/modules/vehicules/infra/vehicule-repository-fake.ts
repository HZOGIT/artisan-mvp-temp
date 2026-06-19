import type { TenantContext } from "../../../shared/tenant";
import type { IVehiculeRepository } from "../application/vehicule-repository";
import type {
  Vehicule,
  CreateVehiculeInput,
  UpdateVehiculeInput,
  EntretienVehicule,
  CreateEntretienInput,
  AssuranceVehicule,
  CreateAssuranceInput,
  ReleveKilometrage,
  CreateKilometrageInput,
  StatistiquesFlotte,
} from "../domain/vehicule";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
 * scoping tenant : artisanId forcé du contexte, ressource hors tenant invisible.
 */
export class FakeVehiculeRepository implements IVehiculeRepository {
  private vehiculesStore: Vehicule[] = [];
  private entretiensStore: EntretienVehicule[] = [];
  private assurancesStore: AssuranceVehicule[] = [];
  private relevesStore: ReleveKilometrage[] = [];
  private seq = 0;

  async list(ctx: TenantContext): Promise<Vehicule[]> {
    return this.vehiculesStore.filter((v) => v.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Vehicule | null> {
    return this.vehiculesStore.find((v) => v.id === id && v.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateVehiculeInput): Promise<Vehicule> {
    const now = new Date();
    const v: Vehicule = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      immatriculation: input.immatriculation,
      marque: input.marque ?? null,
      modele: input.modele ?? null,
      annee: input.annee ?? null,
      typeCarburant: input.typeCarburant ?? "diesel",
      puissanceFiscale: input.puissanceFiscale ?? null,
      kilometrageActuel: input.kilometrageActuel ?? 0,
      dateAchat: input.dateAchat ?? null,
      prixAchat: input.prixAchat ?? null,
      technicienId: input.technicienId ?? null,
      statut: input.statut ?? "actif",
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.vehiculesStore.push(v);
    return v;
  }

  async update(ctx: TenantContext, id: number, input: UpdateVehiculeInput): Promise<Vehicule | null> {
    const v = await this.getById(ctx, id);
    if (!v) return null;
    const updated: Vehicule = { ...v, ...input, updatedAt: new Date() };
    this.vehiculesStore = this.vehiculesStore.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const v = await this.getById(ctx, id);
    if (!v) return false;
    // Cascade : historique d'abord, puis le véhicule (cohérent avec l'impl Drizzle).
    this.entretiensStore = this.entretiensStore.filter((e) => e.vehiculeId !== id);
    this.assurancesStore = this.assurancesStore.filter((a) => a.vehiculeId !== id);
    this.vehiculesStore = this.vehiculesStore.filter((x) => x.id !== id);
    return true;
  }

  async updateKilometrage(ctx: TenantContext, id: number, kilometrage: number): Promise<Vehicule | null> {
    const v = await this.getById(ctx, id);
    if (!v) return null;
    const km = Math.max(v.kilometrageActuel, kilometrage);
    return this.update(ctx, id, { kilometrageActuel: km });
  }

  async listEntretiens(ctx: TenantContext, vehiculeId: number): Promise<EntretienVehicule[]> {
    if (!(await this.getById(ctx, vehiculeId))) return [];
    return this.entretiensStore.filter((e) => e.vehiculeId === vehiculeId);
  }

  async addEntretien(ctx: TenantContext, vehiculeId: number, input: CreateEntretienInput): Promise<EntretienVehicule | null> {
    if (!(await this.getById(ctx, vehiculeId))) return null;
    const e: EntretienVehicule = {
      id: ++this.seq,
      vehiculeId,
      type: input.type,
      dateEntretien: input.dateEntretien,
      kilometrageEntretien: input.kilometrageEntretien ?? null,
      cout: input.cout ?? null,
      prestataire: input.prestataire ?? null,
      description: input.description ?? null,
      prochainEntretienKm: input.prochainEntretienKm ?? null,
      prochainEntretienDate: input.prochainEntretienDate ?? null,
      facture: input.facture ?? null,
      createdAt: new Date(),
    };
    this.entretiensStore.push(e);
    return e;
  }

  async listEntretiensAVenir(ctx: TenantContext): Promise<EntretienVehicule[]> {
    const today = new Date().toISOString().slice(0, 10);
    const vehiculesDuTenant = new Set(this.vehiculesStore.filter((v) => v.artisanId === ctx.artisanId).map((v) => v.id));
    return this.entretiensStore
      .filter((e) => vehiculesDuTenant.has(e.vehiculeId) && e.prochainEntretienDate !== null && e.prochainEntretienDate >= today)
      .sort((a, b) => (a.prochainEntretienDate ?? "").localeCompare(b.prochainEntretienDate ?? ""));
  }

  async listAssurances(ctx: TenantContext, vehiculeId: number): Promise<AssuranceVehicule[]> {
    if (!(await this.getById(ctx, vehiculeId))) return [];
    return this.assurancesStore.filter((a) => a.vehiculeId === vehiculeId);
  }

  async addAssurance(ctx: TenantContext, vehiculeId: number, input: CreateAssuranceInput): Promise<AssuranceVehicule | null> {
    if (!(await this.getById(ctx, vehiculeId))) return null;
    const now = new Date();
    const a: AssuranceVehicule = {
      id: ++this.seq,
      vehiculeId,
      compagnie: input.compagnie,
      numeroContrat: input.numeroContrat ?? null,
      typeAssurance: input.typeAssurance ?? "tiers",
      dateDebut: input.dateDebut,
      dateFin: input.dateFin,
      primeAnnuelle: input.primeAnnuelle ?? null,
      franchise: input.franchise ?? null,
      document: input.document ?? null,
      alerteEnvoyee: false,
      createdAt: now,
      updatedAt: now,
    };
    this.assurancesStore.push(a);
    return a;
  }

  async listAssurancesExpirant(ctx: TenantContext, joursAvant: number): Promise<AssuranceVehicule[]> {
    const today = new Date().toISOString().slice(0, 10);
    const limite = new Date(Date.now() + joursAvant * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const vehiculesDuTenant = new Set(this.vehiculesStore.filter((v) => v.artisanId === ctx.artisanId).map((v) => v.id));
    return this.assurancesStore
      .filter((a) => vehiculesDuTenant.has(a.vehiculeId) && a.dateFin >= today && a.dateFin <= limite)
      .sort((x, y) => x.dateFin.localeCompare(y.dateFin));
  }

  async addKilometrage(ctx: TenantContext, vehiculeId: number, input: CreateKilometrageInput): Promise<ReleveKilometrage | null> {
    const v = await this.getById(ctx, vehiculeId);
    if (!v) return null;
    const releve: ReleveKilometrage = {
      id: ++this.seq,
      vehiculeId,
      technicienId: input.technicienId ?? null,
      kilometrage: input.kilometrage,
      dateReleve: input.dateReleve,
      motif: input.motif ?? null,
      createdAt: new Date(),
    };
    this.relevesStore.push(releve);
    await this.update(ctx, vehiculeId, { kilometrageActuel: Math.max(v.kilometrageActuel, input.kilometrage) });
    return releve;
  }

  async getHistoriqueKilometrage(ctx: TenantContext, vehiculeId: number): Promise<ReleveKilometrage[]> {
    if (!(await this.getById(ctx, vehiculeId))) return [];
    return this.relevesStore
      .filter((r) => r.vehiculeId === vehiculeId)
      .sort((a, b) => b.dateReleve.localeCompare(a.dateReleve) || b.id - a.id);
  }

  async getStatistiquesFlotte(ctx: TenantContext): Promise<StatistiquesFlotte> {
    const vehs = this.vehiculesStore.filter((v) => v.artisanId === ctx.artisanId);
    const ids = new Set(vehs.map((v) => v.id));
    const year = new Date().getFullYear();
    const today = new Date().toISOString().slice(0, 10);
    const lim = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const coutEntretienAnneeEnCours = this.entretiensStore
      .filter((e) => ids.has(e.vehiculeId) && e.dateEntretien >= `${year}-01-01` && e.dateEntretien <= `${year}-12-31`)
      .reduce((s, e) => s + Number(e.cout ?? 0), 0);
    const assurancesAExpirer = this.assurancesStore.filter(
      (a) => ids.has(a.vehiculeId) && a.dateFin >= today && a.dateFin <= lim,
    ).length;
    return {
      nbVehicules: vehs.length,
      nbActifs: vehs.filter((v) => v.statut === "actif").length,
      nbEnMaintenance: vehs.filter((v) => v.statut === "en_maintenance").length,
      kmTotalFlotte: vehs.reduce((s, v) => s + (v.kilometrageActuel ?? 0), 0),
      coutEntretienAnneeEnCours,
      assurancesAExpirer,
    };
  }
}
