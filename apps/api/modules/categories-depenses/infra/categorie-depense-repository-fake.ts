import { ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICategorieDepenseRepository } from "../application/categorie-depense-repository";
import type { CategorieDepense, CreateCategorieInput, UpdateCategorieInput } from "../domain/categorie-depense";

// Implémentation in-memory du repository categories-depenses (tests sans DB). Reproduit les
// invariants du repo Drizzle : scope par artisanId, artisanId forcé, défauts, et ⚠️ unicité
// (artisanId, nom) → ConflictError (anti-doublon vérifié en mémoire avant insert/rename).
export class FakeCategorieDepenseRepository implements ICategorieDepenseRepository {
  private readonly store: CategorieDepense[] = [];
  private seq = 0;

  private scoped(ctx: TenantContext): CategorieDepense[] {
    return this.store.filter((c) => c.artisanId === ctx.artisanId);
  }

  // Lève ConflictError si un autre enregistrement du tenant porte déjà `nom`.
  private assertNomUnique(ctx: TenantContext, nom: string, exclureId?: number): void {
    const doublon = this.scoped(ctx).some((c) => c.nom === nom && c.id !== exclureId);
    if (doublon) throw new ConflictError("Une catégorie portant ce nom existe déjà");
  }

  async list(ctx: TenantContext): Promise<CategorieDepense[]> {
    return [...this.scoped(ctx)].sort((a, b) => a.ordre - b.ordre || a.id - b.id);
  }

  async getById(ctx: TenantContext, id: number): Promise<CategorieDepense | null> {
    return this.scoped(ctx).find((c) => c.id === id) ?? null;
  }

  async create(ctx: TenantContext, input: CreateCategorieInput): Promise<CategorieDepense> {
    this.assertNomUnique(ctx, input.nom);
    const categorie: CategorieDepense = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      nom: input.nom,
      couleur: input.couleur ?? "#6366f1",
      icone: input.icone ?? "Receipt",
      compteComptable: input.compteComptable ?? null,
      deductibleTva: input.deductibleTva ?? true,
      deductibleIr: input.deductibleIr ?? true,
      plafondMensuel: input.plafondMensuel ?? null,
      actif: input.actif ?? true,
      ordre: input.ordre ?? 0,
      createdAt: new Date(),
    };
    this.store.push(categorie);
    return categorie;
  }

  async update(ctx: TenantContext, id: number, input: UpdateCategorieInput): Promise<CategorieDepense | null> {
    const idx = this.store.findIndex((c) => c.id === id && c.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    if (input.nom !== undefined) this.assertNomUnique(ctx, input.nom, id);
    const current = this.store[idx];
    const next: CategorieDepense = {
      ...current,
      ...(input.nom !== undefined ? { nom: input.nom } : {}),
      ...(input.couleur !== undefined ? { couleur: input.couleur } : {}),
      ...(input.icone !== undefined ? { icone: input.icone } : {}),
      ...(input.compteComptable !== undefined ? { compteComptable: input.compteComptable } : {}),
      ...(input.deductibleTva !== undefined ? { deductibleTva: input.deductibleTva } : {}),
      ...(input.deductibleIr !== undefined ? { deductibleIr: input.deductibleIr } : {}),
      ...(input.plafondMensuel !== undefined ? { plafondMensuel: input.plafondMensuel } : {}),
      ...(input.actif !== undefined ? { actif: input.actif } : {}),
      ...(input.ordre !== undefined ? { ordre: input.ordre } : {}),
    };
    this.store[idx] = next;
    return next;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const idx = this.store.findIndex((c) => c.id === id && c.artisanId === ctx.artisanId);
    if (idx === -1) return false;
    this.store.splice(idx, 1);
    return true;
  }
}
