import { describe, it, expect } from "vitest";
import { FakeRelanceDevisRepository } from "./infra/relance-devis-repository-fake";
import { enregistrerRelance, supprimerRelance } from "./application/write-use-cases";
import { getRelance, listRelances, relancesParDevis } from "./application/read-use-cases";
import { NotFoundError, ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine relances-devis (journal append-only + anti-IDOR).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ devisId: 100, type: "email" as const, ...over });
function repoA() {
  const repo = new FakeRelanceDevisRepository();
  repo.seedDevis(1, 100); // devis 100 possédé par l'artisan 1
  return repo;
}

describe("relances-devis — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — list/byDevis/getById/delete d'un autre tenant → []/NotFound", async () => {
    const repo = repoA();
    const r = await enregistrerRelance(repo, A, base());
    expect(await listRelances(repo, B)).toEqual([]);
    expect(await relancesParDevis(repo, B, 100)).toEqual([]);
    await expect(getRelance(repo, B, r.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerRelance(repo, B, r.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getRelance(repo, A, r.id)).id).toBe(r.id); // intact pour A
  });

  it("INV-2 : artisanId forcé — enregistrer scope toujours au tenant courant", async () => {
    const repo = repoA();
    const r = await enregistrerRelance(repo, A, base());
    expect(r.artisanId).toBe(1);
  });

  it("INV-3 : anti-IDOR devisId — enregistrer avec un devisId non possédé → NotFound", async () => {
    const repo = repoA();
    await expect(enregistrerRelance(repo, A, base({ devisId: 999 }))).rejects.toBeInstanceOf(NotFoundError);
    const ok = await enregistrerRelance(repo, A, base({ devisId: 100 }));
    expect(ok.devisId).toBe(100);
  });

  it("INV-4 : immuabilité — le port n'expose aucune méthode d'update (append-only)", async () => {
    const repo = repoA();
    expect("update" in repo).toBe(false);
    expect("modifier" in repo).toBe(false);
  });

  it("INV-5 : validation — type/statut hors enum → ValidationError", async () => {
    const repo = repoA();
    await expect(enregistrerRelance(repo, A, base({ type: "sms" as never }))).rejects.toBeInstanceOf(ValidationError);
    await expect(enregistrerRelance(repo, A, base({ statut: "en_cours" as never }))).rejects.toBeInstanceOf(ValidationError);
    expect((await enregistrerRelance(repo, A, base({ statut: "echec" }))).statut).toBe("echec");
  });
});
