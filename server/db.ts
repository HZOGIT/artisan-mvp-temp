import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { 
  InsertUser, users, 
  artisans, InsertArtisan, Artisan,
  clients, InsertClient, Client,
  bibliothequeArticles, InsertBibliothequeArticle, BibliothequeArticle,
  articlesArtisan, InsertArticleArtisan,
  devis, InsertDevis, Devis,
  devisLignes, InsertDevisLigne, DevisLigne,
  factures, InsertFacture, Facture,
  facturesLignes, InsertFactureLigne, FactureLigne,
  interventions, InsertIntervention, Intervention,
  notifications, InsertNotification, Notification,
  parametresArtisan, InsertParametresArtisan, ParametresArtisan,
  stocks, InsertStock, Stock,
  fournisseurs, InsertFournisseur, Fournisseur
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;
let _lastConnectionError: Error | null = null;
let _connectionInProgress = false;

// Parser la DATABASE_URL pour extraire les composants
function parseDatabaseUrl(url: string) {
  try {
    const dbUrl = new URL(url);
    return {
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port) || 3306,
      user: decodeURIComponent(dbUrl.username),
      password: decodeURIComponent(dbUrl.password),
      database: dbUrl.pathname.substring(1),
      ssl: dbUrl.searchParams.get('ssl') ? JSON.parse(dbUrl.searchParams.get('ssl')!) : undefined,
    };
  } catch (error) {
    console.error('[Database] Failed to parse DATABASE_URL:', error);
    throw new Error('Invalid DATABASE_URL format');
  }
}

export async function getDb() {
  // Si la connexion est déjà établie, la retourner
  if (_db) {
    return _db;
  }

  // Si une connexion est en cours, attendre qu'elle se termine
  if (_connectionInProgress) {
    let attempts = 0;
    while (_connectionInProgress && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (_db) return _db;
  }

  _connectionInProgress = true;

  try {
    // Parser la DATABASE_URL
    if (!ENV.databaseUrl) {
      throw new Error('DATABASE_URL is not defined');
    }
    
    const dbConfig = parseDatabaseUrl(ENV.databaseUrl);
    
    // Créer le pool de connexion
    _pool = mysql.createPool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      ssl: dbConfig.ssl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelayMs: 0,
    });

    // Tester la connexion
    const connection = await _pool.getConnection();
    await connection.ping();
    connection.release();

    // Créer l'instance Drizzle
    _db = drizzle(_pool);

    console.log('[Database] Connected successfully');
    _lastConnectionError = null;
    return _db;
  } catch (error) {
    _lastConnectionError = error as Error;
    console.error('[Database] Connection failed:', error);
    _db = null;
    throw error;
  } finally {
    _connectionInProgress = false;
  }
}

export { User, InsertUser } from "../drizzle/schema";
export { Artisan, InsertArtisan } from "../drizzle/schema";
export { Client, InsertClient } from "../drizzle/schema";
export { BibliothequeArticle, InsertBibliothequeArticle } from "../drizzle/schema";
export { Devis, InsertDevis } from "../drizzle/schema";
export { DevisLigne, InsertDevisLigne } from "../drizzle/schema";
export { Facture, InsertFacture } from "../drizzle/schema";
export { FactureLigne, InsertFactureLigne } from "../drizzle/schema";
export { Intervention, InsertIntervention } from "../drizzle/schema";
// Notifications et Parametres supprimés du MVP
// Stocks et Fournisseurs supprimés du MVP

// ============================================================================
// FACTURES - Query Helpers
// ============================================================================

export async function getFactureById(id: number): Promise<Facture | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select()
      .from(factures)
      .where(eq(factures.id, id))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error('[Database] getFactureById failed:', error);
    return undefined;
  }
}

export async function updateFacture(
  id: number,
  data: Partial<InsertFacture>
): Promise<Facture> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { eq } = await import("drizzle-orm");
    await db.update(factures)
      .set(data)
      .where(eq(factures.id, id));

    const result = await db.select()
      .from(factures)
      .where(eq(factures.id, id))
      .limit(1);

    if (result.length === 0) {
      throw new Error("Facture not found after update");
    }

    return result[0];
  } catch (error) {
    console.error('[Database] updateFacture failed:', error);
    throw error;
  }
}

