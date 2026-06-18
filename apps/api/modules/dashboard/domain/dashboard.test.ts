import { describe, it, expect } from "vitest";
import {
  computeAlerts,
  computeClientEvolution,
  computeConversionRate,
  computeMonthlyCA,
  computeObjectifs,
  computeRecentActivity,
  computeStats,
  computeTopClients,
  computeYearlyComparison,
} from "./dashboard";
import type { DashClient, DashDevis, DashFacture, DashIntervention } from "./dashboard";

const NOW = new Date("2026-06-15T12:00:00Z");
const d = (s: string) => new Date(s);

const fac = (over: Partial<DashFacture>): DashFacture => ({ id: 1, numero: "F", clientId: 1, statut: "payee", totalTTC: "100.00", dateFacture: NOW, datePaiement: null, createdAt: NOW, ...over });
const dev = (over: Partial<DashDevis>): DashDevis => ({ id: 1, numero: "D", statut: "brouillon", createdAt: NOW, ...over });
const cli = (over: Partial<DashClient>): DashClient => ({ id: 1, nom: "C", prenom: null, createdAt: NOW, ...over });
const inter = (over: Partial<DashIntervention>): DashIntervention => ({ id: 1, titre: "I", statut: "planifiee", dateDebut: NOW, clientId: 1, createdAt: NOW, ...over });

