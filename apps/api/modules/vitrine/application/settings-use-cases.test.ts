import { describe, expect, it } from "vitest";
import { getVitrineSettings, updateVitrineSettings } from "./settings-use-cases";
import { VitrineSettingsRepositoryFake } from "../infra/vitrine-settings-repository-fake";
import { DEFAULT_VITRINE_SETTINGS } from "../domain/vitrine-settings";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId } as unknown as TenantContext);

describe("vitrine settings use-cases", () => {
  it("get : défauts si jamais écrit", async () => {
    const repo = new VitrineSettingsRepositoryFake();
    expect(await getVitrineSettings(repo, ctx(1))).toEqual(DEFAULT_VITRINE_SETTINGS);
  });

  it("update : écrit puis relit les champs fournis (partiel), inchangés sinon", async () => {
    const repo = new VitrineSettingsRepositoryFake();
    const a = ctx(1);
    const r1 = await updateVitrineSettings(repo, a, { vitrineActive: true, vitrineDescription: "Plombier de confiance", vitrineExperience: 12 });
    expect(r1).toMatchObject({ vitrineActive: true, vitrineDescription: "Plombier de confiance", vitrineExperience: 12, vitrineZone: null });
    // update partiel : ne touche que vitrineZone, le reste persiste
    const r2 = await updateVitrineSettings(repo, a, { vitrineZone: "Paris et IDF" });
    expect(r2).toMatchObject({ vitrineActive: true, vitrineDescription: "Plombier de confiance", vitrineZone: "Paris et IDF", vitrineExperience: 12 });
  });

  it("isolation par tenant (artisanId)", async () => {
    const repo = new VitrineSettingsRepositoryFake();
    await updateVitrineSettings(repo, ctx(1), { vitrineActive: true });
    expect((await getVitrineSettings(repo, ctx(2))).vitrineActive).toBe(false);
  });

  it("permet de remettre un champ à null explicitement", async () => {
    const repo = new VitrineSettingsRepositoryFake();
    const a = ctx(3);
    await updateVitrineSettings(repo, a, { vitrineDescription: "x" });
    const r = await updateVitrineSettings(repo, a, { vitrineDescription: null });
    expect(r.vitrineDescription).toBeNull();
  });
});
