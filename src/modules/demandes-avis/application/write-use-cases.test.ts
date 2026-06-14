import { describe, it, expect } from "vitest";
import { FakeDemandeAvisRepository } from "../infra/demande-avis-repository-fake";
import { creerDemandeAvis, supprimerDemandeAvis } from "./write-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);

function seeded(): FakeDemandeAvisRepository {
  const repo = new FakeDemandeAvisRepository();
  repo.seedClient(A, 10);
  repo.seedIntervention(A, 20);
  return repo;
}

describe("demandes-avis — write use-cases", () => {
  it("creerDemandeAvis valide : artisanId scopé + statut envoyee + token non vide", async () => {
    const repo = seeded();
    const d = await creerDemandeAvis(repo, A, { clientId: 10, interventionId: 20 });
    expect(d.artisanId).toBe(1);
    expect(d.statut).toBe("envoyee");
    expect(d.tokenDemande.length).toBeGreaterThan(0);
  });

  it("INVARIANT anti-IDOR : clientId non possédé → NotFound ; interventionId non possédé → NotFound", async () => {
    const repo = seeded();
    await expect(creerDemandeAvis(repo, A, { clientId: 999, interventionId: 20 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(creerDemandeAvis(repo, A, { clientId: 10, interventionId: 999 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("validation : expiresAt dans le passé → ValidationError (avant même les vérifs FK)", async () => {
    const repo = seeded();
    const passe = new Date(Date.now() - 1000);
    await expect(creerDemandeAvis(repo, A, { clientId: 10, interventionId: 20, expiresAt: passe })).rejects.toBeInstanceOf(ValidationError);
    const futur = new Date(Date.now() + 60_000);
    expect((await creerDemandeAvis(repo, A, { clientId: 10, interventionId: 20, expiresAt: futur })).statut).toBe("envoyee");
  });

  it("supprimerDemandeAvis : NotFound si inexistant", async () => {
    const repo = seeded();
    const d = await creerDemandeAvis(repo, A, { clientId: 10, interventionId: 20 });
    await supprimerDemandeAvis(repo, A, d.id);
    await expect(supprimerDemandeAvis(repo, A, d.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
