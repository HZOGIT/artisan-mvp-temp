import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runJob } from "./scheduler-runner";
import { JobRegistry } from "./job-registry";
import type { IJobRunRepository, ClaimedRun } from "./job-run-repository";
import { JobRunRepositoryDrizzle } from "./job-run-repository-drizzle";
import { dailyKey, monthlyKey, weeklyKey } from "./scheduler-types";
import { createDbClient } from "../../shared/db";
import type { DbHandle, DbClient } from "../../shared/db";
import type { JobDefinition } from "./scheduler-types";

/* ── helpers in-memory ── */

class FakeJobRunRepository implements IJobRunRepository {
  private readonly runs = new Map<string, number>();
  private seq = 0;
  readonly statuses = new Map<number, string>();

  async tryClaimRun(jobName: string, periodKey: string): Promise<ClaimedRun | null> {
    const key = `${jobName}:${periodKey}`;
    if (this.runs.has(key)) return null;
    const id = ++this.seq;
    this.runs.set(key, id);
    this.statuses.set(id, "running");
    return { id };
  }

  async markDone(id: number): Promise<void> {
    this.statuses.set(id, "done");
  }

  async markFailed(id: number, _at: Date, msg: string): Promise<void> {
    this.statuses.set(id, `failed:${msg}`);
  }
}

/* ── L1 unit tests (in-memory) ── */

describe("runJob — idempotence", () => {
  it("exécute le job et retourne done au premier appel", async () => {
    const repo = new FakeJobRunRepository();
    let calls = 0;
    const job: JobDefinition = {
      name: "test-job",
      periodKey: dailyKey,
      run: async () => { calls++; },
    };
    const now = new Date("2026-06-29T10:00:00Z");
    const result = await runJob(repo, job, now);
    expect(result).toBe("done");
    expect(calls).toBe(1);
  });

  it("skip si la période est déjà réclamée (rejouer un tick = no double)", async () => {
    const repo = new FakeJobRunRepository();
    let calls = 0;
    const job: JobDefinition = {
      name: "test-job",
      periodKey: dailyKey,
      run: async () => { calls++; },
    };
    const now = new Date("2026-06-29T10:00:00Z");
    await runJob(repo, job, now);
    const result = await runJob(repo, job, now);
    expect(result).toBe("skipped");
    expect(calls).toBe(1);
  });

  it("marque failed si le handler lève une erreur", async () => {
    const repo = new FakeJobRunRepository();
    const job: JobDefinition = {
      name: "error-job",
      periodKey: dailyKey,
      run: async () => { throw new Error("boom"); },
    };
    const now = new Date("2026-06-29T10:00:00Z");
    const result = await runJob(repo, job, now);
    expect(result).toBe("failed");
    expect([...repo.statuses.values()].some((s) => s.startsWith("failed:"))).toBe(true);
  });

  it("deux périodes différentes = deux exécutions indépendantes", async () => {
    const repo = new FakeJobRunRepository();
    let calls = 0;
    const job: JobDefinition = {
      name: "daily-job",
      periodKey: dailyKey,
      run: async () => { calls++; },
    };
    await runJob(repo, job, new Date("2026-06-28T10:00:00Z"));
    await runJob(repo, job, new Date("2026-06-29T10:00:00Z"));
    expect(calls).toBe(2);
  });

  it("deux jobs différents avec même période = deux exécutions indépendantes", async () => {
    const repo = new FakeJobRunRepository();
    let callsA = 0;
    let callsB = 0;
    const now = new Date("2026-06-29T10:00:00Z");
    await runJob(repo, { name: "job-a", periodKey: dailyKey, run: async () => { callsA++; } }, now);
    await runJob(repo, { name: "job-b", periodKey: dailyKey, run: async () => { callsB++; } }, now);
    expect(callsA).toBe(1);
    expect(callsB).toBe(1);
  });
});

describe("JobRegistry — runAll", () => {
  it("exécute tous les jobs enregistrés", async () => {
    const repo = new FakeJobRunRepository();
    const registry = new JobRegistry(repo);
    const results: string[] = [];
    registry.register({ name: "a", periodKey: dailyKey, run: async () => { results.push("a"); } });
    registry.register({ name: "b", periodKey: dailyKey, run: async () => { results.push("b"); } });
    await registry.runAll(new Date("2026-06-29T00:00:00Z"));
    expect(results.sort()).toEqual(["a", "b"]);
  });
});

describe("helpers de clé de période", () => {
  it("dailyKey", () => {
    expect(dailyKey(new Date("2026-06-29T23:59:00Z"))).toBe("2026-06-29");
  });

  it("monthlyKey", () => {
    expect(monthlyKey(new Date("2026-06-01T00:00:00Z"))).toBe("2026-06");
  });

  it("weeklyKey — semaine ISO 26", () => {
    expect(weeklyKey(new Date("2026-06-22T00:00:00Z"))).toBe("2026-W26");
  });
});

/* ── L2 integration tests (PostgreSQL) ── */

describe.skipIf(!process.env.DATABASE_URL)("JobRunRepositoryDrizzle — intégration PG", () => {
  let handle: DbHandle;
  let db: DbClient;

  beforeAll(() => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL requis pour les tests L2");
    handle = createDbClient(url);
    db = handle.db;
  });

  afterAll(async () => {
    await handle.close();
  });

  it("tryClaimRun retourne un id au premier appel", async () => {
    const repo = new JobRunRepositoryDrizzle(db);
    const name = `test-pg-${Date.now()}`;
    const period = dailyKey(new Date());
    const result = await repo.tryClaimRun(name, period, new Date());
    expect(result).not.toBeNull();
    expect(typeof result!.id).toBe("number");
  });

  it("tryClaimRun retourne null au deuxième appel (même job+période)", async () => {
    const repo = new JobRunRepositoryDrizzle(db);
    const name = `test-pg-idem-${Date.now()}`;
    const period = dailyKey(new Date());
    const first = await repo.tryClaimRun(name, period, new Date());
    expect(first).not.toBeNull();
    const second = await repo.tryClaimRun(name, period, new Date());
    expect(second).toBeNull();
  });

  it("markDone met à jour le statut", async () => {
    const repo = new JobRunRepositoryDrizzle(db);
    const name = `test-pg-done-${Date.now()}`;
    const period = dailyKey(new Date());
    const claimed = await repo.tryClaimRun(name, period, new Date());
    expect(claimed).not.toBeNull();
    await expect(repo.markDone(claimed!.id, new Date())).resolves.toBeUndefined();
  });

  it("markFailed met à jour le statut", async () => {
    const repo = new JobRunRepositoryDrizzle(db);
    const name = `test-pg-fail-${Date.now()}`;
    const period = dailyKey(new Date());
    const claimed = await repo.tryClaimRun(name, period, new Date());
    expect(claimed).not.toBeNull();
    await expect(repo.markFailed(claimed!.id, new Date(), "erreur test")).resolves.toBeUndefined();
  });
});
