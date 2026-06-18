import { describe, it, expect } from "vitest";
import { FakeRdvRepository } from "../infra/rdv-repository-fake";
import { creerRdv, modifierRdv, supprimerRdv } from "./write-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const base = (over = {}) => ({ clientId: 100, titre: "Dépannage", dateProposee: new Date("2026-07-01T10:00:00Z"), ...over });

// Repo avec le client 100 possédé par l'artisan 1 (pour passer l'anti-IDOR).
function repoAvecClient() {
  const repo = new FakeRdvRepository();
  repo.seedClient(1, 100);
  return repo;
}

describe("rdv-en-ligne — write use-cases", () => {
  it("creerRdv valide : statut en_attente ; artisanId scopé", async () => {
    const repo = repoAvecClient();
    const r = await creerRdv(repo, A, base());
    expect(r.artisanId).toBe(1);
    expect(r.statut).toBe("en_attente");
  });

  it("validation : titre vide / date invalide / durée < 1 → ValidationError", async () => {
    const repo = repoAvecClient();
    await expect(creerRdv(repo, A, base({ titre: " " }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerRdv(repo, A, base({ dateProposee: new Date("invalid") }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerRdv(repo, A, base({ dureeEstimee: 0 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerRdv(repo, A, base({ dureeEstimee: 1.5 }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("ANTI-IDOR : creerRdv avec un clientId NON possédé → NotFound ; possédé → OK", async () => {
    const repo = repoAvecClient();
    await expect(creerRdv(repo, A, base({ clientId: 999 }))).rejects.toBeInstanceOf(NotFoundError);
    const ok = await creerRdv(repo, A, base({ clientId: 100 }));
    expect(ok.clientId).toBe(100);
  });

  it("modifierRdv : NotFound si inexistant ; titre vide rejeté ; ne touche pas le statut", async () => {
    const repo = repoAvecClient();
    const r = await creerRdv(repo, A, base());
    await expect(modifierRdv(repo, A, 999999, { titre: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierRdv(repo, A, r.id, { titre: " " })).rejects.toBeInstanceOf(ValidationError);
    const maj = await modifierRdv(repo, A, r.id, { titre: "Nouveau" });
    expect(maj.titre).toBe("Nouveau");
    expect(maj.statut).toBe("en_attente"); // inchangé
  });

  it("supprimerRdv : NotFound si inexistant", async () => {
    const repo = repoAvecClient();
    const r = await creerRdv(repo, A, base());
    await supprimerRdv(repo, A, r.id);
    await expect(supprimerRdv(repo, A, r.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
