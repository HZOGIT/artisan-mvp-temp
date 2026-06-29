import { describe, it, expect, beforeEach } from "vitest";
import { FakeStockRepository } from "../infra/stock-repository-fake";
import { demarrerInventaire, saisirComptage, validerInventaire } from "./inventaire-use-cases";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = 1;
const B = 2;

describe("inventaire use-cases (fake repo, L1)", () => {
  let repo: FakeStockRepository;

  beforeEach(async () => {
    repo = new FakeStockRepository();
    await repo.create(ctx(A), { reference: "R1", designation: "Tube", quantiteEnStock: "10.00", prixAchat: "5.00" });
    await repo.create(ctx(A), { reference: "R2", designation: "Coude", quantiteEnStock: "20.00", prixAchat: "2.50" });
    await repo.create(ctx(B), { reference: "B1", designation: "Other", quantiteEnStock: "99.00" });
  });

  it("demarrerInventaire fige les quantités théoriques courantes", async () => {
    const inv = await demarrerInventaire(repo, ctx(A), {});
    expect(inv.inventaire.statut).toBe("brouillon");
    expect(inv.lignes).toHaveLength(2);
    expect(inv.lignes[0].quantiteTheorique).toBe("10.00");
    expect(inv.lignes[1].quantiteTheorique).toBe("20.00");
  });

  it("saisirComptage calcule l'écart (réel − théorique)", async () => {
    const inv = await demarrerInventaire(repo, ctx(A), {});
    const l0 = inv.lignes[0];
    const updated = await saisirComptage(repo, ctx(A), l0.id, "8");
    const ligne = updated.lignes.find((l) => l.id === l0.id)!;
    expect(ligne.quantiteReelle).toBe("8");
    expect(parseFloat(ligne.ecart!)).toBeCloseTo(-2, 5);
  });

  it("saisirComptage écart positif (surplus)", async () => {
    const inv = await demarrerInventaire(repo, ctx(A), {});
    const l1 = inv.lignes[1];
    const updated = await saisirComptage(repo, ctx(A), l1.id, "25");
    const ligne = updated.lignes.find((l) => l.id === l1.id)!;
    expect(parseFloat(ligne.ecart!)).toBeCloseTo(5, 5);
  });

  it("validerInventaire crée 1 mouvement par écart ≠ 0 et ajuste la quantité physique", async () => {
    const inv = await demarrerInventaire(repo, ctx(A), {});
    await saisirComptage(repo, ctx(A), inv.lignes[0].id, "8");
    await saisirComptage(repo, ctx(A), inv.lignes[1].id, "20"); /* pas d'écart sur R2 */

    const result = await validerInventaire(repo, ctx(A), inv.inventaire.id);
    expect(result.inventaire.statut).toBe("valide");
    expect(result.ajustementsCreees).toBe(1); /* R1 seul */

    const stocks = await repo.list(ctx(A));
    const r1 = stocks.find((s) => s.reference === "R1")!;
    const r2 = stocks.find((s) => s.reference === "R2")!;
    expect(parseFloat(r1.quantiteEnStock)).toBeCloseTo(8, 5);
    expect(parseFloat(r2.quantiteEnStock)).toBeCloseTo(20, 5);
  });

  it("validerInventaire valorise l'écart (|ecart| × prixAchat)", async () => {
    const inv = await demarrerInventaire(repo, ctx(A), {});
    await saisirComptage(repo, ctx(A), inv.lignes[0].id, "8"); /* écart = -2, px = 5 → 10 */
    await saisirComptage(repo, ctx(A), inv.lignes[1].id, "25"); /* écart = +5, px = 2.50 → 12.50 */
    const result = await validerInventaire(repo, ctx(A), inv.inventaire.id);
    expect(result.valeurEcart).toBeCloseTo(10 + 12.5, 2);
  });

  it("validerInventaire est idempotent : rejette la double validation", async () => {
    const inv = await demarrerInventaire(repo, ctx(A), {});
    await validerInventaire(repo, ctx(A), inv.inventaire.id);
    await expect(validerInventaire(repo, ctx(A), inv.inventaire.id)).rejects.toThrow("déjà validé");
  });

  it("demarrerInventaire refuse si aucun article", async () => {
    const repoVide = new FakeStockRepository();
    await expect(demarrerInventaire(repoVide, ctx(A), {})).rejects.toThrow();
  });

  it("isolation tenant : B ne peut pas valider l'inventaire de A", async () => {
    const inv = await demarrerInventaire(repo, ctx(A), {});
    const result = await repo.validerInventaire(ctx(B), inv.inventaire.id);
    expect(result).toBeNull(); /* repo retourne null pour hors tenant */
  });
});
