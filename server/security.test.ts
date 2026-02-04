/**
 * TESTS DE SÉCURITÉ - ISOLATION MULTI-TENANT
 * 
 * Ce fichier contient les tests pour vérifier que l'isolation multi-tenant
 * fonctionne correctement et qu'aucun artisan ne peut accéder aux données
 * d'un autre artisan.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getClientsByArtisanIdSecure,
  getClientByIdSecure,
  createClientSecure,
  getDevisByArtisanIdSecure,
  getDevisByIdSecure,
  createDevisSecure,
  getFacturesByArtisanIdSecure,
  getFactureByIdSecure,
  getInterventionsByArtisanIdSecure,
  getInterventionByIdSecure,
  getStocksByArtisanIdSecure,
  getFournisseursByArtisanIdSecure,
} from "./db-secure";

/**
 * Scénario de test :
 * - Artisan 1 crée 3 clients
 * - Artisan 2 crée 2 clients
 * - Vérifier que Artisan 1 ne peut voir que ses 3 clients
 * - Vérifier que Artisan 2 ne peut voir que ses 2 clients
 * - Vérifier qu'aucun artisan ne peut accéder aux clients de l'autre
 */

describe("Multi-Tenant Isolation - Clients", () => {
  const artisan1Id = 1;
  const artisan2Id = 2;
  let artisan1Client1Id: number;
  let artisan1Client2Id: number;
  let artisan2Client1Id: number;

  beforeAll(async () => {
    // Artisan 1 crée 2 clients
    try {
      const client1 = await createClientSecure(artisan1Id, {
        nom: "Client Artisan 1 - A",
        prenom: "Test",
        email: "client1a@test.com",
      });
      artisan1Client1Id = client1.id;

      const client2 = await createClientSecure(artisan1Id, {
        nom: "Client Artisan 1 - B",
        prenom: "Test",
        email: "client1b@test.com",
      });
      artisan1Client2Id = client2.id;

      // Artisan 2 crée 1 client
      const client3 = await createClientSecure(artisan2Id, {
        nom: "Client Artisan 2 - A",
        prenom: "Test",
        email: "client2a@test.com",
      });
      artisan2Client1Id = client3.id;
    } catch (error) {
      console.error("Setup failed:", error);
    }
  });

  it("Artisan 1 devrait voir ses 2 clients", async () => {
    const clients = await getClientsByArtisanIdSecure(artisan1Id);
    expect(clients.length).toBe(2);
    expect(clients.some((c) => c.id === artisan1Client1Id)).toBe(true);
    expect(clients.some((c) => c.id === artisan1Client2Id)).toBe(true);
  });

  it("Artisan 2 devrait voir son 1 client", async () => {
    const clients = await getClientsByArtisanIdSecure(artisan2Id);
    expect(clients.length).toBe(1);
    expect(clients.some((c) => c.id === artisan2Client1Id)).toBe(true);
  });

  it("Artisan 1 ne devrait PAS voir les clients d'Artisan 2", async () => {
    const clients = await getClientsByArtisanIdSecure(artisan1Id);
    expect(clients.some((c) => c.id === artisan2Client1Id)).toBe(false);
  });

  it("Artisan 2 ne devrait PAS voir les clients d'Artisan 1", async () => {
    const clients = await getClientsByArtisanIdSecure(artisan2Id);
    expect(clients.some((c) => c.id === artisan1Client1Id)).toBe(false);
    expect(clients.some((c) => c.id === artisan1Client2Id)).toBe(false);
  });

  it("Artisan 1 ne devrait PAS pouvoir accéder au client d'Artisan 2 par ID", async () => {
    const client = await getClientByIdSecure(artisan2Client1Id, artisan1Id);
    expect(client).toBeUndefined();
  });

  it("Artisan 2 ne devrait PAS pouvoir accéder aux clients d'Artisan 1 par ID", async () => {
    const client1 = await getClientByIdSecure(artisan1Client1Id, artisan2Id);
    const client2 = await getClientByIdSecure(artisan1Client2Id, artisan2Id);
    expect(client1).toBeUndefined();
    expect(client2).toBeUndefined();
  });

  it("Artisan 1 devrait pouvoir accéder à ses propres clients par ID", async () => {
    const client = await getClientByIdSecure(artisan1Client1Id, artisan1Id);
    expect(client).toBeDefined();
    expect(client?.id).toBe(artisan1Client1Id);
    expect(client?.artisanId).toBe(artisan1Id);
  });

  it("Artisan 2 devrait pouvoir accéder à son propre client par ID", async () => {
    const client = await getClientByIdSecure(artisan2Client1Id, artisan2Id);
    expect(client).toBeDefined();
    expect(client?.id).toBe(artisan2Client1Id);
    expect(client?.artisanId).toBe(artisan2Id);
  });
});

/**
 * Scénario de test pour Devis :
 * - Artisan 1 crée 2 devis
 * - Artisan 2 crée 1 devis
 * - Vérifier l'isolation multi-tenant
 */

