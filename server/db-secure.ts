/**
 * FICHIER DE REFACTORING SÉCURISÉ - db-secure.ts
 * 
 * Ce fichier contient les versions sécurisées des fonctions critiques de db.ts
 * avec isolation multi-tenant et protection contre les injections SQL.
 * 
 * STRATÉGIE DE MIGRATION :
 * 1. Créer les versions sécurisées ici
 * 2. Tester chaque fonction
 * 3. Remplacer progressivement dans db.ts
 * 4. Valider l'isolation multi-tenant
 */

import { 
  and, eq, or, like, desc, asc, sql, inArray
} from "drizzle-orm";
import { 
  clients, Client, InsertClient,
  devis, Devis, InsertDevis,
  devisLignes, DevisLigne, InsertDevisLigne,
  factures, Facture, InsertFacture,
  interventions, Intervention, InsertIntervention,
  stocks, Stock, InsertStock,
  fournisseurs, Fournisseur, InsertFournisseur,
} from "../drizzle/schema";
import { getDb } from "./db";
import { createSecureQuery, validateArtisanId } from "./_core/security";
import { logError } from "./_core/errorHandler";

// ============================================================================
// CLIENTS - REFACTORED WITH MULTI-TENANT ISOLATION
// ============================================================================

/**
 * Récupérer tous les clients d'un artisan (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 * ✅ Paramètres sécurisés
 */
export async function getClientsByArtisanIdSecure(
  artisanId: number
): Promise<Client[]> {
  try {
    // Valider l'artisanId
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) return [];

    // Créer une requête sécurisée avec isolation multi-tenant
    return await db.select()
      .from(clients)
      .where(eq(clients.artisanId, artisanId))
      .orderBy(desc(clients.createdAt));
  } catch (error) {
    logError(error, { artisanId, operation: "getClientsByArtisanIdSecure" });
    return [];
  }
}

/**
 * Récupérer un client par ID avec vérification d'appartenance (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 * ✅ Vérification d'ownership
 */
export async function getClientByIdSecure(
  clientId: number,
  artisanId: number
): Promise<Client | undefined> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select()
      .from(clients)
      .where(and(
        eq(clients.id, clientId),
        eq(clients.artisanId, artisanId) // ✅ CRITICAL: Vérifier l'appartenance
      ))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    logError(error, { clientId, artisanId, operation: "getClientByIdSecure" });
    return undefined;
  }
}

/**
 * Créer un client (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 * ✅ Validation des données
 */
export async function createClientSecure(
  artisanId: number,
  data: Omit<InsertClient, 'artisanId'>
): Promise<Client> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Valider les données requises
    if (!data.nom || data.nom.trim().length === 0) {
      throw new Error("Le nom du client est requis");
    }

    // Forcer l'artisanId pour éviter les injections
    const clientData: InsertClient = {
      ...data,
      artisanId, // ✅ CRITICAL: Forcer l'artisanId
    };

    const result = await db.insert(clients).values(clientData);
    const insertId = Number(result[0].insertId);

    const created = await db.select()
      .from(clients)
      .where(and(
        eq(clients.id, insertId),
        eq(clients.artisanId, artisanId) // ✅ CRITICAL: Vérifier l'appartenance
      ))
      .limit(1);

    if (created.length === 0) {
      throw new Error("Failed to retrieve created client");
    }

    return created[0];
  } catch (error) {
    logError(error, { artisanId, operation: "createClientSecure" });
    throw error;
  }
}

/**
 * Mettre à jour un client (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 * ✅ Vérification d'ownership
 */
export async function updateClientSecure(
  clientId: number,
  artisanId: number,
  data: Partial<Omit<InsertClient, 'artisanId'>>
): Promise<Client> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Vérifier que le client appartient à l'artisan
    const existing = await getClientByIdSecure(clientId, artisanId);
    if (!existing) {
      throw new Error("Client not found or access denied");
    }

    // Mettre à jour avec vérification d'appartenance
    await db.update(clients)
      .set(data)
      .where(and(
        eq(clients.id, clientId),
        eq(clients.artisanId, artisanId) // ✅ CRITICAL: Vérifier l'appartenance
      ));

    const updated = await db.select()
      .from(clients)
      .where(and(
        eq(clients.id, clientId),
        eq(clients.artisanId, artisanId)
      ))
      .limit(1);

    if (updated.length === 0) {
      throw new Error("Client not found");
    }

    return updated[0];
  } catch (error) {
    logError(error, { clientId, artisanId, operation: "updateClientSecure" });
    throw error;
  }
}

