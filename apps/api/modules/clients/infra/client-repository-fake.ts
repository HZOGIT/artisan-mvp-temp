import type { TenantContext } from "../../../shared/tenant";
import type { IClientRepository } from "../application/client-repository";
import type { FactureEncoursLigne } from "../application/encours";
import { champsFusionnes, type Client, type CreateClientInput, type UpdateClientInput } from "../domain/client";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
 * tenant et les valeurs par défaut PG (`type` → particulier). Aucune fuite cross-tenant.
 */
export class FakeClientRepository implements IClientRepository {
  private store: Client[] = [];
  private seq = 0;
  /** Nombre de documents liés par clientId (injectable pour tester la garde de suppression). */
  private documentsLies = new Map<number, number>();
  /** Lignes de factures injectables (pour tester le wiring de l'encours). */
  private facturesEncours: FactureEncoursLigne[] = [];
  /** Ids des clients archivés (soft-delete simulé : exclus de list/search, jamais supprimés). */
  private archived = new Set<number>();

  /** Aide de test : déclare N documents métier liés à un client (garde d'intégrité). */
  setDocumentsLies(clientId: number, n: number): void {
    this.documentsLies.set(clientId, n);
  }

  /** Aide de test : injecte les lignes de factures servant au calcul de l'encours. */
  setFacturesEncours(rows: FactureEncoursLigne[]): void {
    this.facturesEncours = rows;
  }

  async list(ctx: TenantContext): Promise<Client[]> {
    return this.store.filter((c) => c.artisanId === ctx.artisanId && !this.archived.has(c.id));
  }

  async getById(ctx: TenantContext, id: number): Promise<Client | null> {
    return this.store.find((c) => c.id === id && c.artisanId === ctx.artisanId) ?? null;
  }

  async listByIds(ctx: TenantContext, ids: number[]): Promise<Client[]> {
    const set = new Set(ids);
    return this.store.filter((c) => c.artisanId === ctx.artisanId && set.has(c.id));
  }

  async create(ctx: TenantContext, input: CreateClientInput): Promise<Client> {
    const now = new Date();
    const c: Client = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      nom: input.nom,
      prenom: input.prenom ?? null,
      email: input.email ?? null,
      telephone: input.telephone ?? null,
      adresse: input.adresse ?? null,
      codePostal: input.codePostal ?? null,
      ville: input.ville ?? null,
      adresseFacturation: input.adresseFacturation ?? null,
      codePostalFacturation: input.codePostalFacturation ?? null,
      villeFacturation: input.villeFacturation ?? null,
      type: input.type ?? "particulier",
      raisonSociale: input.raisonSociale ?? null,
      siret: input.siret ?? null,
      numeroTVA: input.numeroTVA ?? null,
      etiquettes: input.etiquettes ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(c);
    return c;
  }

  async update(ctx: TenantContext, id: number, input: UpdateClientInput): Promise<Client | null> {
    const c = await this.getById(ctx, id);
    if (!c) return null;
    const updated: Client = { ...c, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const c = await this.getById(ctx, id);
    if (!c) return false;
    this.store = this.store.filter((x) => x.id !== id);
    return true;
  }

  async countDocumentsLies(ctx: TenantContext, clientId: number): Promise<number> {
    /** Le client doit appartenir au tenant ; sinon 0 (rien de visible cross-tenant). */
    const c = await this.getById(ctx, clientId);
    if (!c) return 0;
    return this.documentsLies.get(clientId) ?? 0;
  }

  async fusionner(ctx: TenantContext, survivantId: number, doublonId: number): Promise<Client | null> {
    const survivant = await this.getById(ctx, survivantId);
    const doublon = await this.getById(ctx, doublonId);
    /** Cloisonnement tenant : les deux doivent appartenir au tenant, sinon rien n'est touché. */
    if (!survivant || !doublon) return null;
    /** Le double in-memory n'a pas les tables liées : on simule complétion des champs + archivage. */
    const maj = champsFusionnes(survivant, doublon);
    const fusionne: Client = { ...survivant, ...maj, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === survivantId ? fusionne : x));
    this.archived.add(doublonId);
    return fusionne;
  }

  async search(ctx: TenantContext, query: string): Promise<Client[]> {
    /*
     * Substring case-insensitive sur les mêmes champs ; `includes` traite `%`/`_` comme des
     * littéraux → parité avec le LIKE échappé du repo réel (pas d'injection de wildcard).
     */
    const q = query.toLowerCase();
    return this.store.filter(
      (c) =>
        c.artisanId === ctx.artisanId &&
        !this.archived.has(c.id) &&
        [c.nom, c.prenom, c.email, c.telephone].some((f) => (f ?? "").toLowerCase().includes(q)),
    );
  }

  async listFacturesPourEncours(_ctx: TenantContext, clientId?: number): Promise<FactureEncoursLigne[]> {
    return clientId != null
      ? this.facturesEncours.filter((f) => f.clientId === clientId)
      : this.facturesEncours;
  }
}
