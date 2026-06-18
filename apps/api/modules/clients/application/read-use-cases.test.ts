import { describe, it, expect } from "vitest";
import { FakeClientRepository } from "../infra/client-repository-fake";
import { listClients, getClient, rechercherClients, getEncoursClient, getEncoursMap } from "./read-use-cases";
import type { FactureEncoursLigne } from "./encours";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("clients — use-cases de lecture", () => {
  it("listClients ne renvoie que les clients du tenant", async () => {
    const repo = new FakeClientRepository();
    await repo.create(A, { nom: "Chez A" });
    await repo.create(B, { nom: "Chez B" });
    const list = await listClients(repo, A);
    expect(list.map((c) => c.nom)).toEqual(["Chez A"]);
  });

  it("getClient renvoie le client du tenant propriétaire", async () => {
    const repo = new FakeClientRepository();
    const c = await repo.create(A, { nom: "Durand", email: "d@a.fr" });
    expect((await getClient(repo, A, c.id)).email).toBe("d@a.fr");
  });

  it("getClient sur un client d'un autre tenant → NotFound (anti-oracle PII)", async () => {
    const repo = new FakeClientRepository();
    const c = await repo.create(A, { nom: "Secret" });
    await expectCrossTenantDenied(() => getClient(repo, B, c.id));
    await expect(getClient(repo, B, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getClient sur un id inexistant → NotFound", async () => {
    const repo = new FakeClientRepository();
    await expect(getClient(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("clients — recherche (search)", () => {
  it("trouve par nom/e-mail, scopé au tenant", async () => {
    const repo = new FakeClientRepository();
    await repo.create(A, { nom: "Martin", email: "martin@a.fr" });
    await repo.create(A, { nom: "Dupont", email: "dupont@a.fr" });
    await repo.create(B, { nom: "Martin", email: "martin@b.fr" }); // homonyme chez B
    expect((await rechercherClients(repo, A, "mar")).map((c) => c.nom)).toEqual(["Martin"]);
    expect((await rechercherClients(repo, A, "dupont@a")).map((c) => c.nom)).toEqual(["Dupont"]);
    // le Martin de B n'apparaît jamais pour A
    expect((await rechercherClients(repo, A, "martin")).every((c) => c.artisanId === 1)).toBe(true);
  });

  it("requête vide → ValidationError", async () => {
    const repo = new FakeClientRepository();
    await expect(rechercherClients(repo, A, "   ")).rejects.toBeInstanceOf(ValidationError);
  });

  it("un wildcard LIKE (`%`) est traité littéralement (pas d'injection)", async () => {
    const repo = new FakeClientRepository();
    await repo.create(A, { nom: "Normal" });
    await repo.create(A, { nom: "a%b" });
    // `%` ne doit PAS tout matcher : seul le client contenant littéralement `%` ressort
    expect((await rechercherClients(repo, A, "%")).map((c) => c.nom)).toEqual(["a%b"]);
  });
});

describe("clients — encours (wiring use-case)", () => {
  const NOW = new Date("2026-06-13T12:00:00Z").getTime();
  const facture = (p: Partial<FactureEncoursLigne>): FactureEncoursLigne => ({
    clientId: 1,
    statut: "envoyee",
    totalTTC: "100.00",
    montantPaye: "0.00",
    dateEcheance: new Date("2026-12-01T00:00:00Z"),
    typeDocument: "facture",
    ...p,
  });

  it("getEncoursClient agrège les factures du client", async () => {
    const repo = new FakeClientRepository();
    repo.setFacturesEncours([
      facture({ clientId: 7, totalTTC: "100.00" }),
      facture({ clientId: 7, totalTTC: "50.00", montantPaye: "20.00" }),
    ]);
    const enc = await getEncoursClient(repo, A, 7, NOW);
    expect(enc.encoursTotal).toBe("130.00");
    expect(enc.nbFacturesImpayees).toBe(2);
  });

  it("getEncoursMap ne renvoie que les clients débiteurs", async () => {
    const repo = new FakeClientRepository();
    repo.setFacturesEncours([
      facture({ clientId: 1, totalTTC: "80.00" }),
      facture({ clientId: 2, statut: "payee", totalTTC: "999.00" }),
    ]);
    const map = await getEncoursMap(repo, A, NOW);
    expect(map[1].encoursTotal).toBe("80.00");
    expect(map[2]).toBeUndefined();
  });
});
