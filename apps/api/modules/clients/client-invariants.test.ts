import { describe, it, expect } from "vitest";
import { FakeClientRepository } from "./infra/client-repository-fake";
import { creerClient, modifierClient, supprimerClient } from "./application/write-use-cases";
import { getClient, rechercherClients, getEncoursClient } from "./application/read-use-cases";
import { calculerEncours, type FactureEncoursLigne } from "./application/encours";
import { ConflictError, NotFoundError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine clients (CRM / PII). Verrouille en un
// seul endroit, indépendamment du transport et de l'infra, les garanties à préserver.
const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const facture = (p: Partial<FactureEncoursLigne>): FactureEncoursLigne => ({
  clientId: 1,
  statut: "envoyee",
  totalTTC: "100.00",
  montantPaye: "0.00",
  dateEcheance: new Date("2026-12-01T00:00:00Z"),
  typeDocument: "facture",
  ...p,
});

describe("clients — invariants métier (synthèse)", () => {
  it("INV-1 : isolation PII — aucune voie de lecture/écriture ne fuit cross-tenant", async () => {
    const repo = new FakeClientRepository();
    const c = await creerClient(repo, A, { nom: "Privé", email: "prive@a.fr" });
    await expect(getClient(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierClient(repo, B, c.id, { nom: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerClient(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await rechercherClients(repo, B, "prive")).toEqual([]); // recherche scopée
    // le client de A est intact
    expect((await getClient(repo, A, c.id)).email).toBe("prive@a.fr");
  });

  it("INV-2 : intégrité référentielle — un client référencé n'est pas supprimable", async () => {
    const repo = new FakeClientRepository();
    const c = await creerClient(repo, A, { nom: "Référencé" });
    repo.setDocumentsLies(c.id, 2);
    await expect(supprimerClient(repo, A, c.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await getClient(repo, A, c.id)).not.toBeNull(); // toujours là
    // une fois les documents retirés, il redevient supprimable
    repo.setDocumentsLies(c.id, 0);
    await supprimerClient(repo, A, c.id);
    await expect(getClient(repo, A, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("INV-3 : recherche sûre — un métacaractère LIKE est littéral (pas de wildcard injection)", async () => {
    const repo = new FakeClientRepository();
    await creerClient(repo, A, { nom: "Normal" });
    await creerClient(repo, A, { nom: "a%b" });
    expect((await rechercherClients(repo, A, "%")).map((c) => c.nom)).toEqual(["a%b"]);
  });

  it("INV-4 : encours — seules les créances comptent, avoirs déduits, jamais négatif", async () => {
    const repo = new FakeClientRepository();
    repo.setFacturesEncours([
      facture({ clientId: 9, totalTTC: "100.00" }), // créance
      facture({ clientId: 9, statut: "payee", totalTTC: "999.00" }), // soldée → exclue
      facture({ clientId: 9, typeDocument: "avoir", totalTTC: "-150.00", statut: "envoyee" }), // crédit > dû
    ]);
    const enc = await getEncoursClient(repo, A, 9, Date.now());
    expect(enc.encoursTotal).toBe("0.00"); // planché à 0, jamais négatif
    // sanity : le calcul pur seul donne le même résultat
    expect(calculerEncours([facture({ totalTTC: "100.00" })], Date.now()).encoursTotal).toBe("100.00");
  });
});
