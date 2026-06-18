import { describe, it, expect, beforeEach } from "vitest";
import { FakeAvisRepository } from "../infra/avis-repository-fake";
import { listAvis, listAvisEnrichi, getAvis, getAvisStats } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("avis — use-cases lecture (repo mocké)", () => {
  let repo: FakeAvisRepository;

  beforeEach(() => {
    repo = new FakeAvisRepository();
    repo.seed({ artisanId: 1, note: 5 });
    repo.seed({ artisanId: 1, note: 3 });
    repo.seed({ artisanId: 1, note: 1, statut: "masque" });
    repo.seed({ artisanId: 2, note: 2 });
  });

  it("listAvis ne renvoie que les avis du tenant", async () => {
    expect((await listAvis(repo, A)).length).toBe(3);
    expect((await listAvis(repo, B)).map((a) => a.note)).toEqual([2]);
  });

  it("getAvis renvoie l'avis du tenant", async () => {
    const [a] = await listAvis(repo, A);
    expect((await getAvis(repo, A, a.id)).id).toBe(a.id);
  });

  it("getAvis sur une ressource d'un autre tenant → NotFoundError", async () => {
    const [aA] = await listAvis(repo, A);
    await expect(getAvis(repo, B, aA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => getAvis(repo, B, aA.id));
  });

  it("getAvis sur un id inexistant → NotFoundError", async () => {
    await expect(getAvis(repo, A, 99999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listAvisEnrichi : joint client + intervention scopés tenant, sans fuite cross-tenant", async () => {
    const repo2 = new FakeAvisRepository();
    const av = repo2.seed({ artisanId: 1, clientId: 100, interventionId: 200, note: 5 });
    repo2.seedClient({ id: 100, artisanId: 1, nom: "Dupont", prenom: "Jean", email: "j@d.fr" });
    repo2.seedIntervention({ id: 200, artisanId: 1, titre: "Fuite cuisine", dateDebut: new Date("2026-05-01") });
    // client/intervention d'un AUTRE tenant avec un id qui pourrait collisionner
    repo2.seedClient({ id: 100, artisanId: 2, nom: "Autre", prenom: null, email: null });

    const [enrichi] = await listAvisEnrichi(repo2, A);
    expect(enrichi.id).toBe(av.id);
    expect(enrichi.client?.nom).toBe("Dupont");
    expect(enrichi.intervention?.titre).toBe("Fuite cuisine");
    // tenant B ne voit pas l'avis de A
    expect(await listAvisEnrichi(repo2, B)).toEqual([]);
  });

  it("getAvisStats : agrégats scopés au tenant (publiés uniquement)", async () => {
    const stats = await getAvisStats(repo, A);
    expect(stats.total).toBe(2); // l'avis masqué est exclu
    expect(stats.distribution[5]).toBe(1);
    expect(stats.distribution[3]).toBe(1);
    expect(stats.distribution[1]).toBe(0);
    expect(stats.moyenne).toBe(4);
    // tenant B isolé
    expect((await getAvisStats(repo, B)).total).toBe(1);
  });
});
