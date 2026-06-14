import { describe, it, expect } from "vitest";
import { FakeParametresRepository } from "./infra/parametres-repository-fake";
import { mettreAJourParametres } from "./application/write-use-cases";
import { getParametres } from "./application/read-use-cases";
import { defaultParametres } from "./domain/parametres";
import { ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine parametres (configuration artisan, singleton).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("parametres — invariants métier (synthèse)", () => {
  it("INV-1 : singleton — un seul enregistrement par tenant ; upsert idempotent ; get toujours défini", async () => {
    const repo = new FakeParametresRepository();
    await mettreAJourParametres(repo, A, { prefixeFacture: "F1" });
    await mettreAJourParametres(repo, A, { prefixeFacture: "F2" });
    const p = await getParametres(repo, A);
    expect(p).toBeDefined();
    expect(p.artisanId).toBe(1);
    expect(p.prefixeFacture).toBe("F2"); // pas de doublon : la même ligne est mise à jour
  });

  it("INV-2 : défauts — un tenant neuf lit la config par défaut (DEV/FAC/AV, net)", async () => {
    const repo = new FakeParametresRepository();
    const p = await getParametres(repo, A);
    expect(p).toEqual(defaultParametres(1));
    expect(p.prefixeDevis).toBe("DEV");
    expect(p.prefixeFacture).toBe("FAC");
    expect(p.prefixeAvoir).toBe("AV");
    expect(p.delaiPaiementType).toBe("net");
  });

  it("INV-3 : compteurs de numérotation inviolables — absents de l'input ; upsert config ne les touche pas", async () => {
    const repo = new FakeParametresRepository();
    repo.seed({ ...defaultParametres(1), compteurDevis: 12, compteurFacture: 7, compteurAvoir: 3 });
    const p = await mettreAJourParametres(repo, A, { prefixeFacture: "X", prefixeDevis: "Y" });
    expect(p.compteurDevis).toBe(12);
    expect(p.compteurFacture).toBe(7);
    expect(p.compteurAvoir).toBe(3);
    // garantie structurelle : le type UpdateParametresInput n'expose aucun champ compteur
    // (toute tentative `{ compteurFacture: 1 }` ne compilerait pas).
  });

  it("INV-4 : isolation cross-tenant — la config de A est invisible et non modifiable par B", async () => {
    const repo = new FakeParametresRepository();
    await mettreAJourParametres(repo, A, { prefixeFacture: "AAA", conditionsGenerales: "secret A" });
    const b = await getParametres(repo, B);
    expect(b).toEqual(defaultParametres(2)); // B voit ses défauts, jamais ceux de A
    // un upsert de B n'altère pas la config de A
    await mettreAJourParametres(repo, B, { prefixeFacture: "BBB" });
    expect((await getParametres(repo, A)).prefixeFacture).toBe("AAA");
  });

  it("INV-5 : validation — préfixes/délais/type/objectifCA/couleurs rejetés si invalides", async () => {
    const repo = new FakeParametresRepository();
    await expect(mettreAJourParametres(repo, A, { prefixeDevis: "  " })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourParametres(repo, A, { prefixeFacture: "TROP-LONG-XX" })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourParametres(repo, A, { delaiPaiementJours: -1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourParametres(repo, A, { delaiPaiementType: "comptant" })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourParametres(repo, A, { objectifCA: "abc" })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourParametres(repo, A, { couleurPrincipale: "rouge" })).rejects.toBeInstanceOf(ValidationError);
  });
});
