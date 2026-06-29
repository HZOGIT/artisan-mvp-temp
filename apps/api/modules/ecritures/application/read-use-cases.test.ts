import { describe, it, expect } from "vitest";
import { FakeEcritureRepository } from "../infra/ecriture-repository-fake";
import { listEcritures, listEcrituresFacture, balanceComptable, grandLivreComptable, genererExportFEC } from "./read-use-cases";
import type { TenantContext } from "../../../shared/tenant";
import type { CreateEcritureInput } from "../domain/ecriture";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const pieceVente = (factureId: number): CreateEcritureInput[] => {
  const d = new Date("2026-06-14T00:00:00Z");
  return [
    { dateEcriture: d, journal: "VE", numeroCompte: "411000", libelle: "F1", debit: "120.00", factureId },
    { dateEcriture: d, journal: "VE", numeroCompte: "706000", libelle: "F1", credit: "100.00", factureId },
    { dateEcriture: d, journal: "VE", numeroCompte: "445711", libelle: "F1", credit: "20.00", factureId },
  ];
};

describe("ecritures — use-cases de lecture", () => {
  it("listEcritures ne renvoie que les écritures du tenant", async () => {
    const repo = new FakeEcritureRepository();
    await repo.createMany(A, pieceVente(501));
    await repo.createMany(B, pieceVente(901));
    const list = await listEcritures(repo, A);
    expect(list.length).toBe(3);
    expect(list.every((e) => e.artisanId === 1)).toBe(true);
  });

  it("listEcrituresFacture scopé tenant ; facture d'un autre tenant → []", async () => {
    const repo = new FakeEcritureRepository();
    await repo.createMany(A, pieceVente(501));
    expect((await listEcrituresFacture(repo, A, 501)).length).toBe(3);
    expect(await listEcrituresFacture(repo, B, 501)).toEqual([]); // pas une écriture de B
    expect(await listEcrituresFacture(repo, A, 999)).toEqual([]); // facture sans écriture
  });

  it("createMany force l'artisanId + défauts ('0.00'/false) ; deleteByFacture idempotent", async () => {
    const repo = new FakeEcritureRepository();
    const [e] = await repo.createMany(A, [{ dateEcriture: new Date(), journal: "OD", numeroCompte: "471000", libelle: "Attente", factureId: 502 }]);
    expect(e.artisanId).toBe(1);
    expect(e.debit).toBe("0.00");
    expect(e.credit).toBe("0.00");
    expect(e.pointage).toBe(false);
    await repo.createMany(A, pieceVente(503));
    expect(await repo.deleteByFacture(A, 503)).toBe(3);
    expect(await repo.deleteByFacture(A, 503)).toBe(0); // déjà vide → idempotent
  });

  it("balanceComptable : agrégat par compte scopé tenant ; Σsoldes=0 (équilibré)", async () => {
    const repo = new FakeEcritureRepository();
    await repo.createMany(A, pieceVente(501));
    await repo.createMany(B, pieceVente(901)); // tenant B ignoré pour A
    const b = await balanceComptable(repo, A);
    expect(b.find((l) => l.numeroCompte === "411000")!.totalDebit).toBe("120.00");
    expect(b.reduce((s, l) => s + Number(l.solde), 0)).toBeCloseTo(0, 2);
  });

  it("grandLivreComptable : filtré par compte, scopé tenant", async () => {
    const repo = new FakeEcritureRepository();
    await repo.createMany(A, pieceVente(501));
    const gl = await grandLivreComptable(repo, A, "411000");
    expect(gl.length).toBe(1);
    expect(gl[0].numeroCompte).toBe("411000");
    expect(await grandLivreComptable(repo, B, "411000")).toEqual([]); // pas d'écriture de B
  });

  it("genererExportFEC : filtre par période + scopé tenant (header + lignes dans la fenêtre) ; conformite.equilibre", async () => {
    const repo = new FakeEcritureRepository();
    await repo.createMany(A, [
      { dateEcriture: new Date("2026-06-15T00:00:00Z"), journal: "VE", numeroCompte: "411000", libelle: "Dans", debit: "120.00", factureId: 501 },
      { dateEcriture: new Date("2026-06-15T00:00:00Z"), journal: "VE", numeroCompte: "706000", libelle: "Dans", credit: "100.00", factureId: 501 },
      { dateEcriture: new Date("2026-06-15T00:00:00Z"), journal: "VE", numeroCompte: "445711", libelle: "Dans", credit: "20.00", factureId: 501 },
      { dateEcriture: new Date("2026-01-01T00:00:00Z"), journal: "VE", numeroCompte: "411000", libelle: "Avant", debit: "50.00", factureId: 502 },
    ]);
    const result = await genererExportFEC(repo, A, new Date("2026-06-01T00:00:00Z"), new Date("2026-06-30T23:59:59Z"));
    const lines = result.fec.split("\n");
    expect(lines.length).toBe(4); // header + 3 lignes (celles de juin)
    expect(lines[1]).toContain("Dans");
    expect(lines[1]).not.toContain("Avant");
    expect(result.conformite.equilibre).toBe(true); // Σdébit=Σcrédit
    // tenant B : aucune écriture → header seul, équilibré
    const resB = await genererExportFEC(repo, B, new Date("2026-01-01"), new Date("2026-12-31"));
    expect(resB.fec.split("\n").length).toBe(1);
    expect(resB.conformite.equilibre).toBe(true);
  });
});
