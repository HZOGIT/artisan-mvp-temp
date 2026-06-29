import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { createFacturesRecurrentesJob } from "./factures-recurrentes-job";
import { runJob } from "../../../platform/scheduler/scheduler-runner";
import { FakeContratRepository } from "../infra/contrat-repository-fake";
import { ContratRepositoryDrizzle } from "../infra/contrat-repository-drizzle";
import type { IJobRunRepository, ClaimedRun } from "../../../platform/scheduler/job-run-repository";
import type { ContratFactureGenerator, GenererFactureContratInput, FactureGenereeRef } from "./contrat-facture-generator";
import type { TenantContext } from "../../../shared/tenant";

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

class FakeFactureGen implements ContratFactureGenerator {
  generated: GenererFactureContratInput[] = [];
  private seq = 0;

  async genererFactureEmise(_ctx: TenantContext, input: GenererFactureContratInput): Promise<FactureGenereeRef> {
    this.generated.push(input);
    return { id: ++this.seq, numero: `F-${String(this.seq).padStart(5, "0")}` };
  }
}

const base = (over: object = {}) => ({
  clientId: 100,
  titre: "Entretien",
  montantHT: "200.00",
  tauxTVA: "20.00",
  periodicite: "mensuel" as const,
  dateDebut: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("factures-recurrentes-job — idempotence scheduler (fakes)", () => {
  it("rejouer le même tick ne double pas les factures (skipped au 2e appel)", async () => {
    const repo = new FakeContratRepository();
    const gen = new FakeFactureGen();
    repo.seedClient(1, 100, "Dupont");
    await repo.create({ artisanId: 1, userId: 0 }, base({ prochainFacturation: new Date("2026-06-26T00:00:00Z") }), "CTR-00001");

    const job = createFacturesRecurrentesJob({ listArtisanIds: async () => [1], contratRepo: repo, factureGen: gen });
    const jobRepo = new FakeJobRunRepository();
    const now = new Date("2026-06-29T10:00:00Z");

    const r1 = await runJob(jobRepo, job, now);
    expect(r1).toBe("done");
    expect(gen.generated).toHaveLength(1);

    const r2 = await runJob(jobRepo, job, now);
    expect(r2).toBe("skipped");
    expect(gen.generated).toHaveLength(1);
  });

  it("liste artisans vide → job done, aucune facture générée", async () => {
    const gen = new FakeFactureGen();
    const job = createFacturesRecurrentesJob({ listArtisanIds: async () => [], contratRepo: new FakeContratRepository(), factureGen: gen });

    const result = await runJob(new FakeJobRunRepository(), job, new Date("2026-06-29T10:00:00Z"));
    expect(result).toBe("done");
    expect(gen.generated).toHaveLength(0);
  });

  it("prochainFacturation avancée après 1er tick → 0 doublon (anti-double-billing, ConflictError interne)", async () => {
    const repo = new FakeContratRepository();
    const gen = new FakeFactureGen();
    repo.seedClient(1, 100, "Dupont");
    await repo.create({ artisanId: 1, userId: 0 }, base({ prochainFacturation: new Date("2026-06-26T00:00:00Z") }), "CTR-00001");

    const now = new Date("2026-06-29T10:00:00Z");
    const job1 = createFacturesRecurrentesJob({ listArtisanIds: async () => [1], contratRepo: repo, factureGen: gen });
    await runJob(new FakeJobRunRepository(), job1, now);
    expect(gen.generated).toHaveLength(1);

    /** 2e exécution : claim possible (nouveau jobRepo), prochainFacturation avancée → ConflictError → 0 ajout */
    const job2 = createFacturesRecurrentesJob({ listArtisanIds: async () => [1], contratRepo: repo, factureGen: gen });
    await runJob(new FakeJobRunRepository(), job2, now);
    expect(gen.generated).toHaveLength(1);
  });

  it("deux jours différents = deux claims indépendants (pas de skip cross-day)", async () => {
    const job = createFacturesRecurrentesJob({ listArtisanIds: async () => [], contratRepo: new FakeContratRepository(), factureGen: new FakeFactureGen() });
    const repo = new FakeJobRunRepository();
    const r1 = await runJob(repo, job, new Date("2026-06-28T10:00:00Z"));
    const r2 = await runJob(repo, job, new Date("2026-06-29T10:00:00Z"));
    expect(r1).toBe("done");
    expect(r2).toBe("done");
  });
});

/** Plage d'ids réservée à ce fichier — évite les collisions entre tests parallèles. */
const ART = 9946001;

const URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL ?? (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

describe.skipIf(!URL)("factures-recurrentes-job — intégration PG (anti-double-billing réel)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const drizzleRepo = new ContratRepositoryDrizzle(app.db);
  let contratId = 0;

  const cleanup = async () => {
    await admin.query(
      `delete from factures_recurrentes
         where "contratId" in (select id from contrats_maintenance where "artisanId" = $1)`,
      [ART],
    );
    await admin.query('delete from contrats_maintenance where "artisanId" = $1', [ART]);
    await admin.query('delete from clients where "artisanId" = $1', [ART]);
  };

  beforeAll(async () => {
    await cleanup();
    const { rows: [client] } = await admin.query<{ id: number }>(
      'insert into clients ("artisanId", nom) values ($1, $2) returning id',
      [ART, "Client Recur PG"],
    );
    const { rows: [contrat] } = await admin.query<{ id: number }>(
      `insert into contrats_maintenance
         ("artisanId","clientId",titre,"montantHT",periodicite,"dateDebut","prochainFacturation",reference,statut,type)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [ART, client.id, "Contrat PG Recur", "100.00", "mensuel", new Date("2026-01-01"), new Date("2026-01-15"), "CTR-PG-001", "actif", "entretien"],
    );
    contratId = contrat.id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("1er passage → facture enregistrée, prochainFacturation avancée en base", async () => {
    const gen = new FakeFactureGen();
    const job = createFacturesRecurrentesJob({ listArtisanIds: async () => [ART], contratRepo: drizzleRepo, factureGen: gen });

    const result = await runJob(new FakeJobRunRepository(), job, new Date("2026-06-29T10:00:00Z"));
    expect(result).toBe("done");
    expect(gen.generated).toHaveLength(1);

    const { rows } = await admin.query<{ prochainFacturation: Date }>(
      'select "prochainFacturation" from contrats_maintenance where id = $1',
      [contratId],
    );
    expect(new Date(rows[0].prochainFacturation).getTime()).toBeGreaterThan(new Date("2026-01-15").getTime());
  });

  it("2e passage (prochainFacturation avancée) → 0 doublon en base (anti-double-billing PG)", async () => {
    const gen = new FakeFactureGen();
    const job = createFacturesRecurrentesJob({ listArtisanIds: async () => [ART], contratRepo: drizzleRepo, factureGen: gen });

    const result = await runJob(new FakeJobRunRepository(), job, new Date("2026-06-29T11:00:00Z"));
    expect(result).toBe("done");
    expect(gen.generated).toHaveLength(0);

    const { rows } = await admin.query<{ count: string }>(
      'select count(*) from factures_recurrentes where "contratId" = $1',
      [contratId],
    );
    expect(Number(rows[0].count)).toBe(1);
  });
});
