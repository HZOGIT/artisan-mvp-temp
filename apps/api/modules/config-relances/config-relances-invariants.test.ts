import { describe, it, expect } from "vitest";
import { FakeConfigRelancesRepository } from "./infra/config-relances-repository-fake";
import { mettreAJourConfigRelances } from "./application/write-use-cases";
import { getConfigRelances } from "./application/read-use-cases";
import { defaultConfigRelances } from "./domain/config-relances";
import { ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine config-relances (config relances auto, singleton).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("config-relances — invariants métier (synthèse)", () => {
  it("INV-1 : singleton — un seul enregistrement par tenant ; upsert idempotent ; get toujours défini", async () => {
    const repo = new FakeConfigRelancesRepository();
    await mettreAJourConfigRelances(repo, A, { nombreMaxRelances: 4 });
    await mettreAJourConfigRelances(repo, A, { nombreMaxRelances: 6 });
    const c = await getConfigRelances(repo, A);
    expect(c).toBeDefined();
    expect(c.artisanId).toBe(1);
    expect(c.nombreMaxRelances).toBe(6); // pas de doublon : la même ligne est mise à jour
  });

  it("INV-2 : défauts — un tenant neuf lit la config par défaut", async () => {
    const repo = new FakeConfigRelancesRepository();
    expect(await getConfigRelances(repo, A)).toEqual(defaultConfigRelances(1));
  });

  it("INV-3 : validation — jours ≥ 1, nombreMaxRelances ∈ [1,10], heureEnvoi HH:MM, joursEnvoi 1..7", async () => {
    const repo = new FakeConfigRelancesRepository();
    await expect(mettreAJourConfigRelances(repo, A, { joursApresEnvoi: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourConfigRelances(repo, A, { nombreMaxRelances: 11 })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourConfigRelances(repo, A, { heureEnvoi: "24:00" })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourConfigRelances(repo, A, { joursEnvoi: "1,8" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("INV-4 : isolation cross-tenant — la config de A est invisible et non modifiable par B", async () => {
    const repo = new FakeConfigRelancesRepository();
    await mettreAJourConfigRelances(repo, A, { actif: true, nombreMaxRelances: 8 });
    expect(await getConfigRelances(repo, B)).toEqual(defaultConfigRelances(2)); // B voit ses défauts
    await mettreAJourConfigRelances(repo, B, { nombreMaxRelances: 2 });
    expect((await getConfigRelances(repo, A)).nombreMaxRelances).toBe(8); // A intact
  });
});
