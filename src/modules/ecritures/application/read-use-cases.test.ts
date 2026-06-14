import { describe, it, expect } from "vitest";
import { FakeEcritureRepository } from "../infra/ecriture-repository-fake";
import { listEcritures, listEcrituresFacture } from "./read-use-cases";
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
});
