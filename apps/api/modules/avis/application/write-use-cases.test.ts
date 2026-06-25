import { describe, it, expect, beforeEach } from "vitest";
import { FakeAvisRepository } from "../infra/avis-repository-fake";
import { repondreAvis, changerStatutAvis } from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("avis — use-cases écriture (repo mocké)", () => {
  let repo: FakeAvisRepository;
  let avisA: number;

  beforeEach(() => {
    repo = new FakeAvisRepository();
    avisA = repo.seed({ artisanId: 1, note: 4, statut: "en_attente" }).id;
    repo.seed({ artisanId: 2, note: 2 });
  });

  it("repondreAvis enregistre la réponse de l'artisan propriétaire", async () => {
    const r = await repondreAvis(repo, A, avisA, "  Merci pour votre retour  ");
    expect(r.reponseArtisan).toBe("Merci pour votre retour"); // trim
    expect(r.reponseAt).toBeInstanceOf(Date);
  });

  it("repondreAvis avec réponse vide → ValidationError", async () => {
    await expect(repondreAvis(repo, A, avisA, "   ")).rejects.toBeInstanceOf(ValidationError);
  });

  it("repondreAvis sur l'avis d'un autre tenant → NotFoundError", async () => {
    await expect(repondreAvis(repo, B, avisA, "hack")).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => repondreAvis(repo, B, avisA, "hack"));
    // l'avis de A est intact
    expect((await repo.getById(A, avisA))?.reponseArtisan ?? null).toBeNull();
  });

  it("changerStatutAvis modère l'avis du tenant", async () => {
    const r = await changerStatutAvis(repo, A, avisA, "publie");
    expect(r.statut).toBe("publie");
  });

  it("changerStatutAvis avec statut invalide → ValidationError", async () => {
    // @ts-expect-error statut hors union testé au runtime
    await expect(changerStatutAvis(repo, A, avisA, "supprime")).rejects.toBeInstanceOf(ValidationError);
  });

  it("changerStatutAvis avec statut masque → ValidationError (masquage interdit)", async () => {
    // @ts-expect-error masque retiré de l'API — toujours dans le type mais rejeté au runtime
    await expect(changerStatutAvis(repo, A, avisA, "masque")).rejects.toBeInstanceOf(ValidationError);
    expect((await repo.getById(A, avisA))?.statut).toBe("en_attente");
  });

  it("changerStatutAvis sur l'avis d'un autre tenant → NotFoundError", async () => {
    await expect(changerStatutAvis(repo, B, avisA, "publie")).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => changerStatutAvis(repo, B, avisA, "publie"));
    expect((await repo.getById(A, avisA))?.statut).toBe("en_attente");
  });
});