describe("Multi-Tenant Isolation - Devis", () => {
  const artisan1Id = 1;
  const artisan2Id = 2;
  const clientId1 = 1; // Supposé exister
  const clientId2 = 2; // Supposé exister

  it("Artisan 1 devrait voir uniquement ses devis", async () => {
    const devis = await getDevisByArtisanIdSecure(artisan1Id);
    expect(devis.every((d) => d.artisanId === artisan1Id)).toBe(true);
  });

  it("Artisan 2 devrait voir uniquement ses devis", async () => {
    const devis = await getDevisByArtisanIdSecure(artisan2Id);
    expect(devis.every((d) => d.artisanId === artisan2Id)).toBe(true);
  });

  it("Artisan 1 ne devrait PAS pouvoir accéder aux devis d'Artisan 2", async () => {
    const devis2 = await getDevisByArtisanIdSecure(artisan2Id);
    if (devis2.length > 0) {
      const devisId = devis2[0].id;
      const result = await getDevisByIdSecure(devisId, artisan1Id);
      expect(result).toBeUndefined();
    }
  });

  it("Artisan 2 ne devrait PAS pouvoir accéder aux devis d'Artisan 1", async () => {
    const devis1 = await getDevisByArtisanIdSecure(artisan1Id);
    if (devis1.length > 0) {
      const devisId = devis1[0].id;
      const result = await getDevisByIdSecure(devisId, artisan2Id);
      expect(result).toBeUndefined();
    }
  });
});

/**
 * Scénario de test pour Factures :
 * - Vérifier que chaque artisan ne voit que ses factures
 */

describe("Multi-Tenant Isolation - Factures", () => {
  const artisan1Id = 1;
  const artisan2Id = 2;

  it("Artisan 1 devrait voir uniquement ses factures", async () => {
    const factures = await getFacturesByArtisanIdSecure(artisan1Id);
    expect(factures.every((f) => f.artisanId === artisan1Id)).toBe(true);
  });

  it("Artisan 2 devrait voir uniquement ses factures", async () => {
    const factures = await getFacturesByArtisanIdSecure(artisan2Id);
    expect(factures.every((f) => f.artisanId === artisan2Id)).toBe(true);
  });

  it("Artisan 1 ne devrait PAS pouvoir accéder aux factures d'Artisan 2", async () => {
    const factures2 = await getFacturesByArtisanIdSecure(artisan2Id);
    if (factures2.length > 0) {
      const factureId = factures2[0].id;
      const result = await getFactureByIdSecure(factureId, artisan1Id);
      expect(result).toBeUndefined();
    }
  });
});

/**
 * Scénario de test pour Interventions :
 * - Vérifier que chaque artisan ne voit que ses interventions
 */

describe("Multi-Tenant Isolation - Interventions", () => {
  const artisan1Id = 1;
  const artisan2Id = 2;

  it("Artisan 1 devrait voir uniquement ses interventions", async () => {
    const interventions = await getInterventionsByArtisanIdSecure(artisan1Id);
    expect(interventions.every((i) => i.artisanId === artisan1Id)).toBe(true);
  });

  it("Artisan 2 devrait voir uniquement ses interventions", async () => {
    const interventions = await getInterventionsByArtisanIdSecure(artisan2Id);
    expect(interventions.every((i) => i.artisanId === artisan2Id)).toBe(true);
  });

  it("Artisan 1 ne devrait PAS pouvoir accéder aux interventions d'Artisan 2", async () => {
    const interventions2 = await getInterventionsByArtisanIdSecure(artisan2Id);
    if (interventions2.length > 0) {
      const interventionId = interventions2[0].id;
      const result = await getInterventionByIdSecure(interventionId, artisan1Id);
      expect(result).toBeUndefined();
    }
  });
});

/**
 * Scénario de test pour Stocks :
 * - Vérifier que chaque artisan ne voit que ses stocks
 */

describe("Multi-Tenant Isolation - Stocks", () => {
  const artisan1Id = 1;
  const artisan2Id = 2;

  it("Artisan 1 devrait voir uniquement ses stocks", async () => {
    const stocks = await getStocksByArtisanIdSecure(artisan1Id);
    expect(stocks.every((s) => s.artisanId === artisan1Id)).toBe(true);
  });

  it("Artisan 2 devrait voir uniquement ses stocks", async () => {
    const stocks = await getStocksByArtisanIdSecure(artisan2Id);
    expect(stocks.every((s) => s.artisanId === artisan2Id)).toBe(true);
  });
});

/**
 * Scénario de test pour Fournisseurs :
 * - Vérifier que chaque artisan ne voit que ses fournisseurs
 */

describe("Multi-Tenant Isolation - Fournisseurs", () => {
  const artisan1Id = 1;
  const artisan2Id = 2;

  it("Artisan 1 devrait voir uniquement ses fournisseurs", async () => {
    const fournisseurs = await getFournisseursByArtisanIdSecure(artisan1Id);
    expect(fournisseurs.every((f) => f.artisanId === artisan1Id)).toBe(true);
  });

  it("Artisan 2 devrait voir uniquement ses fournisseurs", async () => {
    const fournisseurs = await getFournisseursByArtisanIdSecure(artisan2Id);
    expect(fournisseurs.every((f) => f.artisanId === artisan2Id)).toBe(true);
  });
});
