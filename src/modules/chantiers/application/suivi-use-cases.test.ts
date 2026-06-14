import { describe, it, expect } from "vitest";
import { FakeChantierRepository } from "../infra/chantier-repository-fake";
import { getSuiviChantier, creerSuivi, modifierSuivi, supprimerSuivi } from "./suivi-use-cases";
import { creerChantier } from "./write-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const CLIENT_A = 500;

async function repoAvecChantier(): Promise<{ repo: FakeChantierRepository; chantierId: number }> {
  const repo = new FakeChantierRepository();
  repo.registerClient(1, CLIENT_A);
  const ch = await creerChantier(repo, A, { clientId: CLIENT_A, reference: "CH-1", nom: "Chantier" });
  return { repo, chantierId: ch.id };
}

describe("chantiers — suivi use-cases", () => {
  it("creerSuivi + getSuiviChantier : scopés via le chantier parent, défauts PG", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const s = await creerSuivi(repo, A, { chantierId, titre: "Fondations" });
    expect(s.titre).toBe("Fondations");
    expect(s.statut).toBe("a_faire");
    expect(s.pourcentage).toBe(0);
    expect(s.visibleClient).toBe(true);
    const list = await getSuiviChantier(repo, A, chantierId);
    expect(list).toHaveLength(1);
    // isolation : un autre tenant ne voit pas / ne crée pas sous le chantier de A
    await expectCrossTenantDenied(() => getSuiviChantier(repo, B, chantierId));
    await expect(creerSuivi(repo, B, { chantierId, titre: "X" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getSuiviChantier : ordonné par `ordre`", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    await creerSuivi(repo, A, { chantierId, titre: "B", ordre: 2 });
    await creerSuivi(repo, A, { chantierId, titre: "A", ordre: 1 });
    const list = await getSuiviChantier(repo, A, chantierId);
    expect(list.map((s) => s.titre)).toEqual(["A", "B"]);
  });

  it("creerSuivi : date invalide → ValidationError ; chantier inexistant → 404", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    await expect(creerSuivi(repo, A, { chantierId, titre: "X", dateDebut: "pas-une-date" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerSuivi(repo, A, { chantierId: 999999, titre: "X" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creerSuivi : dates normalisées en AAAA-MM-JJ", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const s = await creerSuivi(repo, A, { chantierId, titre: "X", dateDebut: "2026-09-02T10:00:00Z" });
    expect(s.dateDebut).toBe("2026-09-02");
  });

  it("modifierSuivi : met à jour ; anti-IDOR cross-tenant → 404", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const s = await creerSuivi(repo, A, { chantierId, titre: "X" });
    const updated = await modifierSuivi(repo, A, s.id, { statut: "termine", pourcentage: 100 });
    expect(updated.statut).toBe("termine");
    expect(updated.pourcentage).toBe(100);
    // B ne peut pas toucher le suivi de A (table non scopée → garde via chantier parent)
    await expect(modifierSuivi(repo, B, s.id, { titre: "pwn" })).rejects.toBeInstanceOf(NotFoundError);
    // suivi inexistant → 404
    await expect(modifierSuivi(repo, A, 999999, { titre: "X" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("supprimerSuivi : scopé via le chantier parent ; anti-IDOR ; idempotent", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const s = await creerSuivi(repo, A, { chantierId, titre: "X" });
    // B ne peut pas supprimer le suivi de A
    await expect(supprimerSuivi(repo, B, s.id)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerSuivi(repo, A, s.id);
    expect(await getSuiviChantier(repo, A, chantierId)).toHaveLength(0);
    // idempotent : re-supprimer lève 404 (suivi déjà absent)
    await expect(supprimerSuivi(repo, A, s.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
