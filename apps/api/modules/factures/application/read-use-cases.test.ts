import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import { listFactures, getFacture, listLignesFacture } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ clientId: 100, numero: "FAC-00001", ...over });

describe("factures — use-cases de lecture", () => {
  it("listFactures ne renvoie que les factures du tenant", async () => {
    const repo = new FakeFactureRepository();
    await repo.create(A, base({ objet: "Chez A" }));
    await repo.create(B, base({ objet: "Chez B" }));
    const list = await listFactures(repo, A);
    expect(list.map((f) => f.objet)).toEqual(["Chez A"]);
  });

  it("getFacture renvoie la facture du tenant propriétaire", async () => {
    const repo = new FakeFactureRepository();
    const f = await repo.create(A, base({ objet: "Travaux" }));
    expect((await getFacture(repo, A, f.id)).objet).toBe("Travaux");
  });

  it("getFacture sur une facture d'un autre tenant → NotFound (ne révèle pas l'existence)", async () => {
    const repo = new FakeFactureRepository();
    const f = await repo.create(A, base({ objet: "Secret" }));
    await expectCrossTenantDenied(() => getFacture(repo, B, f.id));
    await expect(getFacture(repo, B, f.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getFacture sur un id inexistant → NotFound", async () => {
    const repo = new FakeFactureRepository();
    await expect(getFacture(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listLignesFacture : lignes de la facture du tenant ; vide pour un autre tenant (scope via parent)", async () => {
    const repo = new FakeFactureRepository();
    const f = await repo.create(A, base());
    await repo.addLigne(A, f.id, { designation: "Main d'œuvre", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20" });
    expect((await listLignesFacture(repo, A, f.id)).length).toBe(1);
    expect(await listLignesFacture(repo, B, f.id)).toEqual([]);
  });
});