/**
 * Supprimer un client (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 * ✅ Vérification d'ownership
 */
export async function deleteClientSecure(
  clientId: number,
  artisanId: number
): Promise<void> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Vérifier que le client appartient à l'artisan
    const existing = await getClientByIdSecure(clientId, artisanId);
    if (!existing) {
      throw new Error("Client not found or access denied");
    }

    // Supprimer avec vérification d'appartenance
    await db.delete(clients)
      .where(and(
        eq(clients.id, clientId),
        eq(clients.artisanId, artisanId) // ✅ CRITICAL: Vérifier l'appartenance
      ));
  } catch (error) {
    logError(error, { clientId, artisanId, operation: "deleteClientSecure" });
    throw error;
  }
}

/**
 * Rechercher des clients (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 * ✅ Paramètres sécurisés (pas d'interpolation directe)
 * ✅ Protection contre SQL Injection
 */
export async function searchClientsSecure(
  artisanId: number,
  query: string,
  limit: number = 50
): Promise<Client[]> {
  try {
    validateArtisanId(artisanId);

    // Valider et nettoyer la requête
    if (!query || query.trim().length === 0) {
      return await getClientsByArtisanIdSecure(artisanId);
    }

    const searchTerm = query.trim().substring(0, 100); // Limiter la longueur

    const db = await getDb();
    if (!db) return [];

    // ✅ CRITICAL: Utiliser des paramètres sécurisés avec Drizzle
    // Pas d'interpolation directe de la requête
    return await db.select()
      .from(clients)
      .where(and(
        eq(clients.artisanId, artisanId),
        or(
          like(clients.nom, `%${searchTerm}%`),
          like(clients.prenom, `%${searchTerm}%`),
          like(clients.email, `%${searchTerm}%`),
          like(clients.telephone, `%${searchTerm}%`)
        )
      ))
      .orderBy(desc(clients.createdAt))
      .limit(limit);
  } catch (error) {
    logError(error, { artisanId, query, operation: "searchClientsSecure" });
    return [];
  }
}

// ============================================================================
// DEVIS - REFACTORED WITH MULTI-TENANT ISOLATION
// ============================================================================

/**
 * Récupérer tous les devis d'un artisan (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 */
export async function getDevisByArtisanIdSecure(
  artisanId: number
): Promise<Devis[]> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) return [];

    return await db.select()
      .from(devis)
      .where(eq(devis.artisanId, artisanId))
      .orderBy(desc(devis.dateDevis));
  } catch (error) {
    logError(error, { artisanId, operation: "getDevisByArtisanIdSecure" });
    return [];
  }
}

/**
 * Récupérer un devis par ID avec vérification d'appartenance (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 * ✅ Vérification d'ownership
 */
export async function getDevisByIdSecure(
  devisId: number,
  artisanId: number
): Promise<Devis | undefined> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select()
      .from(devis)
      .where(and(
        eq(devis.id, devisId),
        eq(devis.artisanId, artisanId) // ✅ CRITICAL: Vérifier l'appartenance
      ))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    logError(error, { devisId, artisanId, operation: "getDevisByIdSecure" });
    return undefined;
  }
}

/**
 * Créer un devis (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 */
export async function createDevisSecure(
  artisanId: number,
  clientId: number,
  data: Omit<InsertDevis, 'artisanId' | 'clientId'>
): Promise<Devis> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Vérifier que le client appartient à l'artisan
    const client = await getClientByIdSecure(clientId, artisanId);
    if (!client) {
      throw new Error("Client not found or access denied");
    }

    // Forcer les IDs pour éviter les injections
    const devisData: InsertDevis = {
      ...data,
      artisanId, // ✅ CRITICAL: Forcer l'artisanId
      clientId,
    };

    const result = await db.insert(devis).values(devisData);
    const insertId = Number(result[0].insertId);

    const created = await db.select()
      .from(devis)
      .where(and(
        eq(devis.id, insertId),
        eq(devis.artisanId, artisanId)
      ))
      .limit(1);

    if (created.length === 0) {
      throw new Error("Failed to retrieve created devis");
    }

    return created[0];
  } catch (error) {
    logError(error, { artisanId, clientId, operation: "createDevisSecure" });
    throw error;
  }
}

/**
 * Mettre à jour un devis (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 */
