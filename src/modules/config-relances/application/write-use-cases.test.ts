import { describe, it, expect } from "vitest";
import { FakeConfigRelancesRepository } from "../infra/config-relances-repository-fake";
import { mettreAJourConfigRelances } from "./write-use-cases";
import { ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);

describe("config-relances — write use-cases (mettreAJourConfigRelances)", () => {
  it("upsert valide : applique et renvoie l'état ; artisanId forcé", async () => {
    const repo = new FakeConfigRelancesRepository();
    const r = await mettreAJourConfigRelances(repo, A, { actif: true, joursApresEnvoi: 10, nombreMaxRelances: 5, heureEnvoi: "08:30", joursEnvoi: "1,3,5", modeleEmailId: 42 });
    expect(r.artisanId).toBe(1);
    expect(r.actif).toBe(true);
    expect(r.nombreMaxRelances).toBe(5);
    expect(r.modeleEmailId).toBe(42);
  });

  it("joursApresEnvoi / joursEntreRelances < 1 ou non entiers → ValidationError", async () => {
    const repo = new FakeConfigRelancesRepository();
    await expect(mettreAJourConfigRelances(repo, A, { joursApresEnvoi: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourConfigRelances(repo, A, { joursEntreRelances: -1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourConfigRelances(repo, A, { joursApresEnvoi: 1.5 })).rejects.toBeInstanceOf(ValidationError);
    expect((await mettreAJourConfigRelances(repo, A, { joursApresEnvoi: 1 })).joursApresEnvoi).toBe(1);
  });

  it("nombreMaxRelances hors [1,10] → ValidationError ; bornes 1 et 10 acceptées", async () => {
    const repo = new FakeConfigRelancesRepository();
    await expect(mettreAJourConfigRelances(repo, A, { nombreMaxRelances: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourConfigRelances(repo, A, { nombreMaxRelances: 11 })).rejects.toBeInstanceOf(ValidationError);
    expect((await mettreAJourConfigRelances(repo, A, { nombreMaxRelances: 1 })).nombreMaxRelances).toBe(1);
    expect((await mettreAJourConfigRelances(repo, A, { nombreMaxRelances: 10 })).nombreMaxRelances).toBe(10);
  });

  it("heureEnvoi hors format HH:MM → ValidationError", async () => {
    const repo = new FakeConfigRelancesRepository();
    for (const h of ["9:00", "24:00", "08:60", "abc", "08:5"]) {
      await expect(mettreAJourConfigRelances(repo, A, { heureEnvoi: h })).rejects.toBeInstanceOf(ValidationError);
    }
    expect((await mettreAJourConfigRelances(repo, A, { heureEnvoi: "08:30" })).heureEnvoi).toBe("08:30");
    expect((await mettreAJourConfigRelances(repo, A, { heureEnvoi: "23:59" })).heureEnvoi).toBe("23:59");
  });

  it("joursEnvoi invalide (hors 1..7, vide) → ValidationError ; liste valide acceptée", async () => {
    const repo = new FakeConfigRelancesRepository();
    for (const j of ["1,8", "0,1", "", "1,a", "1,,2"]) {
      await expect(mettreAJourConfigRelances(repo, A, { joursEnvoi: j })).rejects.toBeInstanceOf(ValidationError);
    }
    expect((await mettreAJourConfigRelances(repo, A, { joursEnvoi: "1,2,3" })).joursEnvoi).toBe("1,2,3");
    expect((await mettreAJourConfigRelances(repo, A, { joursEnvoi: "7" })).joursEnvoi).toBe("7");
  });

  it("modeleEmailId invalide (< 1 ou non entier) → ValidationError ; null/entier accepté", async () => {
    const repo = new FakeConfigRelancesRepository();
    await expect(mettreAJourConfigRelances(repo, A, { modeleEmailId: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourConfigRelances(repo, A, { modeleEmailId: 1.5 })).rejects.toBeInstanceOf(ValidationError);
    expect((await mettreAJourConfigRelances(repo, A, { modeleEmailId: null })).modeleEmailId).toBeNull();
    expect((await mettreAJourConfigRelances(repo, A, { modeleEmailId: 3 })).modeleEmailId).toBe(3);
  });

  it("upsert partiel : préserve les autres champs config", async () => {
    const repo = new FakeConfigRelancesRepository();
    await mettreAJourConfigRelances(repo, A, { actif: true, heureEnvoi: "07:00" });
    const r = await mettreAJourConfigRelances(repo, A, { joursApresEnvoi: 14 });
    expect(r.joursApresEnvoi).toBe(14);
    expect(r.actif).toBe(true); // préservé
    expect(r.heureEnvoi).toBe("07:00"); // préservé
  });
});
