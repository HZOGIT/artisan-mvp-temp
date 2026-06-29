import { describe, it, expect } from "vitest";
import { FakeEcritureRepository } from "../infra/ecriture-repository-fake";
import { FakeFactureReader } from "../infra/facture-reader-fake";
import { genererEcrituresVente, genererEcrituresEncaissement, validerEcritures } from "./generation-use-cases";
import type { EcritureComptable } from "../domain/ecriture";
import type { TenantContext } from "../../../shared/tenant";
import { ConflictError } from "../../../shared/errors";
import type { FactureReadModel } from "./facture-reader";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const facture = (over: Partial<FactureReadModel> = {}): FactureReadModel => ({
  id: 501, artisanId: 1, numero: "FAC-00001", dateFacture: new Date("2026-06-14T00:00:00Z"),
  typeDocument: "facture", statut: "payee", datePaiement: new Date("2026-06-20T00:00:00Z"),
  totalHT: "100.00", totalTVA: "20.00", totalTTC: "120.00", ...over,
});

// Invariant FEC : Σ débit = Σ crédit, et aucun montant négatif.
function assertEquilibre(ecr: EcritureComptable[]): void {
  const d = ecr.reduce((s, e) => s + Number(e.debit), 0);
  const c = ecr.reduce((s, e) => s + Number(e.credit), 0);
  expect(d).toBeCloseTo(c, 2);
  expect(ecr.every((e) => Number(e.debit) >= 0 && Number(e.credit) >= 0)).toBe(true);
}

describe("ecritures — génération écritures de VENTE (FEC)", () => {
  it("facture : 411 débit TTC / 706 crédit HT / 445 crédit TVA ; Σdébit=Σcrédit", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture(), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    const ecr = await genererEcrituresVente(repo, reader, A, 501);
    expect(ecr.length).toBe(3);
    const c411 = ecr.find((e) => e.numeroCompte === "411000")!;
    const c706 = ecr.find((e) => e.numeroCompte === "706000")!;
    const cTva = ecr.find((e) => e.numeroCompte === "445711")!;
    expect(c411.debit).toBe("120.00");
    expect(c706.credit).toBe("100.00");
    expect(cTva.credit).toBe("20.00");
    assertEquilibre(ecr);
  });

  it("avoir : sens inversé (411 crédit / 706+445 débit), montants positifs ; Σdébit=Σcrédit", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ typeDocument: "avoir", totalHT: "-100.00", totalTVA: "-20.00", totalTTC: "-120.00", numero: "AV-00001" }), [
      { tauxTVA: "20.00", montantTVA: "-20.00" },
    ]);
    const ecr = await genererEcrituresVente(repo, reader, A, 501);
    expect(ecr.find((e) => e.numeroCompte === "411000")!.credit).toBe("120.00");
    expect(ecr.find((e) => e.numeroCompte === "706000")!.debit).toBe("100.00");
    expect(ecr.find((e) => e.numeroCompte === "445711")!.debit).toBe("20.00");
    assertEquilibre(ecr);
  });

  it("TVA ventilée par taux (20% + 10%) : 445711+445712 crédit, aucun 445710 générique ; Σdébit=Σcrédit", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ totalHT: "200.00", totalTVA: "30.00", totalTTC: "230.00" }), [
      { tauxTVA: "20.00", montantTVA: "20.00" },
      { tauxTVA: "10.00", montantTVA: "10.00" },
    ]);
    const ecr = await genererEcrituresVente(repo, reader, A, 501);
    expect(ecr.find((e) => e.numeroCompte === "445711")!.credit).toBe("20.00");
    expect(ecr.find((e) => e.numeroCompte === "445712")!.credit).toBe("10.00");
    /** anti-régression OPE-755 : le compte générique 445710 ne doit jamais apparaître */
    expect(ecr.some((e) => e.numeroCompte === "445710")).toBe(false);
    assertEquilibre(ecr);
  });

  it("TVA = 0 : seulement 411 + 706 ; Σdébit=Σcrédit (TTC = HT)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ totalTVA: "0.00", totalTTC: "100.00" }), []);
    const ecr = await genererEcrituresVente(repo, reader, A, 501);
    expect(ecr.length).toBe(2);
    assertEquilibre(ecr);
  });

  it("idempotence : 2 appels → une seule pièce en base (purge avant insert)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture(), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    await genererEcrituresVente(repo, reader, A, 501);
    await genererEcrituresVente(repo, reader, A, 501);
    expect((await repo.listByFacture(A, 501)).length).toBe(3); // pas 6
  });

  it("facture hors tenant → aucune écriture générée", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ artisanId: 1 }), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    expect(await genererEcrituresVente(repo, reader, B, 501)).toEqual([]);
    expect((await repo.list(B))).toEqual([]);
  });
});

