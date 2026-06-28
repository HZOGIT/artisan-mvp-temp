import { describe, it, expect } from "vitest";
import { FakeClientRepository } from "../infra/client-repository-fake";
import { creerClient, modifierClient, supprimerClient, fusionnerClients } from "./write-use-cases";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
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

describe("clients — suppression avec garde d'intégrité référentielle", () => {
  it("supprimerClient OK quand aucun document lié", async () => {
    const repo = new FakeClientRepository();
    const c = await creerClient(repo, A, { nom: "Libre" });
    await supprimerClient(repo, A, c.id);
    expect(await repo.getById(A, c.id)).toBeNull();
  });

  it("supprimerClient REFUSÉ (ConflictError) si des documents pointent le client", async () => {
    const repo = new FakeClientRepository();
    const c = await creerClient(repo, A, { nom: "Référencé" });
    repo.setDocumentsLies(c.id, 3); // ex. 3 factures/devis liés
    await expect(supprimerClient(repo, A, c.id)).rejects.toBeInstanceOf(ConflictError);
    // le client n'a PAS été supprimé (intégrité préservée)
    expect(await repo.getById(A, c.id)).not.toBeNull();
  });

  it("supprimerClient : client d'un autre tenant → NotFound (ne révèle pas l'existence)", async () => {
    const repo = new FakeClientRepository();
    const c = await creerClient(repo, A, { nom: "Secret" });
    await expect(supprimerClient(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await repo.getById(A, c.id)).not.toBeNull();
  });
});

describe("clients — fusion de doublons (use-case)", () => {
  it("fusionnerClients : complète le survivant et archive le doublon (exclu de list)", async () => {
    const repo = new FakeClientRepository();
    const survivant = await creerClient(repo, A, { nom: "Martin" });
    const doublon = await creerClient(repo, A, { nom: "Martin", email: "martin@a.fr", telephone: "0600000000" });
    const fusionne = await fusionnerClients(repo, A, survivant.id, doublon.id);
    expect(fusionne.id).toBe(survivant.id);
    expect(fusionne.email).toBe("martin@a.fr");
    expect(fusionne.telephone).toBe("0600000000");
    const liste = await repo.list(A);
    expect(liste.some((c) => c.id === doublon.id)).toBe(false);
    expect(liste.some((c) => c.id === survivant.id)).toBe(true);
  });

  it("fusionnerClients : survivant == doublon → ValidationError", async () => {
    const repo = new FakeClientRepository();
    const c = await creerClient(repo, A, { nom: "Seul" });
    await expect(fusionnerClients(repo, A, c.id, c.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("fusionnerClients : cross-tenant refusé → NotFound (B ne fusionne pas les clients de A)", async () => {
    const repo = new FakeClientRepository();
    const survivant = await creerClient(repo, A, { nom: "S" });
    const doublon = await creerClient(repo, A, { nom: "D" });
    await expect(fusionnerClients(repo, B, survivant.id, doublon.id)).rejects.toBeInstanceOf(NotFoundError);
    /** A intact : le doublon n'a pas été archivé par la tentative de B. */
    expect((await repo.list(A)).some((c) => c.id === doublon.id)).toBe(true);
  });
});
