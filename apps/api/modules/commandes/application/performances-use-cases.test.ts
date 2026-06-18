import { describe, it, expect } from "vitest";
import { calculerPerformancesFournisseurs } from "./performances-use-cases";
import type { Commande } from "../domain/commande";
import type { Fournisseur } from "../../fournisseurs/domain/fournisseur";

const f = (id: number, nom: string): Fournisseur =>
  ({ id, nom, contact: null, email: null, telephone: null }) as Fournisseur;

const cmd = (over: Partial<Commande>): Commande =>
  ({
    id: over.id ?? 1,
    artisanId: 1,
    fournisseurId: over.fournisseurId ?? 1,
    numero: null,
    reference: null,
    dateCommande: new Date("2026-01-01"),
    dateLivraisonPrevue: over.dateLivraisonPrevue ?? null,
    dateLivraisonReelle: over.dateLivraisonReelle ?? null,
    statut: over.statut ?? "envoyee",
    totalHT: null,
    totalTVA: null,
    totalTTC: over.totalTTC ?? null,
    montantTotal: over.montantTotal ?? null,
    adresseLivraison: null,
    notes: null,
    statutFacturation: "a_facturer",
    depenseId: null,
    createdAt: over.createdAt ?? new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  }) as Commande;

describe("calculerPerformancesFournisseurs (pur)", () => {
  it("agrège par fournisseur : exclut les brouillons, compte livrées/retard, montant total", () => {
    const now = new Date("2026-02-01").getTime();
    const commandes: Commande[] = [
      cmd({ id: 1, fournisseurId: 10, statut: "brouillon", totalTTC: "999" }), // exclu
      cmd({ id: 2, fournisseurId: 10, statut: "livree", totalTTC: "100", dateLivraisonPrevue: new Date("2026-01-20"), dateLivraisonReelle: new Date("2026-01-18"), createdAt: new Date("2026-01-10") }), // à temps
      cmd({ id: 3, fournisseurId: 10, statut: "envoyee", totalTTC: "50", dateLivraisonPrevue: new Date("2026-01-15") }), // échéance dépassée (now=02-01) → retard
    ];
    const [perf] = calculerPerformancesFournisseurs(commandes, [f(10, "F10")], now);
    expect(perf.fournisseur.id).toBe(10);
    expect(perf.totalCommandes).toBe(2); // brouillon exclu
    expect(perf.commandesLivrees).toBe(1);
    expect(perf.commandesEnRetard).toBe(1); // la commande envoyée en retard
    expect(perf.montantTotal).toBe(150);
    expect(perf.tauxFiabilite).toBe(100); // la seule livrée datée était à temps
    expect(perf.delaiMoyenLivraison).toBe(8); // 18 - 10 = 8 jours
  });

  it("fournisseur sans commande → compteurs neutres (taux 100, délai null)", () => {
    const [perf] = calculerPerformancesFournisseurs([], [f(20, "F20")]);
    expect(perf).toMatchObject({ totalCommandes: 0, commandesLivrees: 0, commandesEnRetard: 0, delaiMoyenLivraison: null, tauxFiabilite: 100, montantTotal: 0 });
  });
});
