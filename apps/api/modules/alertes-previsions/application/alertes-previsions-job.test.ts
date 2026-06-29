import { describe, it, expect } from "vitest";
import { createAlertesPrevisionsJob } from "./alertes-previsions-job";
import { runJob } from "../../../platform/scheduler/scheduler-runner";
import { AlertesPrevisionsRepositoryFake } from "../infra/alertes-previsions-repository-fake";
import { FakeEmailPort, FakeSmsPort } from "../../../shared/ports/fakes";
import type { IJobRunRepository, ClaimedRun } from "../../../platform/scheduler/job-run-repository";
import type { AlerteConfig } from "../domain/alerte-prevision";

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

const CONFIG_EMAIL: AlerteConfig = {
  seuilAlertePositif: "10.00", seuilAlerteNegatif: "10.00",
  alerteEmail: true, alerteSms: false,
  emailDestination: "artisan@test.fr", telephoneDestination: null,
  frequenceVerification: "hebdomadaire", actif: true,
};

const CONFIG_SMS: AlerteConfig = {
  ...CONFIG_EMAIL, alerteEmail: false, alerteSms: true,
  emailDestination: null, telephoneDestination: "+33600000001",
};

const CONFIG_LES_DEUX: AlerteConfig = {
  ...CONFIG_EMAIL, alerteSms: true, telephoneDestination: "+33600000002",
};

const NOW = new Date("2026-06-15T12:00:00Z");

describe("alertes-previsions-job — idempotence scheduler", () => {
  it("rejouer le même tick ne double pas les alertes (skipped au 2e appel)", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({ config: CONFIG_EMAIL, previsionCA: 1000, caRealise: 1200 });
    const email = new FakeEmailPort();
    const job = createAlertesPrevisionsJob({ repo, email, listArtisanIds: async () => [1] });
    const runRepo = new FakeJobRunRepository();

    const r1 = await runJob(runRepo, job, NOW);
    expect(r1).toBe("done");
    const sent1 = email.sent.length;
    expect(sent1).toBeGreaterThan(0);

    const r2 = await runJob(runRepo, job, NOW);
    expect(r2).toBe("skipped");
    expect(email.sent.length).toBe(sent1);
  });

  it("deux jours différents = deux claims indépendants", async () => {
    const job = createAlertesPrevisionsJob({
      repo: new AlertesPrevisionsRepositoryFake(),
      email: new FakeEmailPort(),
      listArtisanIds: async () => [],
    });
    const runRepo = new FakeJobRunRepository();
    const r1 = await runJob(runRepo, job, new Date("2026-06-14T12:00:00Z"));
    const r2 = await runJob(runRepo, job, new Date("2026-06-15T12:00:00Z"));
    expect(r1).toBe("done");
    expect(r2).toBe("done");
  });
});

describe("alertes-previsions-job — envoi email/SMS", () => {
  it("CA réalisé > seuil positif → email envoyé à emailDestination", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({ config: CONFIG_EMAIL, previsionCA: 1000, caRealise: 1200 });
    const email = new FakeEmailPort();
    const job = createAlertesPrevisionsJob({ repo, email, listArtisanIds: async () => [1] });

    await runJob(new FakeJobRunRepository(), job, NOW);

    expect(email.sent.length).toBe(1);
    expect(email.sent[0]!.to).toBe("artisan@test.fr");
    expect(email.sent[0]!.subject).toContain("Alerte");
  });

  it("canal sms → SMS envoyé, aucun email", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({ config: CONFIG_SMS, previsionCA: 1000, caRealise: 1200 });
    const email = new FakeEmailPort();
    const sms = new FakeSmsPort();
    const job = createAlertesPrevisionsJob({ repo, email, sms, listArtisanIds: async () => [1] });

    await runJob(new FakeJobRunRepository(), job, NOW);

    expect(email.sent.length).toBe(0);
    expect(sms.sent.length).toBe(1);
    expect(sms.sent[0]!.to).toBe("+33600000001");
  });

  it("canal les_deux → email ET sms envoyés", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({ config: CONFIG_LES_DEUX, previsionCA: 1000, caRealise: 1200 });
    const email = new FakeEmailPort();
    const sms = new FakeSmsPort();
    const job = createAlertesPrevisionsJob({ repo, email, sms, listArtisanIds: async () => [1] });

    await runJob(new FakeJobRunRepository(), job, NOW);

    expect(email.sent.length).toBe(1);
    expect(sms.sent.length).toBe(1);
  });

  it("CA dans les seuils → aucune alerte, aucun email", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({ config: CONFIG_EMAIL, previsionCA: 1000, caRealise: 1050 });
    const email = new FakeEmailPort();
    const job = createAlertesPrevisionsJob({ repo, email, listArtisanIds: async () => [1] });

    await runJob(new FakeJobRunRepository(), job, NOW);

    expect(email.sent.length).toBe(0);
  });

  it("anti-spam mensuel : alerte du même type déjà enregistrée → pas de renvoi", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({ config: CONFIG_EMAIL, previsionCA: 1000, caRealise: 1200 });
    const email = new FakeEmailPort();
    const job = createAlertesPrevisionsJob({ repo, email, listArtisanIds: async () => [1] });

    const runRepo = new FakeJobRunRepository();
    /* premier tick : alerte envoyée */
    await runJob(runRepo, job, NOW);
    const count1 = email.sent.length;
    expect(count1).toBe(1);

    /* deuxième tick, jour suivant : historique existe → pas de deuxième email */
    await runJob(new FakeJobRunRepository(), job, new Date("2026-06-16T12:00:00Z"));
    expect(email.sent.length).toBe(count1);
  });

  it("config inactive → aucun email", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({
      config: { ...CONFIG_EMAIL, actif: false },
      previsionCA: 1000, caRealise: 1200,
    });
    const email = new FakeEmailPort();
    const job = createAlertesPrevisionsJob({ repo, email, listArtisanIds: async () => [1] });

    await runJob(new FakeJobRunRepository(), job, NOW);

    expect(email.sent.length).toBe(0);
  });

  it("erreur sur artisan 1 → artisan 2 traité (best-effort)", async () => {
    let artisanCall = 0;
    const repoMix = new class extends AlertesPrevisionsRepositoryFake {
      override async getPrevisionCA() {
        artisanCall++;
        if (artisanCall === 1) throw new Error("db down");
        return 1000;
      }
    }({ config: CONFIG_EMAIL, caRealise: 1200 });

    const email = new FakeEmailPort();
    const job = createAlertesPrevisionsJob({ repo: repoMix, email, listArtisanIds: async () => [1, 2] });

    const result = await runJob(new FakeJobRunRepository(), job, NOW);
    expect(result).toBe("done");
    /* artisan 2 doit avoir reçu son email */
    expect(email.sent.length).toBeGreaterThan(0);
  });
});
