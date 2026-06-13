import { describe, it, expect, beforeEach } from "vitest";
import { FakeBadgeRepository } from "../infra/badge-repository-fake";
import { creerBadge, modifierBadge, supprimerBadge, attribuerBadge, verifierBadges } from "./write-use-cases";
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

  it("verifierBadges : attribue les badges dont le seuil est atteint", async () => {
    // badgeA (PRO) sans seuil → ignoré. Crée un badge avec seuil.
    const seuilBadge = await creerBadge(repo, A, { code: "10I", nom: "10 interventions", categorie: "interventions", seuil: 10 });
    repo.seedProgress(100, { interventions: 12, avisPositifs: 0 }); // technicien de A au-dessus du seuil
    const obtenus = await verifierBadges(repo, A, 100);
    expect(obtenus.map((o) => o.badgeId)).toContain(seuilBadge.id);
    // idempotent : 2e passage ne duplique pas l'attribution
    const obtenus2 = await verifierBadges(repo, A, 100);
    expect(obtenus2.find((o) => o.badgeId === seuilBadge.id)?.id).toBe(obtenus.find((o) => o.badgeId === seuilBadge.id)?.id);
  });

  it("verifierBadges : seuil non atteint → aucune attribution", async () => {
    await creerBadge(repo, A, { code: "50I", nom: "50 interventions", categorie: "interventions", seuil: 50 });
    repo.seedProgress(100, { interventions: 3, avisPositifs: 0 });
    expect(await verifierBadges(repo, A, 100)).toEqual([]);
  });

  it("verifierBadges : technicien d'un autre tenant → NotFoundError (anti-IDOR)", async () => {
    await expect(verifierBadges(repo, A, 200)).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => verifierBadges(repo, A, 200));
  });
});
