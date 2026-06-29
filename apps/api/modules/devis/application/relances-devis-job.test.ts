import { describe, it, expect } from "vitest";
import { createRelancesDevisJob } from "./relances-devis-job";
import { runJob } from "../../../platform/scheduler/scheduler-runner";
import { FakeDevisRepository } from "../infra/devis-repository-fake";
import { FakeRelanceDevisRepository } from "../../relances-devis/infra/relance-devis-repository-fake";
import { FakeEmailPort, FakeRateLimiter } from "../../../shared/ports";
import type { IJobRunRepository, ClaimedRun } from "../../../platform/scheduler/job-run-repository";
import type { DevisRelanceDeps } from "./relances-devis";

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

function makeDeps(overrides: Partial<DevisRelanceDeps> = {}): DevisRelanceDeps {
  return {
    devisRepo: new FakeDevisRepository(),
    relanceRepo: new FakeRelanceDevisRepository(),
    clientReader: { getClient: async () => ({ id: 100, nom: "Dupont", prenom: "Jean", email: "jean@client.fr" }) },
    artisanReader: { getArtisan: async () => ({ id: 1, nomEntreprise: "Plomberie Test", email: "pro@test.fr" }) },
    email: new FakeEmailPort(),
    rateLimiter: new FakeRateLimiter(),
    ...overrides,
  };
}

const CTX_A = { artisanId: 1, userId: 0 } as const;

async function seedDevisAncien(devisRepo: FakeDevisRepository, artisanId: number, clientId = 100): Promise<void> {
  const d = await devisRepo.create({ artisanId, userId: 0 }, { clientId, numero: `DEV-${artisanId}01` });
  devisRepo.setStatutForTest(d.id, "envoye");
  devisRepo.setDateDevisForTest?.(d.id, new Date("2026-01-01T00:00:00Z"));
}

describe("relances-devis-job — idempotence scheduler", () => {
  it("rejouer le même tick ne double pas les relances (skipped au 2e appel)", async () => {
    const devisRepo = new FakeDevisRepository();
    const email = new FakeEmailPort();
    await seedDevisAncien(devisRepo, 1);

    const job = createRelancesDevisJob({
      listArtiasnsActifs: async () => [1],
      makeRelanceDeps: () => makeDeps({ devisRepo, email }),
    });

    const repo = new FakeJobRunRepository();
    const now = new Date("2026-06-29T10:00:00Z");

    const r1 = await runJob(repo, job, now);
    expect(r1).toBe("done");
    const count1 = email.sent.length;
    expect(count1).toBeGreaterThan(0);

    const r2 = await runJob(repo, job, now);
    expect(r2).toBe("skipped");
    /* skipped = run() non appelé → pas de nouvel email */
    expect(email.sent.length).toBe(count1);
  });

  it("liste vide → aucune relance, job done", async () => {
    const email = new FakeEmailPort();
    const job = createRelancesDevisJob({
      listArtiasnsActifs: async () => [],
      makeRelanceDeps: () => makeDeps({ email }),
    });

    const result = await runJob(new FakeJobRunRepository(), job, new Date("2026-06-29T10:00:00Z"));
    expect(result).toBe("done");
    expect(email.sent.length).toBe(0);
  });

  it("erreur rate-limit sur artisan 1 → artisan 2 traité quand même (best-effort)", async () => {
    const emailB = new FakeEmailPort();
    const devisRepoB = new FakeDevisRepository();
    await seedDevisAncien(devisRepoB, 2, 200);

    const rateLimiterKO = new FakeRateLimiter();
    rateLimiterKO.denyKey("relance-auto:1");

    const job = createRelancesDevisJob({
      listArtiasnsActifs: async () => [1, 2],
      makeRelanceDeps: (artisanId) =>
        artisanId === 1
          ? makeDeps({ rateLimiter: rateLimiterKO })
          : makeDeps({
              devisRepo: devisRepoB,
              email: emailB,
              clientReader: { getClient: async () => ({ id: 200, nom: "Martin", prenom: "Paul", email: "paul@client.fr" }) },
              artisanReader: { getArtisan: async () => ({ id: 2, nomEntreprise: "Elec Test", email: "pro2@test.fr" }) },
            }),
    });

    const result = await runJob(new FakeJobRunRepository(), job, new Date("2026-06-29T10:00:00Z"));
    expect(result).toBe("done");
    /* artisan 2 doit avoir reçu la relance malgré l'échec de l'artisan 1 */
    expect(emailB.sent.length).toBeGreaterThan(0);
  });

  it("deux jours différents = deux claims indépendants (pas de skip cross-day)", async () => {
    const job = createRelancesDevisJob({
      listArtiasnsActifs: async () => [],
      makeRelanceDeps: () => makeDeps(),
    });
    const repo = new FakeJobRunRepository();
    const r1 = await runJob(repo, job, new Date("2026-06-28T10:00:00Z"));
    const r2 = await runJob(repo, job, new Date("2026-06-29T10:00:00Z"));
    expect(r1).toBe("done");
    expect(r2).toBe("done");
  });
});

describe("relances-devis-job — wiring CTX_A", () => {
  it("ne relance pas un devis trop récent (joursMinimum non atteint)", async () => {
    const devisRepo = new FakeDevisRepository();
    const email = new FakeEmailPort();
    const now = new Date("2026-06-29T10:00:00Z");
    /* devis créé 2 jours avant → en dessous du seuil de 7 jours */
    const d = await devisRepo.create(CTX_A, { clientId: 100, numero: "DEV-RECENT" });
    devisRepo.setStatutForTest(d.id, "envoye");
    devisRepo.setDateDevisForTest?.(d.id, new Date("2026-06-27T00:00:00Z"));

    const job = createRelancesDevisJob({
      listArtiasnsActifs: async () => [1],
      makeRelanceDeps: () => makeDeps({ devisRepo, email, maintenant: () => now }),
    });

    await runJob(new FakeJobRunRepository(), job, now);
    expect(email.sent.length).toBe(0);
  });
});
