import type { TenantContext } from "../../../shared/tenant";
import type { ExecutionLog, IRapportRepository } from "../application/rapport-repository";
import { computeFinancier } from "../domain/rapport";
import type { CreateRapportInput, RapportPersonnalise, RapportType } from "../domain/rapport";

type MutableRapport = { -readonly [K in keyof RapportPersonnalise]: RapportPersonnalise[K] };

/*
 * Fake in-memory déterministe : rapports + données d'entité (pour `runReport`) + log d'exécutions,
 * scopés par tenant.
 */
export class FakeRapportRepository implements IRapportRepository {
  private seq = 0;
  private rapports: MutableRapport[] = [];
  /** type d'entité → lignes par tenant (pour runReport ; financier dérive des factures). */
  private readonly entites = new Map<string, unknown[]>();
  public executions: ExecutionLog[] = [];

  private key(artisanId: number, type: string): string {
    return `${artisanId}:${type}`;
  }

  seedEntite(artisanId: number, type: RapportType, rows: unknown[]): void {
    this.entites.set(this.key(artisanId, type), rows);
  }

  seedRapport(r: Partial<RapportPersonnalise> & { artisanId: number; nom: string; type: RapportType }): RapportPersonnalise {
    const full: MutableRapport = {
      id: r.id ?? ++this.seq,
      artisanId: r.artisanId,
      nom: r.nom,
      description: r.description ?? null,
      type: r.type,
      filtres: r.filtres ?? null,
      colonnes: r.colonnes ?? null,
      groupement: r.groupement ?? null,
      tri: r.tri ?? null,
      format: r.format ?? "tableau",
      graphiqueType: r.graphiqueType ?? null,
      favori: r.favori ?? false,
      createdAt: r.createdAt ?? new Date(0),
      updatedAt: r.updatedAt ?? new Date(0),
    };
    if (full.id > this.seq) this.seq = full.id;
    this.rapports.push(full);
    return full;
  }

  async list(ctx: TenantContext): Promise<RapportPersonnalise[]> {
    return this.rapports.filter((r) => r.artisanId === ctx.artisanId).map((r) => ({ ...r }));
  }

  async getById(ctx: TenantContext, id: number): Promise<RapportPersonnalise | null> {
    const r = this.rapports.find((x) => x.id === id && x.artisanId === ctx.artisanId);
    return r ? { ...r } : null;
  }

  async create(ctx: TenantContext, input: CreateRapportInput): Promise<RapportPersonnalise> {
    return this.seedRapport({ artisanId: ctx.artisanId, nom: input.nom, description: input.description ?? null, type: input.type, format: input.format ?? "tableau" });
  }

  async remove(ctx: TenantContext, id: number): Promise<boolean> {
    const before = this.rapports.length;
    this.rapports = this.rapports.filter((x) => !(x.id === id && x.artisanId === ctx.artisanId));
    if (this.rapports.length === before) return false;
    this.executions = this.executions.filter((e) => e.rapportId !== id);
    return true;
  }

  async toggleFavori(ctx: TenantContext, id: number): Promise<RapportPersonnalise | null> {
    const r = this.rapports.find((x) => x.id === id && x.artisanId === ctx.artisanId);
    if (!r) return null;
    r.favori = !r.favori;
    return { ...r };
  }

  async runReport(ctx: TenantContext, type: RapportType): Promise<unknown[]> {
    if (type === "financier") {
      const factures = (this.entites.get(this.key(ctx.artisanId, "ventes")) ?? []) as Array<{ statut: string | null; totalTTC: string | null }>;
      return computeFinancier(factures);
    }
    return [...(this.entites.get(this.key(ctx.artisanId, type)) ?? [])];
  }

  async saveExecution(_ctx: TenantContext, log: ExecutionLog): Promise<void> {
    this.executions.push(log);
  }
}
