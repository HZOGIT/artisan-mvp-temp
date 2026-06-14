import { describe, it, expect } from "vitest";
import { FakeCategorieDepenseRepository } from "./infra/categorie-depense-repository-fake";
import { creerCategorie, modifierCategorie, supprimerCategorie } from "./application/write-use-cases";
import { getCategorie, listCategories } from "./application/read-use-cases";
import { ConflictError, NotFoundError, ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine categories-depenses (catalogue + unicité nom).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("categories-depenses — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD d'un autre tenant → NotFound/[]", async () => {
    const repo = new FakeCategorieDepenseRepository();
    const c = await creerCategorie(repo, A, { nom: "Carburant" });
    await expect(getCategorie(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierCategorie(repo, B, c.id, { nom: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerCategorie(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listCategories(repo, B)).toEqual([]);
  });

  it("INV-2 : artisanId forcé — create scope toujours au tenant courant", async () => {
    const repo = new FakeCategorieDepenseRepository();
    const c = await creerCategorie(repo, A, { nom: "Carburant" });
    expect(c.artisanId).toBe(1);
  });

  it("INV-3 : unicité du nom par artisan — create/rename vers nom pris → ConflictError ; même nom autre tenant → OK", async () => {
    const repo = new FakeCategorieDepenseRepository();
    await creerCategorie(repo, A, { nom: "Carburant" });
    await expect(creerCategorie(repo, A, { nom: "Carburant" })).rejects.toBeInstanceOf(ConflictError);
    const c2 = await creerCategorie(repo, A, { nom: "Fournitures" });
    await expect(modifierCategorie(repo, A, c2.id, { nom: "Carburant" })).rejects.toBeInstanceOf(ConflictError);
    // même nom, tenant DIFFÉRENT → OK (unicité par artisan)
    const cB = await creerCategorie(repo, B, { nom: "Carburant" });
    expect(cB.artisanId).toBe(2);
  });

  it("INV-4 : validation — nom non vide, couleur #RRGGBB, plafond décimal", async () => {
    const repo = new FakeCategorieDepenseRepository();
    await expect(creerCategorie(repo, A, { nom: " " })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerCategorie(repo, A, { nom: "X", couleur: "bleu" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerCategorie(repo, A, { nom: "Y", plafondMensuel: "12.345" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("INV-5 : défauts — couleur/icone/booléens/ordre posés quand absents", async () => {
    const repo = new FakeCategorieDepenseRepository();
    const c = await creerCategorie(repo, A, { nom: "Carburant" });
    expect(c.couleur).toBe("#6366f1");
    expect(c.icone).toBe("Receipt");
    expect(c.deductibleTva).toBe(true);
    expect(c.deductibleIr).toBe(true);
    expect(c.actif).toBe(true);
    expect(c.ordre).toBe(0);
  });
});
