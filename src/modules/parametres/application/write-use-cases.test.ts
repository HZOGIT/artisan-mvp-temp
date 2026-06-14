import { describe, it, expect } from "vitest";
import { FakeParametresRepository } from "../infra/parametres-repository-fake";
import { mettreAJourParametres } from "./write-use-cases";
import { getParametres } from "./read-use-cases";
import { defaultParametres } from "../domain/parametres";
import { ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);

describe("parametres — write use-cases (mettreAJourParametres)", () => {
  it("upsert valide : applique et renvoie l'état ; artisanId forcé", async () => {
    const repo = new FakeParametresRepository();
    const r = await mettreAJourParametres(repo, A, {
      prefixeFacture: "F2024",
      delaiPaiementJours: 30,
      delaiPaiementType: "fin_de_mois",
      objectifCA: "15000.50",
      couleurPrincipale: "#AABBCC",
    });
    expect(r.artisanId).toBe(1);
    expect(r.prefixeFacture).toBe("F2024");
    expect(r.delaiPaiementType).toBe("fin_de_mois");
    expect(r.objectifCA).toBe("15000.50");
  });

  it("préfixe vide après trim → ValidationError ; préfixe > 10 → ValidationError", async () => {
    const repo = new FakeParametresRepository();
    await expect(mettreAJourParametres(repo, A, { prefixeDevis: "   " })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourParametres(repo, A, { prefixeFacture: "TROP-LONG-XX" })).rejects.toBeInstanceOf(ValidationError);
    // borne haute exacte acceptée (10 car.)
    const ok = await mettreAJourParametres(repo, A, { prefixeAvoir: "AVOIR12345" });
    expect(ok.prefixeAvoir).toBe("AVOIR12345");
  });

  it("délais/rappels/objectifs négatifs ou non entiers → ValidationError", async () => {
    const repo = new FakeParametresRepository();
    await expect(mettreAJourParametres(repo, A, { delaiPaiementJours: -1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourParametres(repo, A, { rappelDevisJours: 1.5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourParametres(repo, A, { rappelFactureJours: -5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourParametres(repo, A, { objectifDevis: -2 })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourParametres(repo, A, { objectifClients: -3 })).rejects.toBeInstanceOf(ValidationError);
    // 0 accepté
    expect((await mettreAJourParametres(repo, A, { delaiPaiementJours: 0 })).delaiPaiementJours).toBe(0);
  });

  it("delaiPaiementType hors énumération → ValidationError", async () => {
    const repo = new FakeParametresRepository();
    await expect(mettreAJourParametres(repo, A, { delaiPaiementType: "comptant" })).rejects.toBeInstanceOf(ValidationError);
    expect((await mettreAJourParametres(repo, A, { delaiPaiementType: "net" })).delaiPaiementType).toBe("net");
  });

  it("objectifCA non décimal → ValidationError ; décimal valide accepté", async () => {
    const repo = new FakeParametresRepository();
    await expect(mettreAJourParametres(repo, A, { objectifCA: "abc" })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourParametres(repo, A, { objectifCA: "12.345" })).rejects.toBeInstanceOf(ValidationError);
    expect((await mettreAJourParametres(repo, A, { objectifCA: "999.99" })).objectifCA).toBe("999.99");
  });

  it("couleurs hors format #RRGGBB → ValidationError", async () => {
    const repo = new FakeParametresRepository();
    await expect(mettreAJourParametres(repo, A, { couleurPrincipale: "rouge" })).rejects.toBeInstanceOf(ValidationError);
    await expect(mettreAJourParametres(repo, A, { couleurSecondaire: "#FFF" })).rejects.toBeInstanceOf(ValidationError);
    expect((await mettreAJourParametres(repo, A, { couleurPrincipale: "#123abc" })).couleurPrincipale).toBe("#123abc");
  });

  it("upsert partiel : préserve les autres champs config", async () => {
    const repo = new FakeParametresRepository();
    await mettreAJourParametres(repo, A, { prefixeDevis: "D1", conditionsGenerales: "CGV" });
    const r = await mettreAJourParametres(repo, A, { prefixeDevis: "D2" });
    expect(r.prefixeDevis).toBe("D2");
    expect(r.conditionsGenerales).toBe("CGV");
  });

  it("INVARIANT : mettreAJourParametres ne touche pas aux compteurs de numérotation", async () => {
    const repo = new FakeParametresRepository();
    repo.seed({ ...defaultParametres(1), compteurFacture: 9, compteurDevis: 4, compteurAvoir: 2 });
    const r = await mettreAJourParametres(repo, A, { prefixeFacture: "X" });
    expect(r.compteurFacture).toBe(9);
    expect(r.compteurDevis).toBe(4);
    expect(r.compteurAvoir).toBe(2);
    expect((await getParametres(repo, A)).compteurFacture).toBe(9);
  });
});
