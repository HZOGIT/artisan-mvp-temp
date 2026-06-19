import type { TenantContext } from "../../../shared/tenant";
import type { IDevisOptionRepository } from "../application/devis-option-repository";
import type { CreateDevisOptionInput, DevisOption } from "../domain/devis-option";

/*
 * Fake in-memory déterministe (aucun réseau) pour les tests d'use-case. Reproduit l'anti-IDOR du
 * repository réel : l'appartenance est portée par le DEVIS parent (`devisOwner`), pas par l'option.
 * Toute opération sur un devis/option dont le devis n'est pas possédé renvoie le sentinel null/false.
 * Vue mutable interne (DevisOption est readonly côté domaine ; le fake mute selectionnee/dateSelection).
 */
type MutableOption = { -readonly [K in keyof DevisOption]: DevisOption[K] };

export class FakeDevisOptionRepository implements IDevisOptionRepository {
  private seq = 0;
  private options: MutableOption[] = [];
  /** devisId → artisanId propriétaire. */
  private readonly devisOwner = new Map<number, number>();

  /** Déclare un devis appartenant à un artisan (équiv. d'une ligne `devis` sous RLS). */
  registerDevis(artisanId: number, devisId: number): void {
    this.devisOwner.set(devisId, artisanId);
  }

  /** Sème une option existante (utile pour tester remove/select/convertir). */
  seedOption(opt: Partial<DevisOption> & { devisId: number; nom: string }): DevisOption {
    const full: MutableOption = {
      id: opt.id ?? ++this.seq,
      devisId: opt.devisId,
      nom: opt.nom,
      description: opt.description ?? null,
      ordre: opt.ordre ?? 1,
      totalHT: opt.totalHT ?? "0.00",
      totalTVA: opt.totalTVA ?? "0.00",
      totalTTC: opt.totalTTC ?? "0.00",
      recommandee: opt.recommandee ?? false,
      selectionnee: opt.selectionnee ?? false,
      dateSelection: opt.dateSelection ?? null,
      createdAt: opt.createdAt ?? new Date(0),
      updatedAt: opt.updatedAt ?? new Date(0),
    };
    if (full.id > this.seq) this.seq = full.id;
    this.options.push(full);
    return full;
  }

  private owns(ctx: TenantContext, devisId: number): boolean {
    return this.devisOwner.get(devisId) === ctx.artisanId;
  }

  private ownedOption(ctx: TenantContext, optionId: number): MutableOption | null {
    const opt = this.options.find((o) => o.id === optionId);
    if (!opt || !this.owns(ctx, opt.devisId)) return null;
    return opt;
  }

  async listByDevis(ctx: TenantContext, devisId: number): Promise<DevisOption[] | null> {
    if (!this.owns(ctx, devisId)) return null;
    return this.options
      .filter((o) => o.devisId === devisId)
      .sort((a, b) => a.ordre - b.ordre || a.id - b.id)
      .map((o) => ({ ...o }));
  }

  async create(ctx: TenantContext, input: CreateDevisOptionInput): Promise<DevisOption | null> {
    if (!this.owns(ctx, input.devisId)) return null;
    return this.seedOption({
      devisId: input.devisId,
      nom: input.nom,
      description: input.description ?? null,
      ordre: input.ordre ?? 1,
      recommandee: input.recommandee ?? false,
    });
  }

  async remove(ctx: TenantContext, optionId: number): Promise<boolean> {
    if (!this.ownedOption(ctx, optionId)) return false;
    this.options = this.options.filter((o) => o.id !== optionId);
    return true;
  }

  async select(ctx: TenantContext, optionId: number): Promise<DevisOption | null> {
    const opt = this.ownedOption(ctx, optionId);
    if (!opt) return null;
    for (const o of this.options) {
      if (o.devisId === opt.devisId) o.selectionnee = o.id === optionId;
    }
    opt.dateSelection = new Date(0);
    return { ...opt };
  }

  async convertirEnDevis(ctx: TenantContext, optionId: number): Promise<boolean> {
    const opt = this.ownedOption(ctx, optionId);
    if (!opt) return false;
    for (const o of this.options) {
      if (o.devisId === opt.devisId) o.selectionnee = o.id === optionId;
    }
    return true;
  }
}
