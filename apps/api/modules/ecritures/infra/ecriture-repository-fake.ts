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
  private numSeq = 0;

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
      /** forcé au tenant */
      artisanId: ctx.artisanId,
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
      statut: "brouillon" as const,
      ecritureNum: null,
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

  async deleteByJournalPieceRef(ctx: TenantContext, journal: EcritureComptable["journal"], pieceRef: string): Promise<number> {
    const before = this.store.length;
    this.store = this.store.filter(
      (e) => !(e.artisanId === ctx.artisanId && e.journal === journal && e.pieceRef === pieceRef),
    );
    return before - this.store.length;
  }

  async hasValidatedEcritures(ctx: TenantContext, factureId: number): Promise<boolean> {
    return this.store.some(
      (e) => e.artisanId === ctx.artisanId && e.factureId === factureId && e.statut === "validee",
    );
  }

  async validateByFacture(ctx: TenantContext, factureId: number): Promise<number> {
    const journaux = Array.from(new Set(
      this.store
        .filter((e) => e.artisanId === ctx.artisanId && e.factureId === factureId && e.statut === "brouillon")
        .map((e) => e.journal),
    ));
    const numParJournal = new Map(journaux.map((j) => [j, ++this.numSeq]));
    let count = 0;
    this.store = this.store.map((e) => {
      if (e.artisanId === ctx.artisanId && e.factureId === factureId && e.statut === "brouillon") {
        count++;
        return { ...e, statut: "validee" as const, ecritureNum: numParJournal.get(e.journal) ?? null };
      }
      return e;
    });
    return count;
  }
}
