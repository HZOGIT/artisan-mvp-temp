import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { createRevisionIndexationJob } from "./revision-indexation-job";
import { runJob } from "../../../platform/scheduler/scheduler-runner";
import { FakeContratRepository } from "../infra/contrat-repository-fake";
import { ContratRepositoryDrizzle } from "../infra/contrat-repository-drizzle";
import type { IJobRunRepository, ClaimedRun } from "../../../platform/scheduler/job-run-repository";

class FakeJobRunRepository implements IJobRunRepository {
  private readonly runs = new Map<string, number>();
  private seq = 0;

  async tryClaimRun(jobName: string, period: string): Promise<ClaimedRun | null> {
    const key = `${jobName}:${period}`;
    if (this.runs.has(key)) return null;
    const id = ++this.seq;
    this.runs.set(key, id);
    return { id };
  }

  async markDone(): Promise<void> {}
  async markFailed(): Promise<void> {}
}

/** Aujourd'hui = 30 juin 2026 pour tous les tests fake. */
const TODAY = new Date("2026-06-30T10:00:00Z");

/** Contrat démarré le 30 juin de l'an passé → anniversaire atteint aujourd'hui. */
const DATE_DEBUT_ELIGIBLE = new Date("2025-06-30T00:00:00Z");

/** Contrat démarré le 15 août → anniversaire pas encore atteint au 30 juin. */
const DATE_DEBUT_FUTUR = new Date("2025-08-15T00:00:00Z");

const base = (over: object = {}) => ({
  clientId: 100,
  titre: "Entretien annuel",
  montantHT: "300.00",
  periodicite: "annuel" as const,
  dateDebut: DATE_DEBUT_ELIGIBLE,
  tauxIndexationAnnuel: "3",
  ...over,
});

describe("revision-indexation-job (L1 — fakes)", () => {
  it("contrat éligible à l'anniversaire → révisé une fois", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100);
    const contrat = await repo.create({ artisanId: 1, userId: 0 }, base(), "CTR-00001");

    const job = createRevisionIndexationJob({ listArtisanIds: async () => [1], contratRepo: repo, getToday: () => TODAY });
    await runJob(new FakeJobRunRepository(), job, TODAY);

    const revised = await repo.getById({ artisanId: 1, userId: 0 }, contrat.id);
    expect(revised?.montantHT).toBe("309.00");
    expect(revised?.dateDerniereRevision).not.toBeNull();
  });

  it("rejouer le job → pas de double indexation (ConflictError attrapée)", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100);
    const contrat = await repo.create({ artisanId: 1, userId: 0 }, base(), "CTR-00001");

    const job = createRevisionIndexationJob({ listArtisanIds: async () => [1], contratRepo: repo, getToday: () => TODAY });
    await runJob(new FakeJobRunRepository(), job, TODAY);
    const montantApres1 = (await repo.getById({ artisanId: 1, userId: 0 }, contrat.id))!.montantHT;

    /* 2e exécution (nouveau jobRepo pour bypass le claim) */
    await runJob(new FakeJobRunRepository(), job, TODAY);
    const montantApres2 = (await repo.getById({ artisanId: 1, userId: 0 }, contrat.id))!.montantHT;

    expect(montantApres1).toBe(montantApres2);
  });

  it("contrat suspendu → ignoré", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100);
    const contrat = await repo.create({ artisanId: 1, userId: 0 }, base(), "CTR-00001");
    await repo.setStatut({ artisanId: 1, userId: 0 }, contrat.id, "suspendu");

    const job = createRevisionIndexationJob({ listArtisanIds: async () => [1], contratRepo: repo, getToday: () => TODAY });
    await runJob(new FakeJobRunRepository(), job, TODAY);

    const after = await repo.getById({ artisanId: 1, userId: 0 }, contrat.id);
    expect(after?.montantHT).toBe("300.00");
    expect(after?.dateDerniereRevision).toBeNull();
  });

  it("contrat sans taux d'indexation → ignoré", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100);
    const contrat = await repo.create({ artisanId: 1, userId: 0 }, base({ tauxIndexationAnnuel: null }), "CTR-00001");

    const job = createRevisionIndexationJob({ listArtisanIds: async () => [1], contratRepo: repo, getToday: () => TODAY });
    await runJob(new FakeJobRunRepository(), job, TODAY);

    const after = await repo.getById({ artisanId: 1, userId: 0 }, contrat.id);
    expect(after?.montantHT).toBe("300.00");
  });

  it("anniversaire pas encore atteint → ignoré", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100);
    const contrat = await repo.create({ artisanId: 1, userId: 0 }, base({ dateDebut: DATE_DEBUT_FUTUR }), "CTR-00001");

    const job = createRevisionIndexationJob({ listArtisanIds: async () => [1], contratRepo: repo, getToday: () => TODAY });
    await runJob(new FakeJobRunRepository(), job, TODAY);

    const after = await repo.getById({ artisanId: 1, userId: 0 }, contrat.id);
    expect(after?.montantHT).toBe("300.00");
  });

  it("liste artisans vide → job done, aucune révision", async () => {
    const job = createRevisionIndexationJob({ listArtisanIds: async () => [], contratRepo: new FakeContratRepository(), getToday: () => TODAY });
    const result = await runJob(new FakeJobRunRepository(), job, TODAY);
    expect(result).toBe("done");
  });
});

