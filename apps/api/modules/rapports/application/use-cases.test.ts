import { describe, it, expect } from "vitest";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { FakeRapportRepository } from "../infra/rapport-repository-fake";
import { basculerFavori, creerRapport, executerRapport, listRapports, supprimerRapport } from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = 1;
const B = 2;

describe("rapports use-cases", () => {
  it("create + list scopés tenant", async () => {
    const repo = new FakeRapportRepository();
    await creerRapport(repo, ctx(A), { nom: "Ventes Q1", type: "ventes" });
    repo.seedRapport({ artisanId: B, nom: "Autre", type: "clients" });
    const list = await listRapports(repo, ctx(A));
    expect(list.map((r) => r.nom)).toEqual(["Ventes Q1"]);
  });

  it("delete/toggleFavori : non possédé (autre tenant) → NotFoundError", async () => {
    const repo = new FakeRapportRepository();
    const r = repo.seedRapport({ artisanId: A, nom: "R", type: "ventes" });
    await expect(supprimerRapport(repo, ctx(B), r.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(basculerFavori(repo, ctx(B), r.id)).rejects.toBeInstanceOf(NotFoundError);
    // Possédé → OK.
    const toggled = await basculerFavori(repo, ctx(A), r.id);
    expect(toggled.favori).toBe(true);
    expect(await supprimerRapport(repo, ctx(A), r.id)).toEqual({ success: true });
  });

  it("executer : type 'ventes' → lignes de l'entité + journalisation + tempsExecution (horloge injectée)", async () => {
    const repo = new FakeRapportRepository();
    const r = repo.seedRapport({ artisanId: A, nom: "Ventes", type: "ventes" });
    repo.seedEntite(A, "ventes", [{ id: 1 }, { id: 2 }, { id: 3 }]);
    let t = 1000;
    const clock = () => (t += 5); // start=1005, end=1010 → temps=5
    const res = await executerRapport(repo, ctx(A), r.id, { foo: "bar" }, clock);
    expect(res.nombreLignes).toBe(3);
    expect(res.tempsExecution).toBe(5);
    expect(repo.executions).toHaveLength(1);
    expect(repo.executions[0]).toMatchObject({ rapportId: r.id, nombreLignes: 3, parametres: { foo: "bar" } });
  });

  it("executer : type 'financier' → agrégat calculé depuis les factures", async () => {
    const repo = new FakeRapportRepository();
    const r = repo.seedRapport({ artisanId: A, nom: "Fin", type: "financier" });
    repo.seedEntite(A, "ventes", [{ statut: "payee", totalHT: "167.00", typeDocument: "facture" }, { statut: "brouillon", totalHT: "42.00", typeDocument: "facture" }]);
    const res = await executerRapport(repo, ctx(A), r.id, undefined, () => 0);
    expect(res.resultats).toEqual([{ totalCA: 167, nombreFactures: 2, facturesPayees: 1 }]);
    expect(res.nombreLignes).toBe(1);
  });

  it("executer : rapport d'un autre tenant → NotFoundError, aucune exécution journalisée", async () => {
    const repo = new FakeRapportRepository();
    const r = repo.seedRapport({ artisanId: A, nom: "Secret", type: "ventes" });
    await expect(executerRapport(repo, ctx(B), r.id, undefined, () => 0)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.executions).toHaveLength(0);
  });
});
