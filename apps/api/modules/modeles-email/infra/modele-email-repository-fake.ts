import type { TenantContext } from "../../../shared/tenant";
import type { IModeleEmailRepository } from "../application/modele-email-repository";
import type { CreateModeleEmailInput, ModeleEmail, TypeModeleEmail, UpdateModeleEmailInput } from "../domain/modele-email";

// Implémentation in-memory du repository modeles-email (tests sans DB). Reproduit les invariants du
// repo Drizzle : scope par artisanId, artisanId forcé à la création, isDefault défaut false, id
// séquentiel. La règle « un seul isDefault par (artisanId, type) » reste portée par le use-case.
export class FakeModeleEmailRepository implements IModeleEmailRepository {
  private readonly store: ModeleEmail[] = [];
  private seq = 0;

  private scoped(ctx: TenantContext): ModeleEmail[] {
    return this.store.filter((m) => m.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<ModeleEmail[]> {
    return this.scoped(ctx);
  }

  async listByType(ctx: TenantContext, type: TypeModeleEmail): Promise<ModeleEmail[]> {
    return this.scoped(ctx).filter((m) => m.type === type);
  }

  async getById(ctx: TenantContext, id: number): Promise<ModeleEmail | null> {
    return this.scoped(ctx).find((m) => m.id === id) ?? null;
  }

  async create(ctx: TenantContext, input: CreateModeleEmailInput): Promise<ModeleEmail> {
    const now = new Date();
    const modele: ModeleEmail = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      nom: input.nom,
      type: input.type,
      sujet: input.sujet,
      contenu: input.contenu,
      isDefault: input.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(modele);
    return modele;
  }

  async update(ctx: TenantContext, id: number, input: UpdateModeleEmailInput): Promise<ModeleEmail | null> {
    const idx = this.store.findIndex((m) => m.id === id && m.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    const current = this.store[idx];
    const next: ModeleEmail = {
      ...current,
      ...(input.nom !== undefined ? { nom: input.nom } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.sujet !== undefined ? { sujet: input.sujet } : {}),
      ...(input.contenu !== undefined ? { contenu: input.contenu } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      updatedAt: new Date(),
    };
    this.store[idx] = next;
    return next;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const idx = this.store.findIndex((m) => m.id === id && m.artisanId === ctx.artisanId);
    if (idx === -1) return false;
    this.store.splice(idx, 1);
    return true;
  }
}
