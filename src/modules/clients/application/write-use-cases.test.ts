import { describe, it, expect } from "vitest";
import { FakeClientRepository } from "../infra/client-repository-fake";
import { creerClient, modifierClient } from "./write-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("clients — use-cases d'écriture (create / update)", () => {
  it("creerClient OK : crée un client scopé au tenant", async () => {
    const repo = new FakeClientRepository();
    const c = await creerClient(repo, A, { nom: "Durand", email: "d@a.fr", type: "professionnel" });
    expect(c.id).toBeGreaterThan(0);
    expect(c.artisanId).toBe(1);
    expect(c.type).toBe("professionnel");
  });

  it("creerClient : nom vide → ValidationError", async () => {
    const repo = new FakeClientRepository();
    await expect(creerClient(repo, A, { nom: "   " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerClient : e-mail invalide → ValidationError", async () => {
    const repo = new FakeClientRepository();
    await expect(creerClient(repo, A, { nom: "X", email: "pas-un-email" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerClient : e-mail vide ou absent accepté (champ optionnel)", async () => {
    const repo = new FakeClientRepository();
    expect((await creerClient(repo, A, { nom: "SansMail" })).email).toBeNull();
    expect((await creerClient(repo, A, { nom: "MailVide", email: "" })).email).toBe("");
  });

  it("modifierClient OK : met à jour le client du tenant", async () => {
    const repo = new FakeClientRepository();
    const c = await creerClient(repo, A, { nom: "Avant" });
    const maj = await modifierClient(repo, A, c.id, { nom: "Après", ville: "Lyon" });
    expect(maj.nom).toBe("Après");
    expect(maj.ville).toBe("Lyon");
  });

  it("modifierClient : nom vidé → ValidationError", async () => {
    const repo = new FakeClientRepository();
    const c = await creerClient(repo, A, { nom: "Garde" });
    await expect(modifierClient(repo, A, c.id, { nom: "" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("modifierClient : e-mail invalide → ValidationError", async () => {
    const repo = new FakeClientRepository();
    const c = await creerClient(repo, A, { nom: "Garde" });
    await expect(modifierClient(repo, A, c.id, { email: "nope" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("modifierClient : client d'un autre tenant → NotFound (PII)", async () => {
    const repo = new FakeClientRepository();
    const c = await creerClient(repo, A, { nom: "Secret" });
    await expect(modifierClient(repo, B, c.id, { nom: "hack" })).rejects.toBeInstanceOf(NotFoundError);
    // le client de A reste intact
    const repoA = await repo.getById(A, c.id);
    expect(repoA?.nom).toBe("Secret");
  });
});
