import { describe, it, expect } from "vitest";
import { FakeRegleCategorisationRepository } from "./infra/regle-categorisation-repository-fake";
import { creerRegle, modifierRegle, supprimerRegle } from "./application/write-use-cases";
import { getRegle, listRegles } from "./application/read-use-cases";
import { NotFoundError, ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine regles-categorisation (CRUD catalogue de règles
// de catégorisation auto ; pas d'unicité — plusieurs règles peuvent partager motif/catégorie).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("regles-categorisation — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD d'un autre tenant → NotFound/[]", async () => {
    const repo = new FakeRegleCategorisationRepository();
    const r = await creerRegle(repo, A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    await expect(getRegle(repo, B, r.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierRegle(repo, B, r.id, { actif: false })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerRegle(repo, B, r.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listRegles(repo, B)).toEqual([]);
  });

  it("INV-2 : artisanId forcé — create scope toujours au tenant courant", async () => {
    const repo = new FakeRegleCategorisationRepository();
    const r = await creerRegle(repo, A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    expect(r.artisanId).toBe(1);
  });

  it("INV-3 : défaut actif true quand absent", async () => {
    const repo = new FakeRegleCategorisationRepository();
    const r = await creerRegle(repo, A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    expect(r.actif).toBe(true);
  });

  it("INV-4 : validation — motifLibelle / categorie non vides", async () => {
    const repo = new FakeRegleCategorisationRepository();
    await expect(creerRegle(repo, A, { motifLibelle: " ", categorie: "carburant" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerRegle(repo, A, { motifLibelle: "ESSENCE", categorie: "  " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("INV-5 : pas d'unicité (doublons cohabitent) + update partiel préserve les champs non fournis", async () => {
    const repo = new FakeRegleCategorisationRepository();
    await creerRegle(repo, A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    await creerRegle(repo, A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    expect(await listRegles(repo, A)).toHaveLength(2);
    const r = await creerRegle(repo, A, { motifLibelle: "EDF", categorie: "energie" });
    const maj = await modifierRegle(repo, A, r.id, { actif: false });
    expect(maj.actif).toBe(false);
    expect(maj.motifLibelle).toBe("EDF"); // préservé
    expect(maj.categorie).toBe("energie"); // préservé
  });
});
