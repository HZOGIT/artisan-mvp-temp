import { describe, it, expect, beforeEach } from "vitest";
import { FakeBadgeRepository } from "../infra/badge-repository-fake";
import { listBadges, getBadge, listBadgesDuTechnicien, getClassementTechniciens } from "./read-use-cases";
import type { ClassementEntry } from "../domain/classement";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("badges — use-cases lecture (repo mocké)", () => {
  let repo: FakeBadgeRepository;
  let badgeA: number;

  beforeEach(async () => {
    repo = new FakeBadgeRepository();
    repo.seedTechnicien(100, 1); // technicien de A
    repo.seedTechnicien(200, 2); // technicien de B
    badgeA = (await repo.create(A, { code: "PRO", nom: "Pro" })).id;
    await repo.create(A, { code: "TOP", nom: "Top" });
    await repo.create(B, { code: "BBB", nom: "BadgeB" });
    await repo.attribuer(A, 100, badgeA, 50);
  });

  it("listBadges ne renvoie que les badges du tenant", async () => {
    expect((await listBadges(repo, A)).map((b) => b.code).sort()).toEqual(["PRO", "TOP"]);
    expect((await listBadges(repo, B)).map((b) => b.code)).toEqual(["BBB"]);
  });

  it("getBadge renvoie le badge du tenant", async () => {
    expect((await getBadge(repo, A, badgeA)).code).toBe("PRO");
  });

  it("getBadge sur une ressource d'un autre tenant → NotFoundError", async () => {
    await expect(getBadge(repo, B, badgeA)).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => getBadge(repo, B, badgeA));
  });

  it("getBadge sur un id inexistant → NotFoundError", async () => {
    await expect(getBadge(repo, A, 99999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listBadgesDuTechnicien : scopé au technicien du tenant", async () => {
    expect((await listBadgesDuTechnicien(repo, A, 100)).length).toBe(1);
  });

  it("listBadgesDuTechnicien : technicien d'un autre tenant → [] (anti-IDOR, pas d'oracle)", async () => {
    expect(await listBadgesDuTechnicien(repo, B, 100)).toEqual([]);
  });

  it("getClassementTechniciens : scopé tenant, ordonné par rang", async () => {
    const mk = (artisanId: number, technicienId: number, rang: number): ClassementEntry => ({
      id: rang + artisanId * 10,
      technicienId,
      artisanId,
      periode: "mois",
      dateDebut: "2026-06-01",
      dateFin: "2026-06-30",
      rang,
      pointsTotal: 100 - rang,
      interventions: 5,
      ca: "1000.00",
      noteMoyenne: null,
      createdAt: new Date(),
    });
    repo.seedClassement(mk(1, 100, 2));
    repo.seedClassement(mk(1, 101, 1));
    repo.seedClassement(mk(2, 200, 1)); // tenant B

    const classement = await getClassementTechniciens(repo, A, "mois");
    expect(classement.map((c) => c.rang)).toEqual([1, 2]); // trié par rang
    expect(classement.every((c) => c.artisanId === 1)).toBe(true);
    // autre période → vide
    expect(await getClassementTechniciens(repo, A, "annee")).toEqual([]);
    // tenant B isolé
    expect((await getClassementTechniciens(repo, B, "mois")).map((c) => c.technicienId)).toEqual([200]);
  });
});
