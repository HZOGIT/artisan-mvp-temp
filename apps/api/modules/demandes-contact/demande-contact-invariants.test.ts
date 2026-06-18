import { describe, it, expect } from "vitest";
import { FakeDemandeContactRepository } from "./infra/demande-contact-repository-fake";
import { creerDemande, modifierDemande, supprimerDemande } from "./application/write-use-cases";
import { getDemande, listDemandes } from "./application/read-use-cases";
import { marquerContacte, convertir, marquerPerdu } from "./application/transition-use-cases";
import { ConflictError, NotFoundError, ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine demandes-contact (inbox CRM : CRUD + état
// machine + conversion anti-IDOR).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

function repoA() {
  const repo = new FakeDemandeContactRepository();
  repo.seedClient(1, 100);
  return repo;
}

describe("demandes-contact — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD + transitions d'un autre tenant → NotFound/[]", async () => {
    const repo = repoA();
    const d = await creerDemande(repo, A, { nom: "Jean" });
    await expect(getDemande(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierDemande(repo, B, d.id, { nom: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(marquerContacte(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerDemande(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listDemandes(repo, B)).toEqual([]);
  });

  it("INV-2 : artisanId forcé — create scope toujours au tenant courant", async () => {
    const repo = repoA();
    const d = await creerDemande(repo, A, { nom: "Jean" });
    expect(d.artisanId).toBe(1);
  });

  it("INV-3 : statut initial nouveau non usurpable ; update ne touche pas statut/clientId", async () => {
    const repo = repoA();
    const d = await creerDemande(repo, A, { nom: "Jean" });
    expect(d.statut).toBe("nouveau");
    expect(d.clientId).toBeNull();
    const maj = await modifierDemande(repo, A, d.id, { nom: "Jean Modifié" });
    expect(maj.statut).toBe("nouveau"); // inchangé
    expect(maj.clientId).toBeNull(); // inchangé
  });

  it("INV-4 : état machine — nouveau→contacte→converti OK ; terminaux converti/perdu → ConflictError", async () => {
    const repo = repoA();
    const d = await creerDemande(repo, A, { nom: "Jean" });
    expect((await marquerContacte(repo, A, d.id)).statut).toBe("contacte");
    expect((await convertir(repo, A, d.id, 100)).statut).toBe("converti");
    await expect(marquerPerdu(repo, A, d.id)).rejects.toBeInstanceOf(ConflictError); // terminal
    const d2 = await creerDemande(repo, A, { nom: "Paul" });
    await marquerPerdu(repo, A, d2.id);
    await expect(marquerContacte(repo, A, d2.id)).rejects.toBeInstanceOf(ConflictError); // terminal
  });

  it("INV-5 : conversion anti-IDOR clientId + validation (nom/email)", async () => {
    const repo = repoA();
    const d = await creerDemande(repo, A, { nom: "Jean" });
    await expect(convertir(repo, A, d.id, 999)).rejects.toBeInstanceOf(NotFoundError); // clientId non possédé
    const converti = await convertir(repo, A, d.id, 100);
    expect(converti.clientId).toBe(100);
    // validation
    await expect(creerDemande(repo, A, { nom: " " })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerDemande(repo, A, { nom: "X", email: "invalide" })).rejects.toBeInstanceOf(ValidationError);
  });
});