// ============================================================================
// NOTIFICATIONS - Query Helpers
// ============================================================================

export async function createNotification(
  data: InsertNotification
): Promise<Notification> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const result = await db.insert(notifications).values(data);

    // Récupérer la notification créée
    const created = await db.select()
      .from(notifications)
      .where(eq(notifications.artisanId, data.artisanId))
      .orderBy(desc(notifications.createdAt))
      .limit(1);

    if (created.length === 0) {
      throw new Error("Failed to retrieve created notification");
    }

    return created[0];
  } catch (error) {
    console.error('[Database] createNotification failed:', error);
    throw error;
  }
}


// ============================================================================
// IMPORTS NÉCESSAIRES
// ============================================================================

import { eq, desc } from "drizzle-orm";

// ============================================================================
// ARTISANS - Query Helpers
// ============================================================================

export async function getArtisanByUserId(userId: number): Promise<Artisan | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select()
      .from(artisans)
      .where(eq(artisans.userId, userId))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error('[Database] getArtisanByUserId failed:', error);
    return undefined;
  }
}

export async function createArtisan(
  data: InsertArtisan
): Promise<Artisan> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const result = await db.insert(artisans).values(data);

    // Récupérer l'artisan créé
    const created = await db.select()
      .from(artisans)
      .where(eq(artisans.userId, data.userId))
      .limit(1);

    if (created.length === 0) {
      throw new Error("Failed to retrieve created artisan");
    }

    return created[0];
  } catch (error) {
    console.error('[Database] createArtisan failed:', error);
    throw error;
  }
}

export async function updateArtisan(
  id: number,
  data: Partial<InsertArtisan>
): Promise<Artisan> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.update(artisans)
      .set(data)
      .where(eq(artisans.id, id));

    const result = await db.select()
      .from(artisans)
      .where(eq(artisans.id, id))
      .limit(1);

    if (result.length === 0) {
      throw new Error("Artisan not found after update");
    }

    return result[0];
  } catch (error) {
    console.error('[Database] updateArtisan failed:', error);
    throw error;
  }
}

// ============================================================================
// CLIENTS - Query Helpers
// ============================================================================

export async function getClientById(id: number): Promise<Client | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select()
      .from(clients)
      .where(eq(clients.id, id))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error('[Database] getClientById failed:', error);
    return undefined;
  }
}

// ============================================================================
// DEVIS - Query Helpers
// ============================================================================

export async function getDevisById(id: number): Promise<Devis | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select()
      .from(devis)
      .where(eq(devis.id, id))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error('[Database] getDevisById failed:', error);
    return undefined;
  }
}

export async function updateDevis(
  id: number,
  data: Partial<InsertDevis>
): Promise<Devis> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.update(devis)
      .set(data)
      .where(eq(devis.id, id));

    const result = await db.select()
      .from(devis)
      .where(eq(devis.id, id))
      .limit(1);

    if (result.length === 0) {
      throw new Error("Devis not found after update");
    }

    return result[0];
  } catch (error) {
    console.error('[Database] updateDevis failed:', error);
    throw error;
  }
}

// ============================================================================
// INTERVENTIONS - Query Helpers
// ============================================================================

export async function getInterventionById(id: number): Promise<Intervention | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select()
      .from(interventions)
      .where(eq(interventions.id, id))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error('[Database] getInterventionById failed:', error);
    return undefined;
  }
}

export async function updateIntervention(
  id: number,
  data: Partial<InsertIntervention>
): Promise<Intervention> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.update(interventions)
      .set(data)
      .where(eq(interventions.id, id));

    const result = await db.select()
      .from(interventions)
      .where(eq(interventions.id, id))
      .limit(1);

    if (result.length === 0) {
      throw new Error("Intervention not found after update");
    }

    return result[0];
  } catch (error) {
    console.error('[Database] updateIntervention failed:', error);
    throw error;
  }
}

// ============================================================================
// STOCKS - Query Helpers
// ============================================================================

export async function getStockById(id: number): Promise<Stock | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select()
      .from(stocks)
      .where(eq(stocks.id, id))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error('[Database] getStockById failed:', error);
    return undefined;
  }
}

