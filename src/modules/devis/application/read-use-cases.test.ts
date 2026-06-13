import { describe, it, expect } from "vitest";
import { FakeDevisRepository } from "../infra/devis-repository-fake";
import { listDevis, getDevis, listLignesDevis } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ clientId: 100, numero: "DEV-00001", ...over });

describe("devis — use-cases de lecture", () => {
  it("listDevis ne renvoie que les devis du tenant", async () => {
    const repo = new FakeDevisRepository();
    await repo.create(A, base({ objet: "Chez A" }));
    await repo.create(B, base({ objet: "Chez B" }));
    const list = await listDevis(repo, A);
    expect(list.map((d) => d.objet)).toEqual(["Chez A"]);
  });

  it("getDevis renvoie le devis du tenant propriétaire", async () => {
    const repo = new FakeDevisRepository();
    const d = await repo.create(A, base({ objet: "Réno" }));
    expect((await getDevis(repo, A, d.id)).objet).toBe("Réno");
  });

  it("getDevis sur un devis d'un autre tenant → NotFound (ne révèle pas l'existence)", async () => {
    const repo = new FakeDevisRepository();
    const d = await repo.create(A, base({ objet: "Secret" }));
    await expectCrossTenantDenied(() => getDevis(repo, B, d.id));
    await expect(getDevis(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getDevis sur un id inexistant → NotFound", async () => {
    const repo = new FakeDevisRepository();
    await expect(getDevis(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listLignesDevis : lignes du devis du tenant ; vide pour un autre tenant (scope via parent)", async () => {
    const repo = new FakeDevisRepository();
    const d = await repo.create(A, base());
    await repo.addLigne(A, d.id, { designation: "Pose", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20" });
    expect((await listLignesDevis(repo, A, d.id)).length).toBe(1);
    expect(await listLignesDevis(repo, B, d.id)).toEqual([]);
  });
});