/* ── Tests d'intégration PG (skip si pas de DATABASE_URL) ── */

/** Plage d'ids réservée à ce fichier — évite les collisions entre tests parallèles. */
const ART = 9947001;

const URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL ?? (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

describe.skipIf(!URL)("revision-indexation-job — intégration PG", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const drizzleRepo = new ContratRepositoryDrizzle(app.db);
  let contratId = 0;

  const cleanup = async () => {
    await admin.query('delete from contrats_maintenance where "artisanId" = $1', [ART]);
    await admin.query('delete from clients where "artisanId" = $1', [ART]);
  };

  beforeAll(async () => {
    await cleanup();
    const { rows: [client] } = await admin.query<{ id: number }>(
      'insert into clients ("artisanId", nom) values ($1, $2) returning id',
      [ART, "Client Indexation PG"],
    );
    const { rows: [contrat] } = await admin.query<{ id: number }>(
      `insert into contrats_maintenance
         ("artisanId","clientId",titre,"montantHT",periodicite,"dateDebut","tauxIndexationAnnuel",reference,statut,type)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [ART, client.id, "Contrat PG Indexation", "500.00", "annuel", new Date("2025-06-30"), "4", "CTR-IDX-001", "actif", "entretien"],
    );
    contratId = contrat.id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("1er passage → montantHT révisé en base", async () => {
    const job = createRevisionIndexationJob({
      listArtisanIds: async () => [ART],
      contratRepo: drizzleRepo,
      getToday: () => new Date("2026-06-30T10:00:00Z"),
    });
    const result = await runJob(new FakeJobRunRepository(), job, new Date("2026-06-30T10:00:00Z"));
    expect(result).toBe("done");

    const { rows } = await admin.query<{ montantHT: string; dateDerniereRevision: Date }>(
      'select "montantHT", "dateDerniereRevision" from contrats_maintenance where id = $1',
      [contratId],
    );
    expect(parseFloat(rows[0].montantHT)).toBeCloseTo(520, 1);
    expect(rows[0].dateDerniereRevision).not.toBeNull();
  });

  it("2e passage → pas de double indexation (garde SQL)", async () => {
    const job = createRevisionIndexationJob({
      listArtisanIds: async () => [ART],
      contratRepo: drizzleRepo,
      getToday: () => new Date("2026-06-30T11:00:00Z"),
    });
    await runJob(new FakeJobRunRepository(), job, new Date("2026-06-30T11:00:00Z"));

    const { rows } = await admin.query<{ montantHT: string }>(
      'select "montantHT" from contrats_maintenance where id = $1',
      [contratId],
    );
    expect(parseFloat(rows[0].montantHT)).toBeCloseTo(520, 1);
  });
});

/** Plage d'ids distincte pour les tests outbox (évite collision avec ART 9947001). */
const ART_OUTBOX = 9947002;

describe.skipIf(!URL)("revision-indexation-job — outbox atomicité (L2)", () => {
  const admin2 = new Pool({ connectionString: URL });
  const app2 = createDbClient(APP_URL!);
  const drizzleRepo2 = new ContratRepositoryDrizzle(app2.db);
  let outboxContratId = 0;

  const cleanup2 = async () => {
    await admin2.query('delete from event_outbox where "artisanId" = $1', [ART_OUTBOX]);
    await admin2.query('delete from contrats_maintenance where "artisanId" = $1', [ART_OUTBOX]);
    await admin2.query('delete from clients where "artisanId" = $1', [ART_OUTBOX]);
  };

  beforeAll(async () => {
    await cleanup2();
    const { rows: [client] } = await admin2.query<{ id: number }>(
      'insert into clients ("artisanId", nom) values ($1, $2) returning id',
      [ART_OUTBOX, "Client Outbox Job"],
    );
    const { rows: [contrat] } = await admin2.query<{ id: number }>(
      `insert into contrats_maintenance
         ("artisanId","clientId",titre,"montantHT",periodicite,"dateDebut","tauxIndexationAnnuel",reference,statut,type)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [ART_OUTBOX, client.id, "Contrat Outbox Job", "400.00", "annuel", new Date("2025-06-30"), "5", "CTR-OBX-001", "actif", "entretien"],
    );
    outboxContratId = contrat.id;
  });

  afterAll(async () => {
    await cleanup2();
    await app2.close();
    await admin2.end();
  });

  it("job avec db → révision + event outbox co-écrits (atomicité)", async () => {
    const outboxBefore = Number(
      (await admin2.query("select count(*) from event_outbox where action='contrat.prix_revise' and \"artisanId\"=$1", [ART_OUTBOX])).rows[0].count,
    );
    const job = createRevisionIndexationJob({
      listArtisanIds: async () => [ART_OUTBOX],
      contratRepo: drizzleRepo2,
      getToday: () => new Date("2026-06-30T10:00:00Z"),
      db: app2.db,
    });
    const result = await runJob(new FakeJobRunRepository(), job, new Date("2026-06-30T10:00:00Z"));
    expect(result).toBe("done");

    const row = (await admin2.query(
      "select * from event_outbox where action='contrat.prix_revise' and \"entityId\"=$1",
      [outboxContratId],
    )).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(ART_OUTBOX);
    expect(row.entityType).toBe("contrat");
    expect((row.payload as { ancienMontantHT?: string }).ancienMontantHT).toBe("400.00");
    expect(Number((await admin2.query("select count(*) from event_outbox where action='contrat.prix_revise' and \"artisanId\"=$1", [ART_OUTBOX])).rows[0].count)).toBe(outboxBefore + 1);
  });

  it("2e passage job → 0 event outbox supplémentaire (garde SQL idempotente)", async () => {
    const outboxBefore = Number(
      (await admin2.query("select count(*) from event_outbox where action='contrat.prix_revise' and \"artisanId\"=$1", [ART_OUTBOX])).rows[0].count,
    );
    const job = createRevisionIndexationJob({
      listArtisanIds: async () => [ART_OUTBOX],
      contratRepo: drizzleRepo2,
      getToday: () => new Date("2026-06-30T11:00:00Z"),
      db: app2.db,
    });
    await runJob(new FakeJobRunRepository(), job, new Date("2026-06-30T11:00:00Z"));
    const outboxAfter = Number(
      (await admin2.query("select count(*) from event_outbox where action='contrat.prix_revise' and \"artisanId\"=$1", [ART_OUTBOX])).rows[0].count,
    );
    expect(outboxAfter).toBe(outboxBefore);
  });
});
