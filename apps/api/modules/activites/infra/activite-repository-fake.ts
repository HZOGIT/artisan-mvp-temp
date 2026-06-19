import type { TenantContext } from "../../../shared/tenant";
import type { IActiviteRepository } from "../application/activite-repository";
import type { Activite, ActiviteEntiteType, CreateActiviteInput } from "../domain/activite";

type MutableActivite = { -readonly [K in keyof Activite]: Activite[K] };

/*
 * Fake in-memory déterministe (aucun réseau) pour les tests d'use-case. Scoping tenant + appartenance
 * des entités rattachées (`registerEntite`) reproduits fidèlement.
 */
export class FakeActiviteRepository implements IActiviteRepository {
  private seq = 0;
  private activites: MutableActivite[] = [];
  /** clé `${entiteType}:${entiteId}` → artisanId propriétaire (pour ownsEntite). */
  private readonly entiteOwner = new Map<string, number>();

  registerEntite(artisanId: number, entiteType: ActiviteEntiteType, entiteId: number): void {
    this.entiteOwner.set(`${entiteType}:${entiteId}`, artisanId);
  }

  seed(a: Partial<Activite> & { artisanId: number; titre: string; echeance: string }): Activite {
    const full: MutableActivite = {
      id: a.id ?? ++this.seq,
      artisanId: a.artisanId,
      type: a.type ?? "autre",
      titre: a.titre,
      echeance: a.echeance,
      entiteType: a.entiteType ?? "aucun",
      entiteId: a.entiteId ?? null,
      responsableUserId: a.responsableUserId ?? null,
      fait: a.fait ?? false,
      faitAt: a.faitAt ?? null,
      note: a.note ?? null,
      createdAt: a.createdAt ?? new Date(0),
    };
    if (full.id > this.seq) this.seq = full.id;
    this.activites.push(full);
    return full;
  }

  async list(ctx: TenantContext): Promise<Activite[]> {
    return this.activites
      .filter((a) => a.artisanId === ctx.artisanId)
      .sort((x, y) => Number(x.fait) - Number(y.fait) || x.echeance.localeCompare(y.echeance) || x.id - y.id)
      .map((a) => ({ ...a }));
  }

  async create(ctx: TenantContext, input: CreateActiviteInput): Promise<Activite> {
    return this.seed({
      artisanId: ctx.artisanId,
      type: input.type,
      titre: input.titre,
      echeance: input.echeance,
      entiteType: input.entiteType ?? "aucun",
      entiteId: input.entiteId ?? null,
      note: input.note ?? null,
    });
  }

  async ownsEntite(ctx: TenantContext, entiteType: ActiviteEntiteType, entiteId: number): Promise<boolean> {
    if (entiteType === "aucun") return false;
    return this.entiteOwner.get(`${entiteType}:${entiteId}`) === ctx.artisanId;
  }

  async setFait(ctx: TenantContext, id: number, fait: boolean): Promise<boolean> {
    const a = this.activites.find((x) => x.id === id && x.artisanId === ctx.artisanId);
    if (!a) return false;
    a.fait = fait;
    a.faitAt = fait ? new Date(0) : null;
    return true;
  }

  async remove(ctx: TenantContext, id: number): Promise<boolean> {
    const before = this.activites.length;
    this.activites = this.activites.filter((x) => !(x.id === id && x.artisanId === ctx.artisanId));
    return this.activites.length < before;
  }
}
