import { describe, it, expect } from "vitest";
import { FakeModeleDevisRepository } from "./infra/modele-devis-repository-fake";
import { creerModeleDevis, modifierModeleDevis, supprimerModeleDevis } from "./application/write-use-cases";
import { getModeleDevis, listModelesDevis } from "./application/read-use-cases";
import { NotFoundError, ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine modeles-devis (gabarit en-tête + lignes).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const ligne = (over = {}) => ({ designation: "Prestation", quantite: "1.00", prixUnitaireHT: "10.00", ...over });
const nbDefauts = async (repo: FakeModeleDevisRepository) => (await listModelesDevis(repo, A)).filter((m) => m.isDefault).length;

describe("modeles-devis — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD d'un autre tenant → NotFound/[] ; lignes de A invisibles pour B", async () => {
    const repo = new FakeModeleDevisRepository();
    const m = await creerModeleDevis(repo, A, { nom: "Secret", lignes: [ligne()] });
    await expect(getModeleDevis(repo, B, m.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierModeleDevis(repo, B, m.id, { nom: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerModeleDevis(repo, B, m.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listModelesDevis(repo, B)).toEqual([]);
    expect((await getModeleDevis(repo, A, m.id)).lignes).toHaveLength(1); // intact pour A
  });

  it("INV-2 : artisanId forcé — create scope toujours au tenant courant (jamais usurpable)", async () => {
    const repo = new FakeModeleDevisRepository();
    const m = await creerModeleDevis(repo, A, { nom: "T" });
    expect(m.artisanId).toBe(1);
  });

  it("INV-3 : validation — nom non vide ; lignes designation/quantite/prix/tauxTVA/remise", async () => {
    const repo = new FakeModeleDevisRepository();
    await expect(creerModeleDevis(repo, A, { nom: " " })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleDevis(repo, A, { nom: "T", lignes: [ligne({ designation: "" })] })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleDevis(repo, A, { nom: "T", lignes: [ligne({ quantite: "-1" })] })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleDevis(repo, A, { nom: "T", lignes: [ligne({ prixUnitaireHT: "-2" })] })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleDevis(repo, A, { nom: "T", lignes: [ligne({ tauxTVA: "120" })] })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleDevis(repo, A, { nom: "T", lignes: [ligne({ remise: "-5" })] })).rejects.toBeInstanceOf(ValidationError);
  });

  it("INV-4 : remplacement des lignes — update avec lignes remplace ; sans lignes conserve", async () => {
    const repo = new FakeModeleDevisRepository();
    const m = await creerModeleDevis(repo, A, { nom: "T", lignes: [ligne(), ligne()] });
    const remplace = await modifierModeleDevis(repo, A, m.id, { lignes: [ligne({ designation: "X" })] });
    expect(remplace.lignes).toHaveLength(1);
    const conserve = await modifierModeleDevis(repo, A, m.id, { nom: "Renommé" });
    expect(conserve.lignes).toHaveLength(1); // conservées
  });

  it("INV-5 : unicité du défaut par artisan — au plus un défaut ; rétrogradation préserve les lignes", async () => {
    const repo = new FakeModeleDevisRepository();
    const m1 = await creerModeleDevis(repo, A, { nom: "D1", isDefault: true, lignes: [ligne(), ligne()] });
    await creerModeleDevis(repo, A, { nom: "D2", isDefault: true, lignes: [ligne()] });
    expect(await nbDefauts(repo)).toBe(1);
    const reload1 = await getModeleDevis(repo, A, m1.id);
    expect(reload1.isDefault).toBe(false); // retombé
    expect(reload1.lignes).toHaveLength(2); // lignes préservées
  });
});
