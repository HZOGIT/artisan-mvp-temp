import { describe, it, expect } from "vitest";
import { FakeCategorieDepenseRepository } from "../infra/categorie-depense-repository-fake";
import { creerCategorie, modifierCategorie, supprimerCategorie } from "./write-use-cases";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);

describe("categories-depenses — write use-cases", () => {
  it("creerCategorie valide : artisanId scopé + défauts", async () => {
    const repo = new FakeCategorieDepenseRepository();
    const c = await creerCategorie(repo, A, { nom: "Carburant" });
    expect(c.artisanId).toBe(1);
    expect(c.couleur).toBe("#6366f1");
  });

  it("validation : nom vide / couleur hors hexa / plafond non décimal → ValidationError", async () => {
    const repo = new FakeCategorieDepenseRepository();
    await expect(creerCategorie(repo, A, { nom: " " })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerCategorie(repo, A, { nom: "X", couleur: "rouge" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerCategorie(repo, A, { nom: "Y", plafondMensuel: "abc" })).rejects.toBeInstanceOf(ValidationError);
    const ok = await creerCategorie(repo, A, { nom: "Z", couleur: "#aabbcc", plafondMensuel: "500.00" });
    expect(ok.plafondMensuel).toBe("500.00");
  });

  it("INVARIANT unicité : creerCategorie avec un nom déjà pris → ConflictError (remonte du repo)", async () => {
    const repo = new FakeCategorieDepenseRepository();
    await creerCategorie(repo, A, { nom: "Carburant" });
    await expect(creerCategorie(repo, A, { nom: "Carburant" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("modifierCategorie : NotFound si inexistant ; rename vers nom pris → ConflictError ; partiel OK", async () => {
    const repo = new FakeCategorieDepenseRepository();
    await creerCategorie(repo, A, { nom: "Carburant" });
    const c2 = await creerCategorie(repo, A, { nom: "Fournitures" });
    await expect(modifierCategorie(repo, A, 999999, { nom: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierCategorie(repo, A, c2.id, { nom: "Carburant" })).rejects.toBeInstanceOf(ConflictError);
    const maj = await modifierCategorie(repo, A, c2.id, { ordre: 3 });
    expect(maj.ordre).toBe(3);
  });

  it("supprimerCategorie : NotFound si inexistant", async () => {
    const repo = new FakeCategorieDepenseRepository();
    const c = await creerCategorie(repo, A, { nom: "Carburant" });
    await supprimerCategorie(repo, A, c.id);
    await expect(supprimerCategorie(repo, A, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
