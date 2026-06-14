import { describe, it, expect } from "vitest";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { FakeDevisOptionRepository } from "../infra/devis-option-repository-fake";
import {
  convertirOptionEnDevis,
  creerOption,
  listOptions,
  selectionnerOption,
  supprimerOption,
} from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = 1;
const B = 2;

describe("devisOptions use-cases (anti-IDOR via devis parent → NotFoundError)", () => {
  it("listOptions : devis possédé → liste triée par ordre ; devis d'un autre tenant → NotFoundError", async () => {
    const repo = new FakeDevisOptionRepository();
    repo.registerDevis(A, 10);
    repo.seedOption({ devisId: 10, nom: "Premium", ordre: 2 });
    repo.seedOption({ devisId: 10, nom: "Éco", ordre: 1 });
    const list = await listOptions(repo, ctx(A), 10);
    expect(list.map((o) => o.nom)).toEqual(["Éco", "Premium"]);
    await expect(listOptions(repo, ctx(B), 10)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creerOption : sous un devis possédé → option créée ; devis non possédé → NotFoundError", async () => {
    const repo = new FakeDevisOptionRepository();
    repo.registerDevis(A, 10);
    const opt = await creerOption(repo, ctx(A), { devisId: 10, nom: "Option 1", recommandee: true });
    expect(opt.nom).toBe("Option 1");
    expect(opt.recommandee).toBe(true);
    await expect(creerOption(repo, ctx(B), { devisId: 10, nom: "Hack" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("supprimerOption : option possédée → success ; autre tenant → NotFoundError (option intacte)", async () => {
    const repo = new FakeDevisOptionRepository();
    repo.registerDevis(A, 10);
    const opt = repo.seedOption({ devisId: 10, nom: "À supprimer" });
    await expect(supprimerOption(repo, ctx(B), opt.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await supprimerOption(repo, ctx(A), opt.id)).toEqual({ success: true });
    await expect(listOptions(repo, ctx(A), 10)).resolves.toEqual([]);
  });

  it("selectionnerOption : marque l'option et désélectionne les autres du même devis", async () => {
    const repo = new FakeDevisOptionRepository();
    repo.registerDevis(A, 10);
    const o1 = repo.seedOption({ devisId: 10, nom: "O1", selectionnee: true });
    const o2 = repo.seedOption({ devisId: 10, nom: "O2" });
    const sel = await selectionnerOption(repo, ctx(A), o2.id);
    expect(sel.selectionnee).toBe(true);
    const list = await listOptions(repo, ctx(A), 10);
    expect(list.find((o) => o.id === o1.id)?.selectionnee).toBe(false);
    expect(list.find((o) => o.id === o2.id)?.selectionnee).toBe(true);
  });

  it("selectionnerOption / convertirOptionEnDevis : option d'un autre tenant → NotFoundError", async () => {
    const repo = new FakeDevisOptionRepository();
    repo.registerDevis(A, 10);
    const opt = repo.seedOption({ devisId: 10, nom: "Secrète" });
    await expect(selectionnerOption(repo, ctx(B), opt.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(convertirOptionEnDevis(repo, ctx(B), opt.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("convertirOptionEnDevis : option possédée → success + option sélectionnée", async () => {
    const repo = new FakeDevisOptionRepository();
    repo.registerDevis(A, 10);
    const opt = repo.seedOption({ devisId: 10, nom: "Choisie" });
    expect(await convertirOptionEnDevis(repo, ctx(A), opt.id)).toEqual({ success: true });
    const list = await listOptions(repo, ctx(A), 10);
    expect(list.find((o) => o.id === opt.id)?.selectionnee).toBe(true);
  });

  it("listOptions/select/remove sur option/devis inexistant → NotFoundError", async () => {
    const repo = new FakeDevisOptionRepository();
    await expect(listOptions(repo, ctx(A), 999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(selectionnerOption(repo, ctx(A), 999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerOption(repo, ctx(A), 999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
