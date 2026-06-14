import { describe, it, expect } from "vitest";
import { FakeChantierRepository } from "../infra/chantier-repository-fake";
import { getPointagesChantier, ajouterPointage, supprimerPointage } from "./pointages-use-cases";
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

describe("chantiers — pointages use-cases", () => {
  it("ajouterPointage + getPointagesChantier : scopés via le chantier parent", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    repo.registerTechnicien(1, 7);
    const p = await ajouterPointage(repo, A, { chantierId, technicienId: 7, date: "2026-09-02", heures: "4.00", description: "Pose" });
    expect(p.technicienId).toBe(7);
    expect(p.heures).toBe("4.00");
    expect(p.date).toBe("2026-09-02");
    const list = await getPointagesChantier(repo, A, chantierId);
    expect(list).toHaveLength(1);
    // isolation : un autre tenant ne voit pas / ne pointe pas le chantier de A
    await expectCrossTenantDenied(() => getPointagesChantier(repo, B, chantierId));
    await expect(ajouterPointage(repo, B, { chantierId, date: "2026-09-02", heures: "1.00" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ajouterPointage : technicien hors tenant → ignoré (technicienId null), pas d'erreur", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    // technicien 999 non enregistré au tenant → lié à null
    const p = await ajouterPointage(repo, A, { chantierId, technicienId: 999, date: "2026-09-02", heures: "2.00" });
    expect(p.technicienId).toBeNull();
  });

  it("ajouterPointage : date invalide → ValidationError ; chantier inexistant → 404", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    await expect(ajouterPointage(repo, A, { chantierId, date: "pas-une-date", heures: "1.00" })).rejects.toBeInstanceOf(ValidationError);
    await expect(ajouterPointage(repo, A, { chantierId: 999999, date: "2026-09-02", heures: "1.00" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("supprimerPointage : scopé chantier+tenant ; idempotent", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const p = await ajouterPointage(repo, A, { chantierId, date: "2026-09-02", heures: "3.00" });
    await supprimerPointage(repo, A, chantierId, p.id);
    expect(await getPointagesChantier(repo, A, chantierId)).toHaveLength(0);
    // idempotent : re-supprimer ne lève pas
    await supprimerPointage(repo, A, chantierId, p.id);
  });
});
