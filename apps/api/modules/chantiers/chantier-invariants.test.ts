import { describe, it, expect } from "vitest";
import { FakeChantierRepository } from "./infra/chantier-repository-fake";
import { creerChantier, modifierChantier, supprimerChantier } from "./application/write-use-cases";
import { getChantier } from "./application/read-use-cases";
import { NotFoundError, ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine chantiers. Verrouille en un seul endroit,
// indépendamment du transport et de l'infra, les garanties à préserver.
const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const CLIENT_A = 500;
function repoAvecClientA(): FakeChantierRepository {
  const repo = new FakeChantierRepository();
  repo.registerClient(1, CLIENT_A);
  return repo;
}
const base = (over = {}) => ({ clientId: CLIENT_A, reference: "CH-1", nom: "Chantier", ...over });

describe("chantiers — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — getById/modifier/supprimer hors tenant → NotFound", async () => {
    const repo = repoAvecClientA();
    const c = await creerChantier(repo, A, base());
    await expect(getChantier(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierChantier(repo, B, c.id, { nom: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerChantier(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getChantier(repo, A, c.id)).nom).toBe("Chantier"); // A intact
  });

  it("INV-2 : anti-IDOR-FK — créer un chantier pour un client hors tenant → NotFound", async () => {
    const repo = repoAvecClientA(); // CLIENT_A appartient à A, pas à B
    await expect(creerChantier(repo, B, base())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("INV-3 : client immuable — l'update ne porte pas clientId, le client ne change pas", async () => {
    const repo = repoAvecClientA();
    const c = await creerChantier(repo, A, base());
    // `UpdateChantierInput` n'expose pas `clientId` → impossible de réaffecter le chantier
    await modifierChantier(repo, A, c.id, { nom: "Renommé" });
    expect((await getChantier(repo, A, c.id)).clientId).toBe(CLIENT_A);
  });

  it("INV-4 : bornes — avancement 0..100, budgets ≥ 0, dates cohérentes", async () => {
    const repo = repoAvecClientA();
    await expect(creerChantier(repo, A, base({ avancement: 101 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerChantier(repo, A, base({ budgetRealise: "-1.00" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(
      creerChantier(repo, A, base({ dateDebut: "2026-07-10", dateFinPrevue: "2026-07-01" })),
    ).rejects.toBeInstanceOf(ValidationError);
    // bornes valides acceptées
    expect((await creerChantier(repo, A, base({ avancement: 100, budgetPrevisionnel: "0.00" }))).avancement).toBe(100);
  });
});