describe("ecritures — génération écritures d'ENCAISSEMENT (FEC)", () => {
  it("facture payée : 512 débit / 411 crédit (TTC) lettrés ; Σdébit=Σcrédit", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ statut: "payee" }));
    const ecr = await genererEcrituresEncaissement(repo, reader, A, 501);
    expect(ecr.length).toBe(2);
    const banque = ecr.find((e) => e.numeroCompte === "512000")!;
    const client = ecr.find((e) => e.numeroCompte === "411000")!;
    expect(banque.debit).toBe("120.00");
    expect(banque.journal).toBe("BQ");
    expect(client.credit).toBe("120.00");
    expect(banque.lettrage).toBe("VL501");
    expect(client.lettrage).toBe("VL501");
    assertEquilibre(ecr);
  });

  it("facture NON payée → aucune écriture d'encaissement", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ statut: "envoyee" }));
    expect(await genererEcrituresEncaissement(repo, reader, A, 501)).toEqual([]);
  });

  it("avoir (TTC ≤ 0) → aucune écriture d'encaissement", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ statut: "payee", typeDocument: "avoir", totalTTC: "-120.00" }));
    expect(await genererEcrituresEncaissement(repo, reader, A, 501)).toEqual([]);
  });

  it("idempotence sélective : régénère BQ sans toucher la pièce de VENTE (VE)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ statut: "payee" }), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    await genererEcrituresVente(repo, reader, A, 501); // 3 lignes VE
    await genererEcrituresEncaissement(repo, reader, A, 501); // 2 lignes BQ
    await genererEcrituresEncaissement(repo, reader, A, 501); // re-génère BQ
    const all = await repo.listByFacture(A, 501);
    expect(all.filter((e) => e.journal === "VE").length).toBe(3); // VE intacte
    expect(all.filter((e) => e.journal === "BQ").length).toBe(2); // BQ régénérée (pas doublée)
  });
});

