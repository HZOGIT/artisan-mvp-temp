import { describe, it, expect } from "vitest";
import { FakeDemandeContactRepository } from "../infra/demande-contact-repository-fake";
import { creerDemande, modifierDemande, supprimerDemande } from "./write-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);

describe("demandes-contact — write use-cases", () => {
  it("creerDemande valide : statut nouveau + clientId null ; artisanId scopé", async () => {
    const repo = new FakeDemandeContactRepository();
    const d = await creerDemande(repo, A, { nom: "Jean Dupont", email: "jean@test.fr" });
    expect(d.artisanId).toBe(1);
    expect(d.statut).toBe("nouveau");
    expect(d.clientId).toBeNull();
  });

  it("validation : nom vide / email invalide / source > 50 → ValidationError", async () => {
    const repo = new FakeDemandeContactRepository();
    await expect(creerDemande(repo, A, { nom: " " })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerDemande(repo, A, { nom: "X", email: "pas-un-email" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerDemande(repo, A, { nom: "Y", source: "x".repeat(51) })).rejects.toBeInstanceOf(ValidationError);
    const ok = await creerDemande(repo, A, { nom: "Z", email: "z@test.fr" });
    expect(ok.email).toBe("z@test.fr");
  });

  it("modifierDemande : NotFound si inexistant ; nom vide rejeté ; ne touche pas le statut/clientId", async () => {
    const repo = new FakeDemandeContactRepository();
    const d = await creerDemande(repo, A, { nom: "Jean" });
    await expect(modifierDemande(repo, A, 999999, { nom: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierDemande(repo, A, d.id, { nom: " " })).rejects.toBeInstanceOf(ValidationError);
    const maj = await modifierDemande(repo, A, d.id, { nom: "Jean Modifié", telephone: "0600000000" });
    expect(maj.nom).toBe("Jean Modifié");
    expect(maj.statut).toBe("nouveau"); // inchangé
    expect(maj.clientId).toBeNull(); // inchangé
  });

  it("supprimerDemande : NotFound si inexistant", async () => {
    const repo = new FakeDemandeContactRepository();
    const d = await creerDemande(repo, A, { nom: "Jean" });
    await supprimerDemande(repo, A, d.id);
    await expect(supprimerDemande(repo, A, d.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
