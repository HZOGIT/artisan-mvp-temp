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

const fac = (over: Partial<DashFacture>): DashFacture => ({ id: 1, numero: "F", clientId: 1, statut: "payee", totalHT: "80.00", totalTTC: "100.00", typeDocument: "facture", dateFacture: NOW, datePaiement: null, createdAt: NOW, ...over });
const dev = (over: Partial<DashDevis>): DashDevis => ({ id: 1, numero: "D", statut: "brouillon", createdAt: NOW, ...over });
const cli = (over: Partial<DashClient>): DashClient => ({ id: 1, nom: "C", prenom: null, createdAt: NOW, ...over });
const inter = (over: Partial<DashIntervention>): DashIntervention => ({ id: 1, titre: "I", statut: "planifiee", dateDebut: NOW, clientId: 1, createdAt: NOW, ...over });

describe("dashboard domain (pur)", () => {
  it("computeStats : caMonth/caYear en HT (COALESCE datePaiement/createdAt), impayées TTC, compteurs, alias", () => {
    const factures = [
      fac({ id: 1, statut: "payee", totalHT: "83.00", totalTTC: "100.00", datePaiement: d("2026-06-10"), createdAt: d("2026-01-01") }), // mois courant
      fac({ id: 2, statut: "payee", totalHT: "42.00", totalTTC: "50.00", datePaiement: null, createdAt: d("2026-03-01") }), // année, pas mois
      fac({ id: 3, statut: "envoyee", totalHT: "25.00", totalTTC: "30.00", createdAt: d("2026-06-01") }), // impayée TTC
      fac({ id: 4, statut: "brouillon", totalHT: "800.00", totalTTC: "999.00", createdAt: d("2026-06-01") }), // ni payée ni impayée
    ];
    const devis = [dev({ id: 1, statut: "brouillon" }), dev({ id: 2, statut: "envoye" }), dev({ id: 3, statut: "accepte" })];
    const stats = computeStats(factures, devis, 7, [inter({ statut: "planifiee", dateDebut: d("2026-07-01") })], NOW);
    expect(stats.caMonth).toBe(83);
    expect(stats.caYear).toBe(125);
    expect(stats.facturesImpayees).toEqual({ count: 1, total: 30 });
    expect(stats.devisEnCours).toBe(2);
    expect(stats.interventionsAVenir).toBe(1);
    expect(stats.totalClients).toBe(7);
    expect(stats.totalDevis).toBe(3);
    expect(stats.totalFactures).toBe(4);
    expect({ ca: stats.chiffreAffaires, da: stats.devisEnAttente }).toEqual({ ca: 125, da: 2 });
  });

  it("computeStats : avoir validé déduit du CA HT, non compté en impayée", () => {
    const factures = [
      fac({ id: 1, statut: "payee", totalHT: "100.00", totalTTC: "120.00", datePaiement: d("2026-06-10") }),
      fac({ id: 2, statut: "validee", typeDocument: "avoir", totalHT: "-30.00", totalTTC: "-36.00", dateFacture: d("2026-06-12"), createdAt: d("2026-06-12") }),
    ];
    const stats = computeStats(factures, [], 0, [], NOW);
    expect(stats.caMonth).toBeCloseTo(70);
    expect(stats.caYear).toBeCloseTo(70);
    expect(stats.facturesImpayees).toEqual({ count: 0, total: 0 });
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

  it("computeMonthlyCA : bucket par mois (dateFacture) en HT, avoir validé déduit", () => {
    const factures = [
      fac({ statut: "payee", totalHT: "83.00", totalTTC: "100.00", dateFacture: d("2026-06-05") }),
      fac({ statut: "payee", totalHT: "167.00", totalTTC: "200.00", dateFacture: d("2026-06-20") }),
      fac({ statut: "payee", totalHT: "42.00", totalTTC: "50.00", dateFacture: d("2026-05-10") }),
      fac({ id: 4, statut: "validee", typeDocument: "avoir", totalHT: "-20.00", totalTTC: "-24.00", dateFacture: d("2026-06-18") }),
    ];
    const out = computeMonthlyCA(factures, 3, NOW);
    expect(out.map((p) => p.month)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(out[2]).toEqual({ month: "2026-06", ca: 230, count: 3 });
    expect(out[1]).toEqual({ month: "2026-05", ca: 42, count: 1 });
  });

  it("computeYearlyComparison : CA HT (payées + avoirs) année courante vs précédente", () => {
    const factures = [
      fac({ statut: "payee", totalHT: "83.00", totalTTC: "100.00", dateFacture: d("2026-02-01") }),
      fac({ statut: "payee", totalHT: "250.00", totalTTC: "300.00", dateFacture: d("2025-09-01") }),
      fac({ id: 3, statut: "validee", typeDocument: "avoir", totalHT: "-20.00", totalTTC: "-24.00", dateFacture: d("2026-03-01") }),
    ];
    expect(computeYearlyComparison(factures, NOW)).toEqual({ thisYear: 63, lastYear: 250 });
  });

  it("computeConversionRate : % accepté arrondi ; vide → 0 (NOMBRE brut, quirk legacy)", () => {
    expect(computeConversionRate([dev({ statut: "accepte" }), dev({ statut: "envoye" }), dev({ statut: "accepte" }), dev({ statut: "refuse" })])).toBe(50);
    expect(computeConversionRate([])).toBe(0);
  });

  it("computeTopClients : tri par CA HT décroissant, avoir déduit", () => {
    const clients = [cli({ id: 1, nom: "A" }), cli({ id: 2, nom: "B" })];
    const factures = [
      fac({ clientId: 1, totalHT: "83.00", totalTTC: "100.00" }),
      fac({ clientId: 2, totalHT: "250.00", totalTTC: "300.00" }),
      fac({ clientId: 2, totalHT: "42.00", totalTTC: "50.00" }),
      fac({ id: 4, clientId: 2, statut: "validee", typeDocument: "avoir", totalHT: "-20.00", totalTTC: "-24.00" }),
    ];
    const top = computeTopClients(factures, clients, 5);
    expect(top.map((t) => t.client.id)).toEqual([2, 1]);
    expect(top[0]).toMatchObject({ totalCA: 272, facturesCount: 3 });
    expect(top[1]).toMatchObject({ totalCA: 83, facturesCount: 1 });
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

  it("computeObjectifs : objectifs vs réalisé HT du mois", () => {
    const o = computeObjectifs(
      { objectifCA: "1000", objectifDevis: 10, objectifClients: 5 },
      [fac({ statut: "payee", totalHT: "208.00", totalTTC: "250.00", datePaiement: d("2026-06-10") })],
      [dev({ createdAt: d("2026-06-02") }), dev({ createdAt: d("2026-01-02") })],
      [cli({ createdAt: d("2026-06-03") })],
      NOW,
    );
    expect(o).toEqual({ objectifCA: 1000, currentCA: 208, objectifDevis: 10, currentDevis: 1, objectifClients: 5, currentClients: 1 });
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