export async function updateStock(
  id: number,
  data: Partial<InsertStock>
): Promise<Stock> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.update(stocks)
      .set(data)
      .where(eq(stocks.id, id));

    const result = await db.select()
      .from(stocks)
      .where(eq(stocks.id, id))
      .limit(1);

    if (result.length === 0) {
      throw new Error("Stock not found after update");
    }

    return result[0];
  } catch (error) {
    console.error('[Database] updateStock failed:', error);
    throw error;
  }
}

// ============================================================================
// FOURNISSEURS - Query Helpers
// ============================================================================

export async function getFournisseurById(id: number): Promise<Fournisseur | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select()
      .from(fournisseurs)
      .where(eq(fournisseurs.id, id))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error('[Database] getFournisseurById failed:', error);
    return undefined;
  }
}

export async function updateFournisseur(
  id: number,
  data: Partial<InsertFournisseur>
): Promise<Fournisseur> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.update(fournisseurs)
      .set(data)
      .where(eq(fournisseurs.id, id));

    const result = await db.select()
      .from(fournisseurs)
      .where(eq(fournisseurs.id, id))
      .limit(1);

    if (result.length === 0) {
      throw new Error("Fournisseur not found after update");
    }

    return result[0];
  } catch (error) {
    console.error('[Database] updateFournisseur failed:', error);
    throw error;
  }
}

// ============================================================================
// ARTICLES - Query Helpers
// ============================================================================

export async function getArticleById(id: number): Promise<BibliothequeArticle | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select()
      .from(bibliothequeArticles)
      .where(eq(bibliothequeArticles.id, id))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error('[Database] getArticleById failed:', error);
    return undefined;
  }
}


// ============================================================================
// DEVIS - Lignes et Calculs
// ============================================================================

export async function getLignesDevisByDevisId(devisId: number) {
  try {
    const db = await getDb();
    if (!db) return [];

    return await db.select()
      .from(devisLignes)
      .where(eq(devisLignes.devisId, devisId));
  } catch (error) {
    console.error('[Database] getLignesDevisByDevisId failed:', error);
    return [];
  }
}

export async function createLigneDevis(data: any) {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const result = await db.insert(devisLignes).values(data);
    const created = await db.select()
      .from(devisLignes)
      .where(eq(devisLignes.devisId, data.devisId))
      .limit(1);

    return created.length > 0 ? created[0] : null;
  } catch (error) {
    console.error('[Database] createLigneDevis failed:', error);
    throw error;
  }
}

export async function updateLigneDevis(id: number, data: any) {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.update(devisLignes)
      .set(data)
      .where(eq(devisLignes.id, id));

    const result = await db.select()
      .from(devisLignes)
      .where(eq(devisLignes.id, id))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('[Database] updateLigneDevis failed:', error);
    throw error;
  }
}

export async function deleteLigneDevis(id: number) {
  try {
    const db = await getDb();
    if (!db) return;

    await db.delete(devisLignes)
      .where(eq(devisLignes.id, id));
  } catch (error) {
    console.error('[Database] deleteLigneDevis failed:', error);
  }
}

export async function recalculateDevisTotals(devisId: number) {
  try {
    const db = await getDb();
    if (!db) return;

    const lignes = await db.select()
      .from(devisLignes)
      .where(eq(devisLignes.devisId, devisId));

    let totalHT = 0;
    let totalTVA = 0;
    let totalTTC = 0;

    for (const ligne of lignes) {
      totalHT += parseFloat(String(ligne.montantHT || 0));
      totalTVA += parseFloat(String(ligne.montantTVA || 0));
      totalTTC += parseFloat(String(ligne.montantTTC || 0));
    }

    await db.update(devis)
      .set({
        totalHT: totalHT.toFixed(2),
        totalTVA: totalTVA.toFixed(2),
        totalTTC: totalTTC.toFixed(2),
      })
      .where(eq(devis.id, devisId));
  } catch (error) {
    console.error('[Database] recalculateDevisTotals failed:', error);
  }
}

export async function deleteDevis(id: number) {
  try {
    const db = await getDb();
    if (!db) return;

    // Supprimer les lignes d'abord
    await db.delete(devisLignes)
      .where(eq(devisLignes.devisId, id));

    // Puis le devis
    await db.delete(devis)
      .where(eq(devis.id, id));
  } catch (error) {
    console.error('[Database] deleteDevis failed:', error);
  }
}

