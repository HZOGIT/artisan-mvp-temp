import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runJob } from "../../../platform/scheduler/scheduler-runner";
import { JobRunRepositoryDrizzle } from "../../../platform/scheduler/job-run-repository-drizzle";
import { makeDepensesRecurrentesJob, genererDepensesRecurrentes, computeNextOccurrence } from "./depenses-recurrentes-job";
import { dailyKey } from "../../../platform/scheduler";
import type { IJobRunRepository, ClaimedRun } from "../../../platform/scheduler/job-run-repository";
import { FakeDepenseRepository } from "../infra/depense-repository-fake";
import { createDbClient } from "../../../shared/db";
import type { DbHandle, DbClient } from "../../../shared/db";
import type { Depense } from "../domain/depense";

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

const SOURCE: Depense = {
  id: 1,
  artisanId: 42,
  userId: 0,
  numero: "DEP-00001",
  dateDepense: "2026-01-15",
  fournisseur: "EDF",
  categorie: "Énergie",
  sousCategorie: null,
  description: "Facture électricité",
  montantHt: "100.00",
  tauxTva: "20",
  montantTva: "20.00",
  montantTtc: "120.00",
  modePaiement: "prelevement",
  statut: "brouillon",
  remboursable: false,
  rembourse: false,
  dateRemboursement: null,
  chantierId: null,
  interventionId: null,
  clientId: null,
  notes: null,
  justificatifUrl: null,
  justificatifNom: null,
  ocrBrut: null,
  ocrTraite: false,
  recurrente: true,
  frequenceRecurrence: "mensuelle",
  prochaineOccurrence: "2026-06-15",
  tvaDeductible: true,
  coeffDeductibilite: "100",
  createdAt: new Date("2026-01-15"),
  updatedAt: new Date("2026-01-15"),
};

/* ── computeNextOccurrence ── */

describe("computeNextOccurrence", () => {
  it("mensuelle : +1 mois", () => {
    expect(computeNextOccurrence("mensuelle", "2026-06-15")).toBe("2026-07-15");
  });

  it("trimestrielle : +3 mois", () => {
    expect(computeNextOccurrence("trimestrielle", "2026-01-31")).toBe("2026-04-30");
  });

  it("annuelle : +12 mois", () => {
    expect(computeNextOccurrence("annuelle", "2026-02-28")).toBe("2027-02-28");
  });

  it("fin de mois : jan 31 + 1 mois → fév 28", () => {
    expect(computeNextOccurrence("mensuelle", "2026-01-31")).toBe("2026-02-28");
  });
});

function makeRepo(source = SOURCE): FakeDepenseRepository {
  const repo = new FakeDepenseRepository();
  repo["store"].push({ ...source });
  /* ponytail: seq aligné sur le max id du store pour éviter les collisions */
  repo["seq"] = Math.max(...repo["store"].map((d) => d.id));
  return repo;
}

/* ── L1 : idempotence scheduler ── */

describe("makeDepensesRecurrentesJob — idempotence scheduler", () => {
  it("premier tick : génère la copie et retourne done", async () => {
    const jobRunRepo = new FakeJobRunRepo();
    const repo = makeRepo();

    const job = makeDepensesRecurrentesJob({
      repo,
      getArtisanIds: async () => [42],
    });

    const now = new Date("2026-06-29T08:00:00Z");
    const result = await runJob(jobRunRepo, job, now);

    expect(result).toBe("done");
    const all = await repo.list({ artisanId: 42, userId: 0 });
    expect(all).toHaveLength(2);
    const copy = all.find((d) => d.id !== SOURCE.id);
    expect(copy?.dateDepense).toBe("2026-06-29");
    expect(copy?.recurrente).toBe(false);
    expect(copy?.frequenceRecurrence).toBeNull();
  });

  it("second tick même jour : skipped (scheduler claim)", async () => {
    const jobRunRepo = new FakeJobRunRepo();
    const repo = makeRepo();

    const job = makeDepensesRecurrentesJob({
      repo,
      getArtisanIds: async () => [42],
    });

    const now = new Date("2026-06-29T08:00:00Z");
    await runJob(jobRunRepo, job, now);
    const second = await runJob(jobRunRepo, job, now);

    expect(second).toBe("skipped");
    const all = await repo.list({ artisanId: 42, userId: 0 });
    expect(all).toHaveLength(2);
  });

  it("idempotence interne : genererDepensesRecurrentes appelé 2× même jour → 0 doublon", async () => {
    const repo = makeRepo();

    await genererDepensesRecurrentes(repo, [42], new Date("2026-06-29T08:00:00Z"));
    await genererDepensesRecurrentes(repo, [42], new Date("2026-06-29T08:00:00Z"));

    const all = await repo.list({ artisanId: 42, userId: 0 });
    expect(all).toHaveLength(2);
  });

  it("prochaineOccurrence avancée après génération", async () => {
    const repo = makeRepo();

    await genererDepensesRecurrentes(repo, [42], new Date("2026-06-29T08:00:00Z"));

    const source = await repo.getById({ artisanId: 42, userId: 0 }, SOURCE.id);
    expect(source?.prochaineOccurrence).toBe("2026-07-15");
  });

  it("dépense non récurrente ignorée", async () => {
    const repo = makeRepo({ ...SOURCE, recurrente: false });

    await genererDepensesRecurrentes(repo, [42], new Date("2026-06-29T08:00:00Z"));

    const all = await repo.list({ artisanId: 42, userId: 0 });
    expect(all).toHaveLength(1);
  });

  it("lendemain : scheduler peut re-claimer le lendemain", async () => {
    const jobRunRepo = new FakeJobRunRepo();
    const repo = makeRepo();
    const job = makeDepensesRecurrentesJob({ repo, getArtisanIds: async () => [42] });

    const r1 = await runJob(jobRunRepo, job, new Date("2026-06-29T08:00:00Z"));
    expect(r1).toBe("done");
    const r2 = await runJob(jobRunRepo, job, new Date("2026-07-15T08:00:00Z"));
    expect(r2).toBe("done");
  });

  it("génère 2 occurrences sur 2 jours distincts via clock injectable", async () => {
    const repo = makeRepo();
    await genererDepensesRecurrentes(repo, [42], new Date("2026-06-29T00:00:00Z"));
    await genererDepensesRecurrentes(repo, [42], new Date("2026-07-15T00:00:00Z"));

    const all = await repo.list({ artisanId: 42, userId: 0 });
    expect(all).toHaveLength(3);
    const copies = all.filter((d) => !d.recurrente);
    expect(copies.map((d) => d.dateDepense).sort()).toEqual(["2026-06-29", "2026-07-15"]);
  });
});

/* ── L2 : intégration PostgreSQL ── */

describe.skipIf(!process.env.DATABASE_URL)("makeDepensesRecurrentesJob — intégration PG", () => {
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
    const repo = new FakeDepenseRepository();

    const job = makeDepensesRecurrentesJob({
      repo,
      getArtisanIds: async () => [],
    });

    const uniqueDay = `2099-12-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
    const now = new Date(`${uniqueDay}T10:00:00Z`);

    const first = await runJob(jobRunRepo, job, now);
    expect(first).toBe("done");

    const second = await runJob(jobRunRepo, job, now);
    expect(second).toBe("skipped");
  });

  it("clé dailyKey = date ISO du jour", () => {
    const d = new Date("2026-06-29T23:30:00Z");
    expect(dailyKey(d)).toBe("2026-06-29");
  });
});
