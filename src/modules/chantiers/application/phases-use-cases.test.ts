import { describe, it, expect } from "vitest";
import { FakeChantierRepository } from "../infra/chantier-repository-fake";
import { getPhasesChantier, creerPhase, modifierPhase, supprimerPhase } from "./phases-use-cases";
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

describe("chantiers — phases use-cases", () => {
  it("creerPhase + getPhasesChantier : scopés via le chantier parent, défauts", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const p = await creerPhase(repo, A, { chantierId, nom: "Gros œuvre" });
    expect(p.nom).toBe("Gros œuvre");
    expect(p.statut).toBe("a_faire");
    expect(p.avancement).toBe(0);
    expect(p.coutReel).toBe("0.00");
    const list = await getPhasesChantier(repo, A, chantierId);
    expect(list).toHaveLength(1);
    // isolation : un autre tenant ne voit pas / ne crée pas sous le chantier de A
    await expectCrossTenantDenied(() => getPhasesChantier(repo, B, chantierId));
    await expect(creerPhase(repo, B, { chantierId, nom: "X" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getPhasesChantier : ordonné par `ordre`", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    await creerPhase(repo, A, { chantierId, nom: "B", ordre: 2 });
    await creerPhase(repo, A, { chantierId, nom: "A", ordre: 1 });
    const list = await getPhasesChantier(repo, A, chantierId);
    expect(list.map((p) => p.nom)).toEqual(["A", "B"]);
  });

  it("creerPhase : date prévue invalide → ValidationError ; chantier inexistant → 404", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    await expect(creerPhase(repo, A, { chantierId, nom: "X", dateDebutPrevue: "pas-une-date" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerPhase(repo, A, { chantierId: 999999, nom: "X" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creerPhase : dates prévues normalisées en AAAA-MM-JJ", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const p = await creerPhase(repo, A, { chantierId, nom: "X", dateDebutPrevue: "2026-09-02T10:00:00Z" });
    expect(p.dateDebutPrevue).toBe("2026-09-02");
  });

  it("modifierPhase : met à jour ; anti-IDOR cross-tenant → 404", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const p = await creerPhase(repo, A, { chantierId, nom: "X" });
    const updated = await modifierPhase(repo, A, p.id, { statut: "termine", avancement: 100, coutReel: "1500.00" });
    expect(updated.statut).toBe("termine");
    expect(updated.avancement).toBe(100);
    expect(updated.coutReel).toBe("1500.00");
    // B ne peut pas toucher la phase de A (table non scopée → garde via chantier parent)
    await expect(modifierPhase(repo, B, p.id, { nom: "pwn" })).rejects.toBeInstanceOf(NotFoundError);
    // phase inexistante → 404
    await expect(modifierPhase(repo, A, 999999, { nom: "X" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("supprimerPhase : scopée via le chantier parent ; anti-IDOR ; idempotent", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const p = await creerPhase(repo, A, { chantierId, nom: "X" });
    // B ne peut pas supprimer la phase de A
    await expect(supprimerPhase(repo, B, p.id)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerPhase(repo, A, p.id);
    expect(await getPhasesChantier(repo, A, chantierId)).toHaveLength(0);
    // idempotent : re-supprimer lève 404 (phase déjà absente)
    await expect(supprimerPhase(repo, A, p.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
