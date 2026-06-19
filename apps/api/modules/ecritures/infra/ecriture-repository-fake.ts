import type { TenantContext } from "../../../shared/tenant";
import type { IEcritureRepository } from "../application/ecriture-repository";
import type { EcritureComptable, CreateEcritureInput } from "../domain/ecriture";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
 * tenant (artisanId forcé), les défauts PG (debit/credit "0.00", pointage false) et l'idempotence
 * `deleteByFacture`.
 */
export class FakeEcritureRepository implements IEcritureRepository {
  private store: EcritureComptable[] = [];
  private seq = 0;

  async list(ctx: TenantContext): Promise<EcritureComptable[]> {
    return this.store.filter((e) => e.artisanId === ctx.artisanId);
  }

  async listByFacture(ctx: TenantContext, factureId: number): Promise<EcritureComptable[]> {
    return this.store.filter((e) => e.artisanId === ctx.artisanId && e.factureId === factureId);
  }

  async createMany(ctx: TenantContext, lignes: readonly CreateEcritureInput[]): Promise<EcritureComptable[]> {
    const now = new Date();
    const created = lignes.map((l) => ({
      id: ++this.seq,
      artisanId: ctx.artisanId, // forcé au tenant
      dateEcriture: l.dateEcriture,
      journal: l.journal,
      numeroCompte: l.numeroCompte,
      libelleCompte: l.libelleCompte ?? null,
      libelle: l.libelle,
      pieceRef: l.pieceRef ?? null,
      debit: l.debit ?? "0.00",
      credit: l.credit ?? "0.00",
      factureId: l.factureId ?? null,
      lettrage: l.lettrage ?? null,
      pointage: l.pointage ?? false,
      createdAt: now,
    }));
    this.store.push(...created);
    return created;
  }

  async deleteByFacture(ctx: TenantContext, factureId: number): Promise<number> {
    const before = this.store.length;
    this.store = this.store.filter((e) => !(e.artisanId === ctx.artisanId && e.factureId === factureId));
    return before - this.store.length;
  }

  async deleteByFactureJournal(ctx: TenantContext, factureId: number, journal: EcritureComptable["journal"]): Promise<number> {
    const before = this.store.length;
    this.store = this.store.filter(
      (e) => !(e.artisanId === ctx.artisanId && e.factureId === factureId && e.journal === journal),
    );
    return before - this.store.length;
  }
}
