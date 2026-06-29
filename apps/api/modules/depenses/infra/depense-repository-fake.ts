import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDepenseRepository, DepenseRefKind } from "../application/depense-repository";
import type { Depense, CreateDepenseInput, UpdateDepenseInput, DoublonParams, DepenseDoublon, DepenseStats } from "../domain/depense";
import { computeNextNumero } from "../application/numero";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
 * tenant et les valeurs par défaut PG (statut brouillon, montants/flags). ⚠️ `update` ne touche
 * pas statut/rembourse/dateRemboursement (réservés au workflow).
 */
export class FakeDepenseRepository implements IDepenseRepository {
  private store: Depense[] = [];
  private seq = 0;
  /** FK appartenant à un tenant (injectable) : clé `${artisanId}:${kind}:${id}` → owned. */
  private ownedRefs = new Set<string>();

  /*
   * Aide de test : déclare qu'une ressource référencée (chantier/intervention/client) appartient
   * au tenant. Sert à valider la garde anti-IDOR-FK des use-cases d'écriture.
   */
  registerRef(artisanId: number, kind: DepenseRefKind, id: number): void {
    this.ownedRefs.add(`${artisanId}:${kind}:${id}`);
  }

  async list(ctx: TenantContext): Promise<Depense[]> {
    return this.store.filter((d) => d.artisanId === ctx.artisanId);
  }

  async realisesParCategorie(ctx: TenantContext, mois: string): Promise<{ categorie: string; reel: string }[]> {
    const sums = new Map<string, number>();
    for (const d of this.store) {
      if (d.artisanId !== ctx.artisanId || !d.dateDepense.startsWith(`${mois}-`)) continue;
      sums.set(d.categorie, (sums.get(d.categorie) ?? 0) + Number(d.montantTtc));
    }
    return Array.from(sums.entries(), ([categorie, reel]) => ({ categorie, reel: String(reel) }));
  }

  async getById(ctx: TenantContext, id: number): Promise<Depense | null> {
    return this.store.find((d) => d.id === id && d.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateDepenseInput): Promise<Depense> {
    const now = new Date();
    const d: Depense = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      userId: input.userId,
      numero: input.numero,
      dateDepense: input.dateDepense,
      fournisseur: input.fournisseur ?? null,
      categorie: input.categorie,
      sousCategorie: input.sousCategorie ?? null,
      description: input.description ?? null,
      montantHt: input.montantHt,
      tauxTva: input.tauxTva ?? "20",
      montantTva: input.montantTva ?? null,
      montantTtc: input.montantTtc,
      modePaiement: input.modePaiement ?? "carte",
      statut: "brouillon",
      remboursable: input.remboursable ?? true,
      rembourse: false,
      dateRemboursement: null,
      chantierId: input.chantierId ?? null,
      interventionId: input.interventionId ?? null,
      clientId: input.clientId ?? null,
      notes: input.notes ?? null,
      justificatifUrl: input.justificatifUrl ?? null,
      justificatifNom: input.justificatifNom ?? null,
      ocrBrut: null,
      ocrTraite: false,
      recurrente: input.recurrente ?? false,
      frequenceRecurrence: input.frequenceRecurrence ?? null,
      prochaineOccurrence: input.prochaineOccurrence ?? null,
      tvaDeductible: input.tvaDeductible ?? true,
      coeffDeductibilite: input.coeffDeductibilite ?? "100",
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(d);
    return d;
  }

  async update(ctx: TenantContext, id: number, input: UpdateDepenseInput): Promise<Depense | null> {
    const d = await this.getById(ctx, id);
    if (!d) return null;
    /** `input` n'a pas statut/rembourse/dateRemboursement → ces champs restent intacts. */
    const updated: Depense = { ...d, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const d = await this.getById(ctx, id);
    if (!d) return false;
    this.store = this.store.filter((x) => x.id !== id);
    return true;
  }

  async ownsRef(ctx: TenantContext, kind: DepenseRefKind, id: number): Promise<boolean> {
    return this.ownedRefs.has(`${ctx.artisanId}:${kind}:${id}`);
  }

  async nextNumero(ctx: TenantContext): Promise<string> {
    /** Dernière dépense du tenant (plus grand id) → incrément du suffixe. */
    const last = this.store
      .filter((d) => d.artisanId === ctx.artisanId)
      .reduce<Depense | null>((acc, d) => (acc && acc.id > d.id ? acc : d), null);
    return computeNextNumero(last?.numero ?? "");
  }

  async findDoublons(ctx: TenantContext, params: DoublonParams): Promise<DepenseDoublon[]> {
    const target = (params.fournisseur ?? "") || "";
    return this.store
      .filter(
        (d) =>
          d.artisanId === ctx.artisanId &&
          Math.abs(Number(d.montantTtc) - params.montantTtc) < 0.01 &&
          d.dateDepense === params.dateDepense &&
          (d.fournisseur ?? "") === target &&
          (params.excludeId ? d.id !== params.excludeId : true),
      )
      .sort((x, z) => (x.dateDepense < z.dateDepense ? 1 : x.dateDepense > z.dateDepense ? -1 : z.id - x.id))
      .slice(0, 10)
      .map((d) => ({
        id: d.id,
        numero: d.numero,
        montantTtc: d.montantTtc,
        dateDepense: d.dateDepense,
        fournisseur: d.fournisseur ?? null,
        description: d.description ?? null,
        statut: d.statut,
      }));
  }

  async setOcr(ctx: TenantContext, id: number, data: unknown): Promise<void> {
    this.store = this.store.map((d) =>
      d.id === id && d.artisanId === ctx.artisanId ? { ...d, ocrBrut: JSON.stringify(data ?? {}).slice(0, 5000), ocrTraite: true } : d,
    );
  }

  async listRecurrentesDues(ctx: TenantContext, asOf: string): Promise<Depense[]> {
    return this.store.filter(
      (d) =>
        d.artisanId === ctx.artisanId &&
        d.recurrente &&
        d.prochaineOccurrence !== null &&
        d.frequenceRecurrence !== null &&
        d.prochaineOccurrence <= asOf,
    );
  }

  /*
   * ⚠️ Version simplifiée (suffisante pour les tests de use-case : défaut du mois + délégation).
   * L'agrégation fidèle est validée par le test DB du repo Drizzle.
   */
  withDb(_db: DbClient): FakeDepenseRepository {
    return this;
  }

  async getStats(ctx: TenantContext, mois: string): Promise<DepenseStats> {
    const dansMois = this.store.filter((d) => d.artisanId === ctx.artisanId && d.dateDepense.slice(0, 7) === mois);
    const totalMois = dansMois.reduce((s, d) => s + Number(d.montantTtc), 0);
    return {
      mois,
      totalMois,
      nbDepensesMois: dansMois.length,
      aRembourser: 0,
      tvaRecuperable: 0,
      totalMoisPrecedent: 0,
      variation: null,
      totalAnnee: 0,
      parCategorie: [],
      topDepenses: [],
      topFournisseurs: [],
      parMois: [],
    };
  }
}