describe("dashboard domain (pur)", () => {
  it("computeStats : caMonth/caYear (COALESCE datePaiement/createdAt), impayées, compteurs, alias", () => {
    const factures = [
      fac({ id: 1, statut: "payee", totalTTC: "100", datePaiement: d("2026-06-10"), createdAt: d("2026-01-01") }), // mois courant
      fac({ id: 2, statut: "payee", totalTTC: "50", datePaiement: null, createdAt: d("2026-03-01") }), // année, pas mois
      fac({ id: 3, statut: "envoyee", totalTTC: "30", createdAt: d("2026-06-01") }), // impayée
      fac({ id: 4, statut: "brouillon", totalTTC: "999", createdAt: d("2026-06-01") }), // ni payée ni impayée
    ];
    const devis = [dev({ id: 1, statut: "brouillon" }), dev({ id: 2, statut: "envoye" }), dev({ id: 3, statut: "accepte" })];
    const stats = computeStats(factures, devis, 7, [inter({ statut: "planifiee", dateDebut: d("2026-07-01") })], NOW);
    expect(stats.caMonth).toBe(100);
    expect(stats.caYear).toBe(150);
    expect(stats.facturesImpayees).toEqual({ count: 1, total: 30 });
    expect(stats.devisEnCours).toBe(2);
    expect(stats.interventionsAVenir).toBe(1);
    expect(stats.totalClients).toBe(7);
    expect(stats.totalDevis).toBe(3);
    expect(stats.totalFactures).toBe(4);
    expect({ ca: stats.chiffreAffaires, da: stats.devisEnAttente }).toEqual({ ca: 150, da: 2 });
  });

  it("computeRecentActivity : prend `limit` par type, fusionne, trie date desc, tronque", () => {
    const out = computeRecentActivity(
      [dev({ id: 1, numero: "D1", createdAt: d("2026-06-10") })],
      [fac({ id: 2, numero: "F1", statut: "payee", createdAt: d("2026-06-12") })],
      [inter({ id: 3, titre: "I1", createdAt: d("2026-06-11") })],
      [cli({ id: 4, nom: "Dupont", prenom: "Jean", createdAt: d("2026-06-09") })],
      10,
    );
    expect(out.map((a) => a.type)).toEqual(["facture", "intervention", "devis", "client"]);
    expect(out[0].titre).toBe("Facture F1 payée");
    expect(out[3].titre).toBe("Client Jean Dupont ajouté");
  });

  it("computeMonthlyCA : bucket par mois (dateFacture), du plus ancien au plus récent", () => {
    const factures = [
      fac({ statut: "payee", totalTTC: "100", dateFacture: d("2026-06-05") }),
      fac({ statut: "payee", totalTTC: "200", dateFacture: d("2026-06-20") }),
      fac({ statut: "payee", totalTTC: "50", dateFacture: d("2026-05-10") }),
    ];
    const out = computeMonthlyCA(factures, 3, NOW);
    expect(out.map((p) => p.month)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(out[2]).toEqual({ month: "2026-06", ca: 300, count: 2 });
    expect(out[1]).toEqual({ month: "2026-05", ca: 50, count: 1 });
  });

  it("computeYearlyComparison : CA payé année courante vs précédente", () => {
    const factures = [
      fac({ statut: "payee", totalTTC: "100", dateFacture: d("2026-02-01") }),
      fac({ statut: "payee", totalTTC: "300", dateFacture: d("2025-09-01") }),
    ];
    expect(computeYearlyComparison(factures, NOW)).toEqual({ thisYear: 100, lastYear: 300 });
  });

  it("computeConversionRate : % accepté arrondi ; vide → 0 (NOMBRE brut, quirk legacy)", () => {
    expect(computeConversionRate([dev({ statut: "accepte" }), dev({ statut: "envoye" }), dev({ statut: "accepte" }), dev({ statut: "refuse" })])).toBe(50);
    expect(computeConversionRate([])).toBe(0);
  });

  it("computeTopClients : tri par CA total décroissant", () => {
    const clients = [cli({ id: 1, nom: "A" }), cli({ id: 2, nom: "B" })];
    const factures = [fac({ clientId: 1, totalTTC: "100" }), fac({ clientId: 2, totalTTC: "300" }), fac({ clientId: 2, totalTTC: "50" })];
    const top = computeTopClients(factures, clients, 5);
    expect(top.map((t) => t.client.id)).toEqual([2, 1]);
    expect(top[0]).toMatchObject({ totalCA: 350, facturesCount: 2 });
  });

  it("computeClientEvolution : cumul à fin de mois", () => {
    const clients = [cli({ createdAt: d("2026-04-15") }), cli({ createdAt: d("2026-06-01") })];
    const out = computeClientEvolution(clients, 3, NOW);
    expect(out).toEqual([
      { month: "2026-04", count: 1 },
      { month: "2026-05", count: 1 },
      { month: "2026-06", count: 2 },
    ]);
  });

  it("computeObjectifs : objectifs vs réalisé du mois", () => {
    const o = computeObjectifs(
      { objectifCA: "1000", objectifDevis: 10, objectifClients: 5 },
      [fac({ statut: "payee", totalTTC: "250", datePaiement: d("2026-06-10") })],
      [dev({ createdAt: d("2026-06-02") }), dev({ createdAt: d("2026-01-02") })],
      [cli({ createdAt: d("2026-06-03") })],
      NOW,
    );
    expect(o).toEqual({ objectifCA: 1000, currentCA: 250, objectifDevis: 10, currentDevis: 1, objectifClients: 5, currentClients: 1 });
  });

  it("computeAlerts : factures +30j (danger), devis +7j (warning), interventions 48h (info)", () => {
    const factures = [fac({ statut: "envoyee", totalTTC: "120", createdAt: d("2026-05-01") })]; // ~45j
    const devis = [dev({ statut: "envoye", createdAt: d("2026-06-01") })]; // 14j
    const interventions = [inter({ titre: "Visite", dateDebut: d("2026-06-16T10:00:00Z") })]; // ~22h
    const alerts = computeAlerts(factures, devis, interventions, NOW);
    expect(alerts.map((a) => a.type)).toEqual(["danger", "warning", "info"]);
    expect(alerts[0].message).toContain("120.00 EUR");
    expect(alerts[2].titre).toContain("1 intervention");
  });

  it("computeAlerts : rien à signaler → []", () => {
    expect(computeAlerts([], [], [], NOW)).toEqual([]);
  });
});
