import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { FakeDashboardReader } from "../infra/dashboard-reader-fake";
import { getConversionRate, getStats, getTopClients } from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const NOW = new Date("2026-06-15T12:00:00Z");

describe("dashboard use-cases (wiring reader → pur, scopé tenant)", () => {
  it("getStats : agrège les lots du tenant ; un autre tenant a ses propres chiffres", async () => {
    const reader = new FakeDashboardReader();
    reader.seed(1, {
      factures: [{ id: 1, numero: "F", clientId: 1, statut: "payee", totalTTC: "200", dateFacture: NOW, datePaiement: NOW, createdAt: NOW }],
      devis: [{ id: 1, numero: "D", statut: "envoye", createdAt: NOW }],
      clients: [{ id: 1, nom: "C", prenom: null, createdAt: NOW }],
      interventions: [],
    });
    const s1 = await getStats(reader, ctx(1), () => NOW);
    expect(s1.totalFactures).toBe(1);
    expect(s1.devisEnCours).toBe(1);
    expect(s1.totalClients).toBe(1);
    const s2 = await getStats(reader, ctx(2), () => NOW);
    expect(s2.totalFactures).toBe(0);
  });

  it("getConversionRate : renvoie un nombre brut (parité quirk legacy)", async () => {
    const reader = new FakeDashboardReader();
    reader.seed(1, { devis: [{ id: 1, numero: "D", statut: "accepte", createdAt: NOW }, { id: 2, numero: "E", statut: "refuse", createdAt: NOW }] });
    expect(await getConversionRate(reader, ctx(1))).toBe(50);
  });

  it("getTopClients : top par CA", async () => {
    const reader = new FakeDashboardReader();
    reader.seed(1, {
      clients: [{ id: 1, nom: "A", prenom: null, createdAt: NOW }, { id: 2, nom: "B", prenom: null, createdAt: NOW }],
      factures: [{ id: 1, numero: "F", clientId: 2, statut: "payee", totalTTC: "500", dateFacture: NOW, datePaiement: NOW, createdAt: NOW }],
    });
    const top = await getTopClients(reader, ctx(1), 1);
    expect(top).toHaveLength(1);
    expect(top[0].client.id).toBe(2);
  });
});