export async function getNextDevisNumber(artisanId: number): Promise<string> {
  try {
    const db = await getDb();
    if (!db) return "DEV-001";

    const result = await db.select()
      .from(devis)
      .where(eq(devis.artisanId, artisanId))
      .orderBy(devis.id);

    const lastNumber = result.length > 0 
      ? parseInt(result[result.length - 1].numero.split('-')[1] || '0')
      : 0;

    return `DEV-${String(lastNumber + 1).padStart(3, '0')}`;
  } catch (error) {
    console.error('[Database] getNextDevisNumber failed:', error);
    return "DEV-001";
  }
}

export async function createFactureFromDevis(devisId: number) {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const devisRecord = await db.select()
      .from(devis)
      .where(eq(devis.id, devisId))
      .limit(1);

    if (devisRecord.length === 0) {
      throw new Error("Devis not found");
    }

    const devisData = devisRecord[0];
    const numero = await getNextFactureNumber(devisData.artisanId);

    // Créer la facture
    await db.insert(factures).values({
      artisanId: devisData.artisanId,
      clientId: devisData.clientId,
      numero,
      objet: devisData.objet,
      conditionsPaiement: devisData.conditionsPaiement,
      notes: devisData.notes,
      dateFacture: new Date(),
      dateEcheance: devisData.dateValidite,
      statut: "brouillon",
      totalHT: devisData.totalHT,
      totalTVA: devisData.totalTVA,
      totalTTC: devisData.totalTTC,
    });

    // Récupérer la facture créée
    const created = await db.select()
      .from(factures)
      .where(eq(factures.numero, numero))
      .limit(1);

    if (created.length === 0) {
      throw new Error("Failed to create facture");
    }

    const factureId = created[0].id;

    // Copier les lignes
    const devisLignesData = await db.select()
      .from(devisLignes)
      .where(eq(devisLignes.devisId, devisId));

    for (const ligne of devisLignesData) {
      await db.insert(facturesLignes).values({
        factureId,
        reference: ligne.reference,
        designation: ligne.designation,
        description: ligne.description,
        quantite: ligne.quantite,
        unite: ligne.unite,
        prixUnitaireHT: ligne.prixUnitaireHT,
        tauxTVA: ligne.tauxTVA,
        montantHT: ligne.montantHT,
        montantTVA: ligne.montantTVA,
        montantTTC: ligne.montantTTC,
      });
    }

    return created[0];
  } catch (error) {
    console.error('[Database] createFactureFromDevis failed:', error);
    throw error;
  }
}

// ============================================================================
// FACTURES - Lignes et Calculs
// ============================================================================

export async function getLignesFacturesByFactureId(factureId: number) {
  try {
    const db = await getDb();
    if (!db) return [];

    return await db.select()
      .from(facturesLignes)
      .where(eq(facturesLignes.factureId, factureId));
  } catch (error) {
    console.error('[Database] getLignesFacturesByFactureId failed:', error);
    return [];
  }
}

export async function createLigneFacture(data: any) {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const result = await db.insert(facturesLignes).values(data);
    const created = await db.select()
      .from(facturesLignes)
      .where(eq(facturesLignes.factureId, data.factureId))
      .limit(1);

    return created.length > 0 ? created[0] : null;
  } catch (error) {
    console.error('[Database] createLigneFacture failed:', error);
    throw error;
  }
}

export async function deleteLigneFacture(id: number) {
  try {
    const db = await getDb();
    if (!db) return;

    await db.delete(facturesLignes)
      .where(eq(facturesLignes.id, id));
  } catch (error) {
    console.error('[Database] deleteLigneFacture failed:', error);
  }
}

export async function recalculateFactureTotals(factureId: number) {
  try {
    const db = await getDb();
    if (!db) return;

    const lignes = await db.select()
      .from(facturesLignes)
      .where(eq(facturesLignes.factureId, factureId));

    let totalHT = 0;
    let totalTVA = 0;
    let totalTTC = 0;

    for (const ligne of lignes) {
      totalHT += parseFloat(String(ligne.montantHT || 0));
      totalTVA += parseFloat(String(ligne.montantTVA || 0));
      totalTTC += parseFloat(String(ligne.montantTTC || 0));
    }

    await db.update(factures)
      .set({
        totalHT: totalHT.toFixed(2),
        totalTVA: totalTVA.toFixed(2),
        totalTTC: totalTTC.toFixed(2),
      })
      .where(eq(factures.id, factureId));
  } catch (error) {
    console.error('[Database] recalculateFactureTotals failed:', error);
  }
}

