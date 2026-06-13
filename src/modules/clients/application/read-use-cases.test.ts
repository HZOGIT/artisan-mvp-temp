import { describe, it, expect } from "vitest";
import { FakeClientRepository } from "../infra/client-repository-fake";
import { listClients, getClient, rechercherClients } from "./read-use-cases";
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
