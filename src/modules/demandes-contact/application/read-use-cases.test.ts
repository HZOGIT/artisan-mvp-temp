import { describe, it, expect } from "vitest";
import { FakeDemandeContactRepository } from "../infra/demande-contact-repository-fake";
import { listDemandes, demandesParStatut, getDemande } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("demandes-contact — read use-cases", () => {
  it("listDemandes renvoie les demandes du tenant", async () => {
    const repo = new FakeDemandeContactRepository();
    await repo.create(A, { nom: "Jean" });
    expect(await listDemandes(repo, A)).toHaveLength(1);
    expect(await listDemandes(repo, B)).toEqual([]);
  });

  it("demandesParStatut filtre par statut (scopé) ; [] si aucune", async () => {
    const repo = new FakeDemandeContactRepository();
    await repo.create(A, { nom: "Jean" });
    expect(await demandesParStatut(repo, A, "nouveau")).toHaveLength(1);
    expect(await demandesParStatut(repo, A, "converti")).toEqual([]);
  });

  it("getDemande → NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakeDemandeContactRepository();
    const d = await repo.create(A, { nom: "Jean" });
    expect((await getDemande(repo, A, d.id)).nom).toBe("Jean");
    await expect(getDemande(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDemande(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
