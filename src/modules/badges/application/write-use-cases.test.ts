import { describe, it, expect, beforeEach } from "vitest";
import { FakeBadgeRepository } from "../infra/badge-repository-fake";
import { creerBadge, modifierBadge, supprimerBadge, attribuerBadge } from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("badges — use-cases écriture (repo mocké)", () => {
  let repo: FakeBadgeRepository;
  let badgeA: number;

  beforeEach(async () => {
    repo = new FakeBadgeRepository();
    repo.seedTechnicien(100, 1); // technicien de A
    repo.seedTechnicien(200, 2); // technicien de B
    badgeA = (await creerBadge(repo, A, { code: "PRO", nom: "Pro" })).id;
  });

  it("creerBadge crée le badge du tenant", async () => {
    const b = await creerBadge(repo, A, { code: "TOP", nom: "Top", points: 30 });
    expect(b.artisanId).toBe(1);
    expect(b.points).toBe(30);
  });

  it("creerBadge avec code ou nom vide → ValidationError", async () => {
    await expect(creerBadge(repo, A, { code: "", nom: "X" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerBadge(repo, A, { code: "X", nom: "  " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("modifierBadge OK / cross-tenant → NotFoundError", async () => {
    expect((await modifierBadge(repo, A, badgeA, { nom: "Pro+" })).nom).toBe("Pro+");
    await expect(modifierBadge(repo, B, badgeA, { nom: "hack" })).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => modifierBadge(repo, B, badgeA, { nom: "hack" }));
  });

  it("supprimerBadge OK / cross-tenant → NotFoundError", async () => {
    await expect(supprimerBadge(repo, B, badgeA)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerBadge(repo, A, badgeA);
    await expect(supprimerBadge(repo, A, badgeA)).rejects.toBeInstanceOf(NotFoundError); // déjà supprimé
  });

  it("attribuerBadge OK + idempotent", async () => {
    const a1 = await attribuerBadge(repo, A, 100, badgeA, 50);
    expect(a1.technicienId).toBe(100);
    const a2 = await attribuerBadge(repo, A, 100, badgeA, 999);
    expect(a2.id).toBe(a1.id); // idempotent
  });

  it("attribuerBadge anti-IDOR : technicien d'un autre tenant → NotFoundError", async () => {
    await expect(attribuerBadge(repo, A, 200, badgeA)).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => attribuerBadge(repo, A, 200, badgeA));
  });

  it("attribuerBadge anti-IDOR : badge d'un autre tenant → NotFoundError", async () => {
    // B tente d'attribuer le badge de A sur son propre technicien
    await expect(attribuerBadge(repo, B, 200, badgeA)).rejects.toBeInstanceOf(NotFoundError);
  });
});
