import { describe, it, expect } from "vitest";
import { FakeChantierRepository } from "../infra/chantier-repository-fake";
import { creerChantier, modifierChantier, supprimerChantier } from "./write-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const CLIENT_A = 500;
function repoAvecClientA(): FakeChantierRepository {
  const repo = new FakeChantierRepository();
  repo.registerClient(1, CLIENT_A);
  return repo;
}
const base = (over = {}) => ({ clientId: CLIENT_A, reference: "CH-1", nom: "Chantier", ...over });

describe("chantiers — use-cases d'écriture (create / update)", () => {
  it("creerChantier OK quand le client appartient au tenant", async () => {
    const repo = repoAvecClientA();
    const c = await creerChantier(repo, A, base({ avancement: 0, budgetPrevisionnel: "10000.00" }));
    expect(c.id).toBeGreaterThan(0);
    expect(c.clientId).toBe(CLIENT_A);
    expect(c.statut).toBe("planifie");
  });

  it("creerChantier : reference|nom vide → ValidationError", async () => {
    const repo = repoAvecClientA();
    await expect(creerChantier(repo, A, base({ reference: "  " }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerChantier(repo, A, base({ nom: "" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerChantier : avancement hors [0,100] / budget négatif / dates incohérentes → ValidationError", async () => {
    const repo = repoAvecClientA();
    await expect(creerChantier(repo, A, base({ avancement: 150 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerChantier(repo, A, base({ budgetRealise: "-1.00" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(
      creerChantier(repo, A, base({ dateDebut: "2026-07-10", dateFinPrevue: "2026-07-01" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("ANTI-IDOR-FK : creerChantier avec un clientId hors tenant → NotFound", async () => {
    const repo = repoAvecClientA(); // CLIENT_A appartient à A, pas à B
    await expect(creerChantier(repo, B, base())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("modifierChantier OK ; avancement hors borne → Validation ; cross-tenant → NotFound", async () => {
    const repo = repoAvecClientA();
    const c = await creerChantier(repo, A, base());
    const maj = await modifierChantier(repo, A, c.id, { nom: "Renommé", avancement: 60 });
    expect(maj.nom).toBe("Renommé");
    expect(maj.avancement).toBe(60);
    await expect(modifierChantier(repo, A, c.id, { avancement: -5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(modifierChantier(repo, B, c.id, { nom: "hack" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("supprimerChantier OK / cross-tenant → NotFound", async () => {
    const repo = repoAvecClientA();
    const c = await creerChantier(repo, A, base());
    await expect(supprimerChantier(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerChantier(repo, A, c.id);
    await expect(supprimerChantier(repo, A, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
