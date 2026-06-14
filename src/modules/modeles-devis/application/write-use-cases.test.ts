import { describe, it, expect } from "vitest";
import { FakeModeleDevisRepository } from "../infra/modele-devis-repository-fake";
import { creerModeleDevis, modifierModeleDevis, supprimerModeleDevis } from "./write-use-cases";
import { listModelesDevis, getModeleDevis } from "./read-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const ligne = (over = {}) => ({ designation: "Prestation", quantite: "1.00", prixUnitaireHT: "10.00", ...over });
const nbDefauts = async (repo: FakeModeleDevisRepository) => (await listModelesDevis(repo, A)).filter((m) => m.isDefault).length;

describe("modeles-devis — write use-cases", () => {
  it("creerModeleDevis : nom requis ; artisanId scopé", async () => {
    const repo = new FakeModeleDevisRepository();
    await expect(creerModeleDevis(repo, A, { nom: " " })).rejects.toBeInstanceOf(ValidationError);
    const m = await creerModeleDevis(repo, A, { nom: "Trame" });
    expect(m.artisanId).toBe(1);
  });

  it("validation des lignes : designation non vide, quantite/prix ≥ 0, tauxTVA & remise ∈ [0,100]", async () => {
    const repo = new FakeModeleDevisRepository();
    await expect(creerModeleDevis(repo, A, { nom: "T", lignes: [ligne({ designation: "" })] })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleDevis(repo, A, { nom: "T", lignes: [ligne({ quantite: "-1" })] })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleDevis(repo, A, { nom: "T", lignes: [ligne({ prixUnitaireHT: "-5" })] })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleDevis(repo, A, { nom: "T", lignes: [ligne({ tauxTVA: "101" })] })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleDevis(repo, A, { nom: "T", lignes: [ligne({ remise: "150" })] })).rejects.toBeInstanceOf(ValidationError);
    const ok = await creerModeleDevis(repo, A, { nom: "T", lignes: [ligne({ tauxTVA: "5.5", remise: "10" })] });
    expect(ok.lignes).toHaveLength(1);
  });

  it("modifierModeleDevis : NotFound si inexistant ; nom vide rejeté", async () => {
    const repo = new FakeModeleDevisRepository();
    const m = await creerModeleDevis(repo, A, { nom: "T" });
    await expect(modifierModeleDevis(repo, A, 999999, { nom: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierModeleDevis(repo, A, m.id, { nom: " " })).rejects.toBeInstanceOf(ValidationError);
    expect((await modifierModeleDevis(repo, A, m.id, { nom: "Renommé" })).nom).toBe("Renommé");
  });

  it("supprimerModeleDevis : NotFound si inexistant", async () => {
    const repo = new FakeModeleDevisRepository();
    const m = await creerModeleDevis(repo, A, { nom: "T" });
    await supprimerModeleDevis(repo, A, m.id);
    await expect(supprimerModeleDevis(repo, A, m.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("INVARIANT (a) : un 2e create isDefault=true retombe le 1er (au plus un défaut par artisan)", async () => {
    const repo = new FakeModeleDevisRepository();
    const m1 = await creerModeleDevis(repo, A, { nom: "D1", isDefault: true });
    await creerModeleDevis(repo, A, { nom: "D2", isDefault: true });
    expect(await nbDefauts(repo)).toBe(1);
    expect((await listModelesDevis(repo, A)).find((m) => m.id === m1.id)?.isDefault).toBe(false);
  });

  it("INVARIANT (b) : update isDefault=true retombe l'autre", async () => {
    const repo = new FakeModeleDevisRepository();
    const m1 = await creerModeleDevis(repo, A, { nom: "D1", isDefault: true });
    const m2 = await creerModeleDevis(repo, A, { nom: "D2", isDefault: false });
    await modifierModeleDevis(repo, A, m2.id, { isDefault: true });
    expect(await nbDefauts(repo)).toBe(1);
    expect((await listModelesDevis(repo, A)).find((m) => m.id === m1.id)?.isDefault).toBe(false);
  });

  it("INVARIANT : retomber un défaut préserve ses lignes (update {isDefault:false} sans lignes)", async () => {
    const repo = new FakeModeleDevisRepository();
    // m1 défaut avec 2 lignes
    const m1 = await creerModeleDevis(repo, A, { nom: "D1", isDefault: true, lignes: [ligne(), ligne()] });
    // m2 défaut → doit retomber m1 SANS toucher ses lignes
    await creerModeleDevis(repo, A, { nom: "D2", isDefault: true, lignes: [ligne()] });
    const reload1 = await getModeleDevis(repo, A, m1.id);
    expect(reload1.isDefault).toBe(false);
    expect(reload1.lignes).toHaveLength(2); // lignes préservées
  });
});
