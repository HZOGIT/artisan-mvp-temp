import { describe, it, expect } from "vitest";
import { FakeRelanceDevisRepository } from "./relance-devis-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({ devisId: 100, type: "email" as const, destinataire: "client@test.fr", ...over });

describe("FakeRelanceDevisRepository (journal append-only + anti-IDOR, sans DB)", () => {
  it("create force artisanId + statut défaut envoye", async () => {
    const repo = new FakeRelanceDevisRepository();
    const r = await repo.create(A, base());
    expect(r.artisanId).toBe(1);
    expect(r.statut).toBe("envoye");
    expect(r.type).toBe("email");
  });

  it("create avec statut echec explicite", async () => {
    const repo = new FakeRelanceDevisRepository();
    const r = await repo.create(A, base({ statut: "echec" }));
    expect(r.statut).toBe("echec");
  });

  it("list / listByDevis / getById scopés au tenant", async () => {
    const repo = new FakeRelanceDevisRepository();
    const r = await repo.create(A, base({ devisId: 100 }));
    await repo.create(A, base({ devisId: 200 }));
    expect(await repo.list(A)).toHaveLength(2);
    expect((await repo.listByDevis(A, 100)).map((x) => x.id)).toEqual([r.id]);
    expect((await repo.getById(A, r.id))?.devisId).toBe(100);
    expect(await repo.list(B)).toEqual([]);
    expect(await repo.listByDevis(B, 100)).toEqual([]);
  });

  it("isolation cross-tenant : B → getById null, delete inopérant", async () => {
    const repo = new FakeRelanceDevisRepository();
    const r = await repo.create(A, base());
    expect(await repo.getById(B, r.id)).toBeNull();
    expect(await repo.delete(B, r.id)).toBe(false);
    expect(await repo.delete(A, r.id)).toBe(true);
  });

  it("ownsDevis : true pour un devis seedé du tenant, false sinon", async () => {
    const repo = new FakeRelanceDevisRepository();
    repo.seedDevis(1, 100);
    expect(await repo.ownsDevis(A, 100)).toBe(true);
    expect(await repo.ownsDevis(A, 999)).toBe(false);
    expect(await repo.ownsDevis(B, 100)).toBe(false);
  });
});