export async function updateDevisSecure(
  devisId: number,
  artisanId: number,
  data: Partial<Omit<InsertDevis, 'artisanId' | 'clientId'>>
): Promise<Devis> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Vérifier que le devis appartient à l'artisan
    const existing = await getDevisByIdSecure(devisId, artisanId);
    if (!existing) {
      throw new Error("Devis not found or access denied");
    }

    await db.update(devis)
      .set(data)
      .where(and(
        eq(devis.id, devisId),
        eq(devis.artisanId, artisanId)
      ));

    const updated = await db.select()
      .from(devis)
      .where(and(
        eq(devis.id, devisId),
        eq(devis.artisanId, artisanId)
      ))
      .limit(1);

    if (updated.length === 0) {
      throw new Error("Devis not found");
    }

    return updated[0];
  } catch (error) {
    logError(error, { devisId, artisanId, operation: "updateDevisSecure" });
    throw error;
  }
}

// ============================================================================
// FACTURES - REFACTORED WITH MULTI-TENANT ISOLATION
// ============================================================================

/**
 * Récupérer toutes les factures d'un artisan (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 */
export async function getFacturesByArtisanIdSecure(
  artisanId: number
): Promise<Facture[]> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) return [];

    return await db.select()
      .from(factures)
      .where(eq(factures.artisanId, artisanId))
      .orderBy(desc(factures.dateFacture));
  } catch (error) {
    logError(error, { artisanId, operation: "getFacturesByArtisanIdSecure" });
    return [];
  }
}

/**
 * Récupérer une facture par ID avec vérification d'appartenance (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 */
export async function getFactureByIdSecure(
  factureId: number,
  artisanId: number
): Promise<Facture | undefined> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select()
      .from(factures)
      .where(and(
        eq(factures.id, factureId),
        eq(factures.artisanId, artisanId) // ✅ CRITICAL: Vérifier l'appartenance
      ))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    logError(error, { factureId, artisanId, operation: "getFactureByIdSecure" });
    return undefined;
  }
}

// ============================================================================
// INTERVENTIONS - REFACTORED WITH MULTI-TENANT ISOLATION
// ============================================================================

/**
 * Récupérer toutes les interventions d'un artisan (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 */
export async function getInterventionsByArtisanIdSecure(
  artisanId: number
): Promise<Intervention[]> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) return [];

    return await db.select()
      .from(interventions)
      .where(eq(interventions.artisanId, artisanId))
      .orderBy(desc(interventions.dateDebut));
  } catch (error) {
    logError(error, { artisanId, operation: "getInterventionsByArtisanIdSecure" });
    return [];
  }
}

/**
 * Récupérer une intervention par ID avec vérification d'appartenance (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 */
export async function getInterventionByIdSecure(
  interventionId: number,
  artisanId: number
): Promise<Intervention | undefined> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select()
      .from(interventions)
      .where(and(
        eq(interventions.id, interventionId),
        eq(interventions.artisanId, artisanId) // ✅ CRITICAL: Vérifier l'appartenance
      ))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    logError(error, { interventionId, artisanId, operation: "getInterventionByIdSecure" });
    return undefined;
  }
}

// ============================================================================
// STOCKS - REFACTORED WITH MULTI-TENANT ISOLATION
// ============================================================================

/**
 * Récupérer tous les stocks d'un artisan (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 */
export async function getStocksByArtisanIdSecure(
  artisanId: number
): Promise<Stock[]> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) return [];

    return await db.select()
      .from(stocks)
      .where(eq(stocks.artisanId, artisanId))
      .orderBy(asc(stocks.reference));
  } catch (error) {
    logError(error, { artisanId, operation: "getStocksByArtisanIdSecure" });
    return [];
  }
}

// ============================================================================
// FOURNISSEURS - REFACTORED WITH MULTI-TENANT ISOLATION
// ============================================================================

/**
 * Récupérer tous les fournisseurs d'un artisan (SÉCURISÉ)
 * ✅ Isolation multi-tenant vérifiée
 */
export async function getFournisseursByArtisanIdSecure(
  artisanId: number
): Promise<Fournisseur[]> {
  try {
    validateArtisanId(artisanId);

    const db = await getDb();
    if (!db) return [];

    return await db.select()
      .from(fournisseurs)
      .where(eq(fournisseurs.artisanId, artisanId))
      .orderBy(asc(fournisseurs.nom));
  } catch (error) {
    logError(error, { artisanId, operation: "getFournisseursByArtisanIdSecure" });
    return [];
  }
}

export { createSecureQuery, validateArtisanId };
