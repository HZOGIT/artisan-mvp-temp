import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runJob } from "../../../platform/scheduler/scheduler-runner";
import { JobRunRepositoryDrizzle } from "../../../platform/scheduler/job-run-repository-drizzle";
import { makeFacturesRecurrentesJob } from "./factures-recurrentes-job";
import { dailyKey } from "../../../platform/scheduler";
import type { IJobRunRepository, ClaimedRun } from "../../../platform/scheduler/job-run-repository";
import type { IContratRepository } from "./contrat-repository";
import type { ContratFactureGenerator, GenererFactureContratInput, FactureGenereeRef } from "./contrat-facture-generator";
import type { TenantContext } from "../../../shared/tenant";
import type { ContratAFacturerRow } from "./contrat-repository";
import type { Contrat } from "../domain/contrat";
import { createDbClient } from "../../../shared/db";
import type { DbHandle, DbClient } from "../../../shared/db";

/* ── fakes in-memory ── */

class FakeJobRunRepo implements IJobRunRepository {
  private readonly runs = new Map<string, number>();
  private seq = 0;

  async tryClaimRun(jobName: string, periodKey: string): Promise<ClaimedRun | null> {
    const key = `${jobName}:${periodKey}`;
    if (this.runs.has(key)) return null;
    this.runs.set(key, ++this.seq);
    return { id: this.seq };
  }

  async markDone(): Promise<void> {}
  async markFailed(): Promise<void> {}
}

const BASE_CONTRAT: Contrat = {
  id: 1,
  artisanId: 1,
  clientId: 1,
  reference: "CNT-001",
  titre: "Contrat test",
  description: null,
  type: "maintenance",
  montantHT: "100.00",
  tauxTVA: "20",
  periodicite: "mensuel",
  dateDebut: new Date("2025-01-01"),
  dateFin: null,
  reconduction: false,
  preavisResiliation: 30,
  alerteReconductionEnvoyeeLe: null,
  prochainFacturation: new Date("2020-01-01"),
  prochainPassage: null,
  conditionsParticulieres: null,
  statut: "actif",
  notes: null,
  tauxIndexationAnnuel: null,
  dateDerniereRevision: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

class FakeContratRepo implements Pick<IContratRepository, "listAFacturer" | "getById" | "recordFactureRecurrente" | "update"> {
  calls = 0;

  async listAFacturer(_ctx: TenantContext): Promise<ContratAFacturerRow[]> {
    this.calls++;
    return [{ ...BASE_CONTRAT, clientNom: "Client test" }];
  }

  async getById(_ctx: TenantContext, id: number): Promise<Contrat | null> {
    return id === 1 ? { ...BASE_CONTRAT } : null;
  }

  async recordFactureRecurrente(): Promise<void> {}

  async update(): Promise<Contrat | null> {
    return { ...BASE_CONTRAT };
  }
}

class FakeFactureGen implements ContratFactureGenerator {
  calls = 0;

  async genererFactureEmise(_ctx: TenantContext, _input: GenererFactureContratInput): Promise<FactureGenereeRef> {
    this.calls++;
    return { id: this.calls, contratId: 1, periodeDebut: new Date(), periodeFin: new Date() };
  }
}

/* ── L1 : idempotence au niveau job (scheduler) ── */

describe("makeFacturesRecurrentesJob — idempotence scheduler", () => {
  it("exécute la génération au premier tick et retourne done", async () => {
    const jobRunRepo = new FakeJobRunRepo();
    const contratRepo = new FakeContratRepo();
    const factureGen = new FakeFactureGen();

    const job = makeFacturesRecurrentesJob(
      contratRepo as unknown as IContratRepository,
      factureGen,
      async () => [1],
    );

    const now = new Date("2026-06-29T08:00:00Z");
    const result = await runJob(jobRunRepo, job, now);

    expect(result).toBe("done");
    expect(factureGen.calls).toBe(1);
  });

  it("ne génère pas de seconde facture si le tick est rejoué (même jour)", async () => {
    const jobRunRepo = new FakeJobRunRepo();
    const contratRepo = new FakeContratRepo();
    const factureGen = new FakeFactureGen();

    const job = makeFacturesRecurrentesJob(
      contratRepo as unknown as IContratRepository,
      factureGen,
      async () => [1],
    );

    const now = new Date("2026-06-29T08:00:00Z");
    await runJob(jobRunRepo, job, now);
    const second = await runJob(jobRunRepo, job, now);

    expect(second).toBe("skipped");
    expect(factureGen.calls).toBe(1);
    expect(contratRepo.calls).toBe(1);
  });

  it("exécute à nouveau le lendemain (nouvelle période)", async () => {
    const jobRunRepo = new FakeJobRunRepo();
    const contratRepo = new FakeContratRepo();
    const factureGen = new FakeFactureGen();

    const job = makeFacturesRecurrentesJob(
      contratRepo as unknown as IContratRepository,
      factureGen,
      async () => [1],
    );

    await runJob(jobRunRepo, job, new Date("2026-06-29T08:00:00Z"));
    const next = await runJob(jobRunRepo, job, new Date("2026-06-30T08:00:00Z"));

    expect(next).toBe("done");
    expect(factureGen.calls).toBe(2);
  });
});

/* ── L2 : intégration PostgreSQL ── */

describe.skipIf(!process.env.DATABASE_URL)("makeFacturesRecurrentesJob — intégration PG", () => {
  let handle: DbHandle;
  let db: DbClient;

  beforeAll(() => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL requis");
    handle = createDbClient(url);
    db = handle.db;
  });

  afterAll(async () => {
    await handle.close();
  });

  it("claim PG idempotent : second tick même jour = skipped", async () => {
    const jobRunRepo = new JobRunRepositoryDrizzle(db);
    const contratRepo = new FakeContratRepo();
    const factureGen = new FakeFactureGen();

    const job = makeFacturesRecurrentesJob(
      contratRepo as unknown as IContratRepository,
      factureGen,
      async () => [],
    );

    const uniqueDay = `2099-01-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
    const now = new Date(`${uniqueDay}T10:00:00Z`);

    const first = await runJob(jobRunRepo, job, now);
    expect(first).toBe("done");

    const second = await runJob(jobRunRepo, job, now);
    expect(second).toBe("skipped");
  });

  it("key dailyKey correspond bien à la date ISO du jour", () => {
    const d = new Date("2026-06-29T23:30:00Z");
    expect(dailyKey(d)).toBe("2026-06-29");
  });
});
