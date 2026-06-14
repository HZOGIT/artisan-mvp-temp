import { describe, it, expect } from "vitest";
import { FakeContratRepository } from "../infra/contrat-repository-fake";
import { creerContrat, modifierContrat, supprimerContrat } from "./write-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const base = (over = {}) => ({ clientId: 100, titre: "Entretien", montantHT: "300.00", periodicite: "annuel" as const, dateDebut: new Date("2026-07-01T00:00:00Z"), ...over });

// Repo avec le client 100 possédé par l'artisan 1 (pour passer l'anti-IDOR).
function repoAvecClient() {
  const repo = new FakeContratRepository();
  repo.seedClient(1, 100);
  return repo;
}

describe("contrats-maintenance — write use-cases", () => {
  it("creerContrat valide : statut actif + reference serveur générée (CTR-xxxxx) ; artisanId scopé", async () => {
    const repo = repoAvecClient();
    const c = await creerContrat(repo, A, base());
    expect(c.artisanId).toBe(1);
    expect(c.statut).toBe("actif");
    expect(c.reference).toMatch(/^CTR-\d{5}$/);
  });

  it("validation : titre vide / montant négatif / tauxTVA hors [0,100] / dateFin < dateDebut → ValidationError", async () => {
    const repo = repoAvecClient();
    await expect(creerContrat(repo, A, base({ titre: " " }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerContrat(repo, A, base({ montantHT: "-1" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerContrat(repo, A, base({ tauxTVA: "150" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerContrat(repo, A, base({ dateFin: new Date("2026-06-01T00:00:00Z") }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("ANTI-IDOR : creerContrat avec un clientId NON possédé → NotFound ; possédé → OK", async () => {
    const repo = repoAvecClient();
    await expect(creerContrat(repo, A, base({ clientId: 999 }))).rejects.toBeInstanceOf(NotFoundError);
    const ok = await creerContrat(repo, A, base({ clientId: 100 }));
    expect(ok.clientId).toBe(100);
  });

  it("modifierContrat : NotFound si inexistant ; titre vide rejeté ; ne touche pas le statut", async () => {
    const repo = repoAvecClient();
    const c = await creerContrat(repo, A, base());
    await expect(modifierContrat(repo, A, 999999, { titre: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierContrat(repo, A, c.id, { titre: " " })).rejects.toBeInstanceOf(ValidationError);
    const maj = await modifierContrat(repo, A, c.id, { titre: "Nouveau", montantHT: "400.00" });
    expect(maj.titre).toBe("Nouveau");
    expect(maj.statut).toBe("actif"); // inchangé
  });

  it("supprimerContrat : NotFound si inexistant", async () => {
    const repo = repoAvecClient();
    const c = await creerContrat(repo, A, base());
    await supprimerContrat(repo, A, c.id);
    await expect(supprimerContrat(repo, A, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
