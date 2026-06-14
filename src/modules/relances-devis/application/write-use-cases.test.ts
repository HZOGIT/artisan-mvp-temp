import { describe, it, expect } from "vitest";
import { FakeRelanceDevisRepository } from "../infra/relance-devis-repository-fake";
import { enregistrerRelance, supprimerRelance } from "./write-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const base = (over = {}) => ({ devisId: 100, type: "email" as const, ...over });

// Repo avec le devis 100 possédé par l'artisan 1 (pour passer l'anti-IDOR).
function repoAvecDevis() {
  const repo = new FakeRelanceDevisRepository();
  repo.seedDevis(1, 100);
  return repo;
}

describe("relances-devis — write use-cases", () => {
  it("enregistrerRelance valide : statut défaut envoye ; artisanId scopé", async () => {
    const repo = repoAvecDevis();
    const r = await enregistrerRelance(repo, A, base());
    expect(r.artisanId).toBe(1);
    expect(r.statut).toBe("envoye");
  });

  it("validation : type / statut hors enum → ValidationError", async () => {
    const repo = repoAvecDevis();
    await expect(enregistrerRelance(repo, A, base({ type: "sms" as never }))).rejects.toBeInstanceOf(ValidationError);
    await expect(enregistrerRelance(repo, A, base({ statut: "en_cours" as never }))).rejects.toBeInstanceOf(ValidationError);
    expect((await enregistrerRelance(repo, A, base({ statut: "echec" }))).statut).toBe("echec");
  });

  it("ANTI-IDOR : enregistrer avec un devisId NON possédé → NotFound ; possédé → OK", async () => {
    const repo = repoAvecDevis();
    await expect(enregistrerRelance(repo, A, base({ devisId: 999 }))).rejects.toBeInstanceOf(NotFoundError);
    const ok = await enregistrerRelance(repo, A, base({ devisId: 100 }));
    expect(ok.devisId).toBe(100);
  });

  it("supprimerRelance : NotFound si inexistant", async () => {
    const repo = repoAvecDevis();
    const r = await enregistrerRelance(repo, A, base());
    await supprimerRelance(repo, A, r.id);
    await expect(supprimerRelance(repo, A, r.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