export async function deleteFacture(id: number) {
  try {
    const db = await getDb();
    if (!db) return;

    // Supprimer les lignes d'abord
    await db.delete(facturesLignes)
      .where(eq(facturesLignes.factureId, id));

    // Puis la facture
    await db.delete(factures)
      .where(eq(factures.id, id));
  } catch (error) {
    console.error('[Database] deleteFacture failed:', error);
  }
}

export async function getNextFactureNumber(artisanId: number): Promise<string> {
  try {
    const db = await getDb();
    if (!db) return "FAC-001";

    const result = await db.select()
      .from(factures)
      .where(eq(factures.artisanId, artisanId))
      .orderBy(factures.id);

    const lastNumber = result.length > 0 
      ? parseInt(result[result.length - 1].numero.split('-')[1] || '0')
      : 0;

    return `FAC-${String(lastNumber + 1).padStart(3, '0')}`;
  } catch (error) {
    console.error('[Database] getNextFactureNumber failed:', error);
    return "FAC-001";
  }
}

// ============================================================================
// INTERVENTIONS - Calendrier
// ============================================================================

export async function deleteIntervention(id: number) {
  try {
    const db = await getDb();
    if (!db) return;

    await db.delete(interventions)
      .where(eq(interventions.id, id));
  } catch (error) {
    console.error('[Database] deleteIntervention failed:', error);
  }
}

export async function getUpcomingInterventions(artisanId: number, limit: number = 5) {
  try {
    const db = await getDb();
    if (!db) return [];

    const now = new Date();
    return await db.select()
      .from(interventions)
      .where(eq(interventions.artisanId, artisanId))
      .orderBy(interventions.dateDebut)
      .limit(limit);
  } catch (error) {
    console.error('[Database] getUpcomingInterventions failed:', error);
    return [];
  }
}

// ============================================================================
// ARTICLES - Bibliothèque
// ============================================================================

export async function getBibliothequeArticles(metier?: string, categorie?: string) {
  try {
    const db = await getDb();
    if (!db) return [];

    let query: any = db.select().from(bibliothequeArticles);

    if (metier) {
      query = query.where(eq(bibliothequeArticles.metier, metier));
    }

    if (categorie) {
      query = query.where(eq(bibliothequeArticles.categorie, categorie));
    }

    return await query;
  } catch (error) {
    console.error('[Database] getBibliothequeArticles failed:', error);
    return [];
  }
}

export async function searchArticles(query: string, metier?: string) {
  try {
    const db = await getDb();
    if (!db) return [];

    // Recherche simple par designation
    let dbQuery: any = db.select().from(bibliothequeArticles);

    if (metier) {
      dbQuery = dbQuery.where(eq(bibliothequeArticles.metier, metier));
    }

    const results = await dbQuery;
    return results.filter(a => 
      a.designation.toLowerCase().includes(query.toLowerCase()) ||
      (a.reference && a.reference.toLowerCase().includes(query.toLowerCase()))
    );
  } catch (error) {
    console.error('[Database] searchArticles failed:', error);
    return [];
  }
}


// ============================================================================
// MISSING FUNCTIONS - Ajoutées pour MVP
// ============================================================================

export async function createFacture(data: any) {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const result = await db.insert(factures).values(data);
    const created = await db.select()
      .from(factures)
      .where(eq(factures.artisanId, data.artisanId))
      .orderBy(factures.id)
      .limit(1);

    return created.length > 0 ? created[0] : null;
  } catch (error) {
    console.error('[Database] createFacture failed:', error);
    throw error;
  }
}

export async function createIntervention(data: any) {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const result = await db.insert(interventions).values(data);
    const created = await db.select()
      .from(interventions)
      .where(eq(interventions.artisanId, data.artisanId))
      .orderBy(interventions.id)
      .limit(1);

    return created.length > 0 ? created[0] : null;
  } catch (error) {
    console.error('[Database] createIntervention failed:', error);
    throw error;
  }
}
