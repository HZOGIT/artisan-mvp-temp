import { describe, it, expect } from "vitest";
import { FakeClientRepository } from "../infra/client-repository-fake";
import { listClients, getClient } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
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