describe("ecritures — inaltérabilité (statut validée) — OPE-118", () => {
  it("validerEcritures marque toutes les écritures comme validées", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture(), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    await genererEcrituresVente(repo, reader, A, 501);
    const countValidated = await validerEcritures(repo, A, 501);
    expect(countValidated).toBe(3);
    const validated = await repo.listByFacture(A, 501);
    expect(validated.every((e) => e.statut === "validee")).toBe(true);
  });

  it("genererEcrituresVente idempotent si écritures validées (retourne liste vide)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture(), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    await genererEcrituresVente(repo, reader, A, 501); // génère VE
    await validerEcritures(repo, A, 501); // valide
    const result = await genererEcrituresVente(repo, reader, A, 501); // régénération = liste vide
    expect(result).toEqual([]);
    const all = await repo.listByFacture(A, 501);
    expect(all.length).toBe(3); // VE inchangée
  });

  it("validerEcritures ne marque que les écritures du tenant", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture(), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    await genererEcrituresVente(repo, reader, A, 501); // artisan A
    const countA = await validerEcritures(repo, A, 501);
    expect(countA).toBe(3);
    const beforeB = await repo.listByFacture(B, 501);
    expect(beforeB).toEqual([]); // artisan B n'a rien
  });

  it("hasValidatedEcritures retourne true après validation, false sinon", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture(), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    let has = await repo.hasValidatedEcritures(A, 501);
    expect(has).toBe(false);
    await genererEcrituresVente(repo, reader, A, 501);
    has = await repo.hasValidatedEcritures(A, 501);
    expect(has).toBe(false); // pas encore validées
    await validerEcritures(repo, A, 501);
    has = await repo.hasValidatedEcritures(A, 501);
    expect(has).toBe(true);
  });

  it("genererEcrituresEncaissement se régénère même après validation VE (BQ indépendant)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ statut: "payee" }), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    await genererEcrituresVente(repo, reader, A, 501); // VE
    await validerEcritures(repo, A, 501); // valide VE
    await genererEcrituresEncaissement(repo, reader, A, 501); // BQ (ne dépend pas de la validation VE)
    const all = await repo.listByFacture(A, 501);
    expect(all.filter((e) => e.journal === "VE" && e.statut === "validee").length).toBe(3);
    expect(all.filter((e) => e.journal === "BQ" && e.statut === "brouillon").length).toBe(2);
  });

  it("intégration : facture émise → genererEcrituresVente + validerEcritures → paiement génère ENCAISSEMENT (OPE-666)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ statut: "payee" }), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);

    const ecrInit = await genererEcrituresVente(repo, reader, A, 501);
    expect(ecrInit.every((e) => e.statut === "brouillon")).toBe(true);

    await validerEcritures(repo, A, 501);
    const afterValidate = await repo.listByFacture(A, 501);
    expect(afterValidate.every((e) => e.statut === "validee")).toBe(true);
    expect(afterValidate.filter((e) => e.journal === "VE").length).toBe(3);

    const regenResult = await genererEcrituresVente(repo, reader, A, 501);
    expect(regenResult).toEqual([]); // idempotent : retourne liste vide

    const encaissement = await genererEcrituresEncaissement(repo, reader, A, 501);
    expect(encaissement.filter((e) => e.journal === "BQ").length).toBe(2);

    const final = await repo.listByFacture(A, 501);
    expect(final.filter((e) => e.journal === "VE" && e.statut === "validee").length).toBe(3);
    expect(final.filter((e) => e.journal === "BQ" && e.statut === "brouillon").length).toBe(2);
  });
});

describe("ecritures — autoliquidation BTP (CGI art. 283-2 nonies)", () => {
  it("autoliquidation_btp : seulement 411+706 (pas de 445 collectée) ; Σdébit=Σcrédit", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(
      facture({ totalTVA: "0.00", totalTTC: "100.00", regimeTVA: "autoliquidation_btp" }),
      [{ tauxTVA: "20.00", montantTVA: "20.00" }],
    );
    const ecr = await genererEcrituresVente(repo, reader, A, 501);
    expect(ecr.length).toBe(2);
    expect(ecr.some((e) => e.numeroCompte.startsWith("445"))).toBe(false);
    const c411 = ecr.find((e) => e.numeroCompte === "411000")!;
    const c706 = ecr.find((e) => e.numeroCompte === "706000")!;
    expect(c411.debit).toBe("100.00");
    expect(c706.credit).toBe("100.00");
    assertEquilibre(ecr);
  });

  it("normal avec TVA 20% : garde les 3 écritures dont 445 (non-régression)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(
      facture({ totalHT: "100.00", totalTVA: "20.00", totalTTC: "120.00", regimeTVA: "normal" }),
      [{ tauxTVA: "20.00", montantTVA: "20.00" }],
    );
    const ecr = await genererEcrituresVente(repo, reader, A, 501);
    expect(ecr.length).toBe(3);
    expect(ecr.some((e) => e.numeroCompte.startsWith("445"))).toBe(true);
    assertEquilibre(ecr);
  });
});
