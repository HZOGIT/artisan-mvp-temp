import { eq, and, desc, like, or, sql, gte, lte, asc, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { 
  InsertUser, users, 
  artisans, InsertArtisan, Artisan,
  clients, InsertClient, Client,
  bibliothequeArticles, InsertBibliothequeArticle, BibliothequeArticle,
  articlesArtisan, InsertArticleArtisan, ArticleArtisan,
  devis, InsertDevis, Devis,
  devisLignes, InsertDevisLigne, DevisLigne,
  factures, InsertFacture, Facture,
  facturesLignes, InsertFactureLigne, FactureLigne,
  interventions, InsertIntervention, Intervention,
  notifications, InsertNotification, Notification,
  parametresArtisan, InsertParametresArtisan, ParametresArtisan,
  signaturesDevis, InsertSignatureDevis, SignatureDevis,
  stocks, InsertStock, Stock,
  mouvementsStock, InsertMouvementStock, MouvementStock,
  fournisseurs, InsertFournisseur, Fournisseur,
  articlesFournisseurs, InsertArticleFournisseur, ArticleFournisseur,
  smsVerifications, InsertSmsVerification, SmsVerification,
  relancesDevis, InsertRelanceDevis, RelanceDevis,
  modelesEmail, InsertModeleEmail, ModeleEmail,
  commandesFournisseurs, InsertCommandeFournisseur, CommandeFournisseur,
  lignesCommandesFournisseurs, InsertLigneCommandeFournisseur, LigneCommandeFournisseur,
  paiementsStripe, InsertPaiementStripe, PaiementStripe,
  clientPortalAccess, InsertClientPortalAccess, ClientPortalAccess,
  clientPortalSessions, InsertClientPortalSession, ClientPortalSession,
  contratsMaintenance, InsertContratMaintenance, ContratMaintenance,
  facturesRecurrentes, InsertFactureRecurrente, FactureRecurrente,
  interventionsMobile, InsertInterventionMobile, InterventionMobile,
  photosInterventions, InsertPhotoIntervention, PhotoIntervention,
  conversations, InsertConversation, Conversation,
  messages, InsertMessage, Message,
  techniciens, InsertTechnicien, Technicien,
  disponibilitesTechniciens, InsertDisponibiliteTechnicien, DisponibiliteTechnicien,
  avisClients, InsertAvisClient, AvisClient,
  demandesAvis, InsertDemandeAvis, DemandeAvis,
  positionsTechniciens, InsertPositionTechnicien, PositionTechnicien,
  historiqueDeplacements, InsertHistoriqueDeplacement, HistoriqueDeplacement,
  ecrituresComptables, InsertEcritureComptable, EcritureComptable,
  planComptable, InsertCompteComptable, CompteComptable,
  devisOptions, InsertDevisOption, DevisOption,
  devisOptionsLignes, InsertDevisOptionLigne, DevisOptionLigne,
  modelesDevis, InsertModeleDevis, ModeleDevis,
  modelesDevisLignes, InsertModeleDevisLigne, ModeleDevisLigne,
  rapportsPersonnalises, InsertRapportPersonnalise, RapportPersonnalise,
  executionsRapports, InsertExecutionRapport, ExecutionRapport,
  pushSubscriptions, InsertPushSubscription, PushSubscription,
  preferencesNotifications, InsertPreferenceNotification, PreferenceNotification,
  historiqueNotificationsPush, InsertHistoriqueNotificationPush, HistoriqueNotificationPush,
  conges, InsertConge, Conge,
  soldesConges, InsertSoldeConge, SoldeConge,
  previsionsCA, InsertPrevisionCA, PrevisionCA,
  historiqueCA, InsertHistoriqueCA, HistoriqueCA,
  vehicules, InsertVehicule, Vehicule,
  historiqueKilometrage, InsertHistoriqueKilometrage, HistoriqueKilometrage,
  entretiensVehicules, InsertEntretienVehicule, EntretienVehicule,
  assurancesVehicules, InsertAssuranceVehicule, AssuranceVehicule,
  badges, InsertBadge, Badge,
  badgesTechniciens, InsertBadgeTechnicien, BadgeTechnicien,
  objectifsTechniciens, InsertObjectifTechnicien, ObjectifTechnicien,
  classementTechniciens, InsertClassementTechnicien, ClassementTechnicien,
  configAlertesPrevisions, InsertConfigAlertePrevision, ConfigAlertePrevision,
  historiqueAlertesPrevisions, InsertHistoriqueAlertePrevision, HistoriqueAlertePrevision,
  chantiers, InsertChantier, Chantier,
  phasesChantier, InsertPhaseChantier, PhaseChantier,
  interventionsChantier, InsertInterventionChantier, InterventionChantier,
  documentsChantier, InsertDocumentChantier, DocumentChantier,
  configurationsComptables, InsertConfigurationComptable, ConfigurationComptable,
  exportsComptables, InsertExportComptable, ExportComptable,
  analysesPhotosChantier, InsertAnalysePhotoChantier, AnalysePhotoChantier,
  photosAnalyse, InsertPhotoAnalyse, PhotoAnalyse,
  resultatsAnalyseIA, InsertResultatAnalyseIA, ResultatAnalyseIA,
  suggestionsArticlesIA, InsertSuggestionArticleIA, SuggestionArticleIA,
  devisGenereIA, InsertDevisGenereIA, DevisGenereIA,
  preferencesCouleursCalendrier, InsertPreferenceCouleurCalendrier, PreferenceCouleurCalendrier
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;
let _lastConnectionError: Error | null = null;
let _connectionInProgress = false;

export async function getDb() {
  // Si la connexion est déjà établie, la retourner
  if (_db) {
    return _db;
  }
  
  // Si DATABASE_URL n'est pas définie, impossible de se connecter
  if (!process.env.DATABASE_URL) {
    console.error('[Database] DATABASE_URL not set');
    return null;
  }
  
  // Éviter les tentatives de connexion simultanées
  if (_connectionInProgress) {
    console.log('[Database] Connection already in progress, waiting...');
    // Attendre un peu et réessayer
    await new Promise(resolve => setTimeout(resolve, 500));
    return getDb();
  }
  
  _connectionInProgress = true;
  
  try {
    console.log('[Database] Attempting to connect to MySQL...');
    console.log('[Database] DATABASE_URL length:', process.env.DATABASE_URL?.length);
    
    _pool = mysql.createPool(process.env.DATABASE_URL);
    console.log('[Database] MySQL pool created');
    
    _db = drizzle(_pool) as any;
    console.log('[Database] Drizzle ORM initialized');
    
    const connection = await _pool.getConnection();
    console.log('[Database] Got connection from pool');
    
    const result = await connection.execute('SELECT 1 as test');
    console.log('[Database] Connection test successful');
    
    connection.release();
    
    _lastConnectionError = null;
    console.log('[Database] SUCCESS: MySQL connected!');
    return _db;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('[Database] FAILED: Connection error:', errorMsg);
    console.error('[Database] Stack:', errorStack);
    _lastConnectionError = error instanceof Error ? error : new Error(errorMsg);
    _db = null;
    _pool = null;
    return null;
  } finally {
    _connectionInProgress = false;
  }
}

// ============================================================================
// USER QUERIES
// ============================================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// ARTISAN QUERIES
// ============================================================================

export async function getArtisanByUserId(userId: number): Promise<Artisan | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(artisans).where(eq(artisans.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createArtisan(data: InsertArtisan): Promise<Artisan> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(artisans).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(artisans).where(eq(artisans.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created artisan");
  return created[0];
}

export async function updateArtisan(id: number, data: Partial<InsertArtisan>): Promise<Artisan> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(artisans).set(data).where(eq(artisans.id, id));
  const updated = await db.select().from(artisans).where(eq(artisans.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Artisan not found");
  return updated[0];
}

// ============================================================================
// CLIENT QUERIES
// ============================================================================

export async function getClientsByArtisanId(artisanId: number): Promise<Client[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(clients).where(eq(clients.artisanId, artisanId)).orderBy(desc(clients.createdAt));
}

export async function getClientById(id: number): Promise<Client | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createClient(data: InsertClient): Promise<Client> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clients).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(clients).where(eq(clients.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created client");
  return created[0];
}

export async function updateClient(id: number, data: Partial<InsertClient>): Promise<Client> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clients).set(data).where(eq(clients.id, id));
  const updated = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Client not found");
  return updated[0];
}

export async function deleteClient(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clients).where(eq(clients.id, id));
}

export async function searchClients(artisanId: number, query: string): Promise<Client[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Échapper les caractères spéciaux SQL LIKE
  const escapedQuery = query
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  
  return await db.select().from(clients).where(
    and(
      eq(clients.artisanId, artisanId),
      or(
        like(clients.nom, `%${escapedQuery}%`),
        like(clients.prenom, `%${escapedQuery}%`),
        like(clients.email, `%${escapedQuery}%`),
        like(clients.telephone, `%${escapedQuery}%`)
      )
    )
  ).orderBy(desc(clients.createdAt));
}

// ============================================================================
// BIBLIOTHEQUE ARTICLES QUERIES
// ============================================================================

export async function getBibliothequeArticles(metier?: string, categorie?: string): Promise<BibliothequeArticle[]> {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(bibliothequeArticles);
  
  if (metier && categorie) {
    return await db.select().from(bibliothequeArticles).where(
      and(eq(bibliothequeArticles.metier, metier as any), eq(bibliothequeArticles.categorie, categorie))
    ).orderBy(bibliothequeArticles.designation);
  } else if (metier) {
    return await db.select().from(bibliothequeArticles).where(
      eq(bibliothequeArticles.metier, metier as any)
    ).orderBy(bibliothequeArticles.designation);
  } else if (categorie) {
    return await db.select().from(bibliothequeArticles).where(
      eq(bibliothequeArticles.categorie, categorie)
    ).orderBy(bibliothequeArticles.designation);
  }
  
  return await db.select().from(bibliothequeArticles).orderBy(bibliothequeArticles.designation);
}

export async function searchArticles(query: string, metier?: string): Promise<BibliothequeArticle[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Échapper les caractères spéciaux SQL LIKE
  const escapedQuery = query
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  
  if (metier) {
    return await db.select().from(bibliothequeArticles).where(
      and(
        eq(bibliothequeArticles.metier, metier as any),
        or(
          like(bibliothequeArticles.designation, `%${escapedQuery}%`),
          like(bibliothequeArticles.reference, `%${escapedQuery}%`)
        )
      )
    ).orderBy(bibliothequeArticles.designation).limit(50);
  }
  
  return await db.select().from(bibliothequeArticles).where(
    or(
      like(bibliothequeArticles.designation, `%${escapedQuery}%`),
      like(bibliothequeArticles.reference, `%${escapedQuery}%`)
    )
  ).orderBy(bibliothequeArticles.designation).limit(50);
}

export async function createBibliothequeArticle(data: InsertBibliothequeArticle): Promise<BibliothequeArticle> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(bibliothequeArticles).values(data);
  const id = Number(result[0].insertId);
  const [article] = await db.select().from(bibliothequeArticles).where(eq(bibliothequeArticles.id, id));
  return article;
}

export async function updateBibliothequeArticle(id: number, data: Partial<InsertBibliothequeArticle>): Promise<BibliothequeArticle | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(bibliothequeArticles).set(data).where(eq(bibliothequeArticles.id, id));
  const [article] = await db.select().from(bibliothequeArticles).where(eq(bibliothequeArticles.id, id));
  return article || null;
}

export async function deleteBibliothequeArticle(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(bibliothequeArticles).where(eq(bibliothequeArticles.id, id));
}

// ============================================================================
// ARTICLES ARTISAN QUERIES
// ============================================================================

export async function getArticlesArtisan(artisanId: number): Promise<ArticleArtisan[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(articlesArtisan).where(eq(articlesArtisan.artisanId, artisanId)).orderBy(articlesArtisan.designation);
}

export async function createArticleArtisan(data: InsertArticleArtisan): Promise<ArticleArtisan> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(articlesArtisan).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(articlesArtisan).where(eq(articlesArtisan.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created article");
  return created[0];
}

export async function updateArticleArtisan(id: number, data: Partial<InsertArticleArtisan>): Promise<ArticleArtisan> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(articlesArtisan).set(data).where(eq(articlesArtisan.id, id));
  const updated = await db.select().from(articlesArtisan).where(eq(articlesArtisan.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Article not found");
  return updated[0];
}

export async function deleteArticleArtisan(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(articlesArtisan).where(eq(articlesArtisan.id, id));
}

// ============================================================================
// DEVIS QUERIES
// ============================================================================

export async function getDevisByArtisanId(artisanId: number): Promise<Devis[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(devis).where(eq(devis.artisanId, artisanId)).orderBy(desc(devis.createdAt));
}

export async function getDevisById(id: number): Promise<Devis | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(devis).where(eq(devis.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createDevis(data: InsertDevis): Promise<Devis> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(devis).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(devis).where(eq(devis.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created devis");
  return created[0];
}

export async function updateDevis(id: number, data: Partial<InsertDevis>): Promise<Devis> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(devis).set(data).where(eq(devis.id, id));
  const updated = await db.select().from(devis).where(eq(devis.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Devis not found");
  return updated[0];
}

export async function deleteDevis(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(devisLignes).where(eq(devisLignes.devisId, id));
  await db.delete(devis).where(eq(devis.id, id));
}

export async function getNextDevisNumber(artisanId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const params = await db.select().from(parametresArtisan).where(eq(parametresArtisan.artisanId, artisanId)).limit(1);
  let prefixe = "DEV";
  let compteur = 1;
  
  if (params.length > 0) {
    prefixe = params[0].prefixeDevis || "DEV";
    compteur = params[0].compteurDevis || 1;
    await db.update(parametresArtisan).set({ compteurDevis: compteur + 1 }).where(eq(parametresArtisan.artisanId, artisanId));
  } else {
    await db.insert(parametresArtisan).values({ artisanId, compteurDevis: 2 });
  }
  
  const year = new Date().getFullYear();
  return `${prefixe}-${year}-${String(compteur).padStart(4, '0')}`;
}

// ============================================================================
// DEVIS LIGNES QUERIES
// ============================================================================

export async function getLignesDevisByDevisId(devisId: number): Promise<DevisLigne[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(devisLignes).where(eq(devisLignes.devisId, devisId)).orderBy(devisLignes.ordre);
}

export async function createLigneDevis(data: InsertDevisLigne): Promise<DevisLigne> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(devisLignes).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(devisLignes).where(eq(devisLignes.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created ligne devis");
  return created[0];
}

export async function updateLigneDevis(id: number, data: Partial<InsertDevisLigne>): Promise<DevisLigne> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(devisLignes).set(data).where(eq(devisLignes.id, id));
  const updated = await db.select().from(devisLignes).where(eq(devisLignes.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Ligne devis not found");
  return updated[0];
}

export async function deleteLigneDevis(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(devisLignes).where(eq(devisLignes.id, id));
}

export async function recalculateDevisTotals(devisId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const lignes = await getLignesDevisByDevisId(devisId);
  let totalHT = 0;
  let totalTVA = 0;
  
  for (const ligne of lignes) {
    totalHT += Number(ligne.montantHT) || 0;
    totalTVA += Number(ligne.montantTVA) || 0;
  }
  
  const totalTTC = totalHT + totalTVA;
  
  await db.update(devis).set({
    totalHT: totalHT.toFixed(2),
    totalTVA: totalTVA.toFixed(2),
    totalTTC: totalTTC.toFixed(2)
  }).where(eq(devis.id, devisId));
}

// ============================================================================
// FACTURES QUERIES
// ============================================================================

export async function getFacturesByArtisanId(artisanId: number): Promise<Facture[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(factures).where(eq(factures.artisanId, artisanId)).orderBy(desc(factures.createdAt));
}

export async function getFactureById(id: number): Promise<Facture | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(factures).where(eq(factures.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createFacture(data: InsertFacture): Promise<Facture> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(factures).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(factures).where(eq(factures.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created facture");
  return created[0];
}

export async function updateFacture(id: number, data: Partial<InsertFacture>): Promise<Facture> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(factures).set(data).where(eq(factures.id, id));
  const updated = await db.select().from(factures).where(eq(factures.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Facture not found");
  return updated[0];
}

export async function deleteFacture(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(facturesLignes).where(eq(facturesLignes.factureId, id));
  await db.delete(factures).where(eq(factures.id, id));
}

export async function getNextFactureNumber(artisanId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const params = await db.select().from(parametresArtisan).where(eq(parametresArtisan.artisanId, artisanId)).limit(1);
  let prefixe = "FAC";
  let compteur = 1;
  
  if (params.length > 0) {
    prefixe = params[0].prefixeFacture || "FAC";
    compteur = params[0].compteurFacture || 1;
    await db.update(parametresArtisan).set({ compteurFacture: compteur + 1 }).where(eq(parametresArtisan.artisanId, artisanId));
  } else {
    await db.insert(parametresArtisan).values({ artisanId, compteurFacture: 2 });
  }
  
  const year = new Date().getFullYear();
  return `${prefixe}-${year}-${String(compteur).padStart(4, '0')}`;
}

export async function createFactureFromDevis(devisId: number): Promise<Facture> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const devisData = await getDevisById(devisId);
  if (!devisData) throw new Error("Devis not found");
  
  const numero = await getNextFactureNumber(devisData.artisanId);
  
  const factureData: InsertFacture = {
    artisanId: devisData.artisanId,
    clientId: devisData.clientId,
    devisId: devisId,
    numero,
    objet: devisData.objet,
    conditionsPaiement: devisData.conditionsPaiement,
    notes: devisData.notes,
    totalHT: devisData.totalHT,
    totalTVA: devisData.totalTVA,
    totalTTC: devisData.totalTTC,
    statut: "brouillon"
  };
  
  const facture = await createFacture(factureData);
  
  const lignesDevis = await getLignesDevisByDevisId(devisId);
  for (const ligne of lignesDevis) {
    await db.insert(facturesLignes).values({
      factureId: facture.id,
      ordre: ligne.ordre,
      reference: ligne.reference,
      designation: ligne.designation,
      description: ligne.description,
      quantite: ligne.quantite,
      unite: ligne.unite,
      prixUnitaireHT: ligne.prixUnitaireHT,
      tauxTVA: ligne.tauxTVA,
      montantHT: ligne.montantHT,
      montantTVA: ligne.montantTVA,
      montantTTC: ligne.montantTTC
    });
  }
  
  await updateDevis(devisId, { statut: "accepte" });
  
  return facture;
}

// ============================================================================
// FACTURES LIGNES QUERIES
// ============================================================================

export async function getLignesFacturesByFactureId(factureId: number): Promise<FactureLigne[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(facturesLignes).where(eq(facturesLignes.factureId, factureId)).orderBy(facturesLignes.ordre);
}

export async function createLigneFacture(data: InsertFactureLigne): Promise<FactureLigne> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(facturesLignes).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(facturesLignes).where(eq(facturesLignes.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created ligne facture");
  return created[0];
}

export async function recalculateFactureTotals(factureId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const lignes = await getLignesFacturesByFactureId(factureId);
  let totalHT = 0;
  let totalTVA = 0;
  
  for (const ligne of lignes) {
    totalHT += Number(ligne.montantHT) || 0;
    totalTVA += Number(ligne.montantTVA) || 0;
  }
  
  const totalTTC = totalHT + totalTVA;
  
  await db.update(factures).set({
    totalHT: totalHT.toFixed(2),
    totalTVA: totalTVA.toFixed(2),
    totalTTC: totalTTC.toFixed(2)
  }).where(eq(factures.id, factureId));
}

// ============================================================================
// INTERVENTIONS QUERIES
// ============================================================================

export async function getInterventionsByArtisanId(artisanId: number): Promise<Intervention[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(interventions).where(eq(interventions.artisanId, artisanId)).orderBy(desc(interventions.dateDebut));
}

export async function getInterventionById(id: number): Promise<Intervention | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(interventions).where(eq(interventions.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createIntervention(data: InsertIntervention): Promise<Intervention> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(interventions).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(interventions).where(eq(interventions.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created intervention");
  return created[0];
}

export async function updateIntervention(id: number, data: Partial<InsertIntervention>): Promise<Intervention> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(interventions).set(data).where(eq(interventions.id, id));
  const updated = await db.select().from(interventions).where(eq(interventions.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Intervention not found");
  return updated[0];
}

export async function deleteIntervention(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(interventions).where(eq(interventions.id, id));
}

export async function getUpcomingInterventions(artisanId: number, limit: number = 5): Promise<Intervention[]> {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return await db.select().from(interventions).where(
    and(
      eq(interventions.artisanId, artisanId),
      gte(interventions.dateDebut, now),
      eq(interventions.statut, "planifiee")
    )
  ).orderBy(interventions.dateDebut).limit(limit);
}

// ============================================================================
// NOTIFICATIONS QUERIES
// ============================================================================

export async function getNotificationsByArtisanId(artisanId: number, includeArchived: boolean = false): Promise<Notification[]> {
  const db = await getDb();
  if (!db) return [];
  
  if (includeArchived) {
    return await db.select().from(notifications).where(eq(notifications.artisanId, artisanId)).orderBy(desc(notifications.createdAt));
  }
  
  return await db.select().from(notifications).where(
    and(eq(notifications.artisanId, artisanId), eq(notifications.archived, false))
  ).orderBy(desc(notifications.createdAt));
}

export async function getUnreadNotificationsCount(artisanId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(
    and(
      eq(notifications.artisanId, artisanId),
      eq(notifications.lu, false),
      eq(notifications.archived, false)
    )
  );
  
  return result[0]?.count || 0;
}

export async function createNotification(data: InsertNotification): Promise<Notification> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(notifications).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(notifications).where(eq(notifications.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created notification");
  return created[0];
}

export async function markNotificationAsRead(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notifications).set({ lu: true }).where(eq(notifications.id, id));
}

export async function markAllNotificationsAsRead(artisanId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notifications).set({ lu: true }).where(eq(notifications.artisanId, artisanId));
}

export async function archiveNotification(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notifications).set({ archived: true }).where(eq(notifications.id, id));
}

// ============================================================================
// PARAMETRES ARTISAN QUERIES
// ============================================================================

export async function getParametresArtisan(artisanId: number): Promise<ParametresArtisan | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(parametresArtisan).where(eq(parametresArtisan.artisanId, artisanId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateParametresArtisan(artisanId: number, data: Partial<InsertParametresArtisan>): Promise<ParametresArtisan> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getParametresArtisan(artisanId);
  if (existing) {
    await db.update(parametresArtisan).set(data).where(eq(parametresArtisan.artisanId, artisanId));
  } else {
    await db.insert(parametresArtisan).values({ artisanId, ...data });
  }
  
  const updated = await db.select().from(parametresArtisan).where(eq(parametresArtisan.artisanId, artisanId)).limit(1);
  if (updated.length === 0) throw new Error("Parametres not found");
  return updated[0];
}

// ============================================================================
// DASHBOARD STATISTICS
// ============================================================================

export async function getDashboardStats(artisanId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  
  // Chiffre d'affaires du mois
  const caMonth = await db.select({ total: sql<number>`COALESCE(SUM(totalTTC), 0)` }).from(factures).where(
    and(
      eq(factures.artisanId, artisanId),
      eq(factures.statut, "payee"),
      gte(factures.datePaiement, startOfMonth)
    )
  );
  
  // Chiffre d'affaires de l'année
  const caYear = await db.select({ total: sql<number>`COALESCE(SUM(totalTTC), 0)` }).from(factures).where(
    and(
      eq(factures.artisanId, artisanId),
      eq(factures.statut, "payee"),
      gte(factures.datePaiement, startOfYear)
    )
  );
  
  // Devis en cours
  const devisEnCours = await db.select({ count: sql<number>`count(*)` }).from(devis).where(
    and(
      eq(devis.artisanId, artisanId),
      or(eq(devis.statut, "brouillon"), eq(devis.statut, "envoye"))
    )
  );
  
  // Factures impayées
  const facturesImpayees = await db.select({ 
    count: sql<number>`count(*)`,
    total: sql<number>`COALESCE(SUM(totalTTC - montantPaye), 0)`
  }).from(factures).where(
    and(
      eq(factures.artisanId, artisanId),
      or(eq(factures.statut, "envoyee"), eq(factures.statut, "en_retard"))
    )
  );
  
  // Interventions à venir
  const interventionsAVenir = await db.select({ count: sql<number>`count(*)` }).from(interventions).where(
    and(
      eq(interventions.artisanId, artisanId),
      eq(interventions.statut, "planifiee"),
      gte(interventions.dateDebut, now)
    )
  );
  
  // Nombre total de clients
  const totalClients = await db.select({ count: sql<number>`count(*)` }).from(clients).where(
    eq(clients.artisanId, artisanId)
  );
  
  return {
    caMonth: Number(caMonth[0]?.total) || 0,
    caYear: Number(caYear[0]?.total) || 0,
    devisEnCours: devisEnCours[0]?.count || 0,
    facturesImpayees: {
      count: facturesImpayees[0]?.count || 0,
      total: Number(facturesImpayees[0]?.total) || 0
    },
    interventionsAVenir: interventionsAVenir[0]?.count || 0,
    totalClients: totalClients[0]?.count || 0
  };
}

// ============================================================================
// SEED BIBLIOTHEQUE ARTICLES
// ============================================================================

export async function seedBibliothequeArticles(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if articles already exist
  const existing = await db.select({ count: sql<number>`count(*)` }).from(bibliothequeArticles);
  if ((existing[0]?.count || 0) > 0) {
    console.log("[Seed] Bibliotheque articles already seeded");
    return;
  }
  
  const articlesPlomberie: InsertBibliothequeArticle[] = [
    // Robinetterie
    { reference: "PLB-ROB-001", designation: "Robinet mitigeur évier chromé", prixUnitaireHT: "45.00", categorie: "Robinetterie", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ROB-002", designation: "Robinet mitigeur lavabo chromé", prixUnitaireHT: "38.00", categorie: "Robinetterie", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ROB-003", designation: "Mitigeur thermostatique douche", prixUnitaireHT: "120.00", categorie: "Robinetterie", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ROB-004", designation: "Mitigeur thermostatique bain/douche", prixUnitaireHT: "150.00", categorie: "Robinetterie", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ROB-005", designation: "Robinet d'arrêt 1/2 pouce", prixUnitaireHT: "12.00", categorie: "Robinetterie", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ROB-006", designation: "Robinet d'arrêt 3/4 pouce", prixUnitaireHT: "15.00", categorie: "Robinetterie", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ROB-007", designation: "Vanne à boisseau sphérique 1/2", prixUnitaireHT: "18.00", categorie: "Robinetterie", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ROB-008", designation: "Vanne à boisseau sphérique 3/4", prixUnitaireHT: "22.00", categorie: "Robinetterie", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ROB-009", designation: "Robinet de puisage 1/2", prixUnitaireHT: "25.00", categorie: "Robinetterie", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ROB-010", designation: "Robinet flotteur WC", prixUnitaireHT: "15.00", categorie: "Robinetterie", metier: "plomberie", unite: "unité" },
    
    // Tuyauterie cuivre
    { reference: "PLB-CUI-001", designation: "Tube cuivre 12mm (barre 4m)", prixUnitaireHT: "28.00", categorie: "Tuyauterie cuivre", metier: "plomberie", unite: "barre" },
    { reference: "PLB-CUI-002", designation: "Tube cuivre 14mm (barre 4m)", prixUnitaireHT: "32.00", categorie: "Tuyauterie cuivre", metier: "plomberie", unite: "barre" },
    { reference: "PLB-CUI-003", designation: "Tube cuivre 16mm (barre 4m)", prixUnitaireHT: "38.00", categorie: "Tuyauterie cuivre", metier: "plomberie", unite: "barre" },
    { reference: "PLB-CUI-004", designation: "Tube cuivre 18mm (barre 4m)", prixUnitaireHT: "42.00", categorie: "Tuyauterie cuivre", metier: "plomberie", unite: "barre" },
    { reference: "PLB-CUI-005", designation: "Tube cuivre 22mm (barre 4m)", prixUnitaireHT: "52.00", categorie: "Tuyauterie cuivre", metier: "plomberie", unite: "barre" },
    { reference: "PLB-CUI-006", designation: "Coude cuivre 90° 12mm", prixUnitaireHT: "1.50", categorie: "Tuyauterie cuivre", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CUI-007", designation: "Coude cuivre 90° 14mm", prixUnitaireHT: "1.80", categorie: "Tuyauterie cuivre", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CUI-008", designation: "Coude cuivre 90° 16mm", prixUnitaireHT: "2.20", categorie: "Tuyauterie cuivre", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CUI-009", designation: "Té cuivre égal 14mm", prixUnitaireHT: "2.50", categorie: "Tuyauterie cuivre", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CUI-010", designation: "Té cuivre égal 16mm", prixUnitaireHT: "3.00", categorie: "Tuyauterie cuivre", metier: "plomberie", unite: "unité" },
    
    // Tuyauterie PER
    { reference: "PLB-PER-001", designation: "Tube PER 12mm (couronne 50m)", prixUnitaireHT: "45.00", categorie: "Tuyauterie PER", metier: "plomberie", unite: "couronne" },
    { reference: "PLB-PER-002", designation: "Tube PER 16mm (couronne 50m)", prixUnitaireHT: "55.00", categorie: "Tuyauterie PER", metier: "plomberie", unite: "couronne" },
    { reference: "PLB-PER-003", designation: "Tube PER 20mm (couronne 50m)", prixUnitaireHT: "75.00", categorie: "Tuyauterie PER", metier: "plomberie", unite: "couronne" },
    { reference: "PLB-PER-004", designation: "Raccord à sertir droit 12mm", prixUnitaireHT: "3.50", categorie: "Tuyauterie PER", metier: "plomberie", unite: "unité" },
    { reference: "PLB-PER-005", designation: "Raccord à sertir droit 16mm", prixUnitaireHT: "4.00", categorie: "Tuyauterie PER", metier: "plomberie", unite: "unité" },
    { reference: "PLB-PER-006", designation: "Raccord à sertir coude 12mm", prixUnitaireHT: "4.50", categorie: "Tuyauterie PER", metier: "plomberie", unite: "unité" },
    { reference: "PLB-PER-007", designation: "Raccord à sertir coude 16mm", prixUnitaireHT: "5.00", categorie: "Tuyauterie PER", metier: "plomberie", unite: "unité" },
    { reference: "PLB-PER-008", designation: "Collecteur 4 départs PER", prixUnitaireHT: "35.00", categorie: "Tuyauterie PER", metier: "plomberie", unite: "unité" },
    { reference: "PLB-PER-009", designation: "Collecteur 6 départs PER", prixUnitaireHT: "48.00", categorie: "Tuyauterie PER", metier: "plomberie", unite: "unité" },
    { reference: "PLB-PER-010", designation: "Gaine annelée 16mm (couronne 50m)", prixUnitaireHT: "18.00", categorie: "Tuyauterie PER", metier: "plomberie", unite: "couronne" },
    
    // Évacuation PVC
    { reference: "PLB-PVC-001", designation: "Tube PVC évacuation 32mm (barre 4m)", prixUnitaireHT: "8.00", categorie: "Évacuation PVC", metier: "plomberie", unite: "barre" },
    { reference: "PLB-PVC-002", designation: "Tube PVC évacuation 40mm (barre 4m)", prixUnitaireHT: "10.00", categorie: "Évacuation PVC", metier: "plomberie", unite: "barre" },
    { reference: "PLB-PVC-003", designation: "Tube PVC évacuation 50mm (barre 4m)", prixUnitaireHT: "12.00", categorie: "Évacuation PVC", metier: "plomberie", unite: "barre" },
    { reference: "PLB-PVC-004", designation: "Tube PVC évacuation 100mm (barre 4m)", prixUnitaireHT: "22.00", categorie: "Évacuation PVC", metier: "plomberie", unite: "barre" },
    { reference: "PLB-PVC-005", designation: "Coude PVC 45° 40mm", prixUnitaireHT: "2.50", categorie: "Évacuation PVC", metier: "plomberie", unite: "unité" },
    { reference: "PLB-PVC-006", designation: "Coude PVC 90° 40mm", prixUnitaireHT: "2.80", categorie: "Évacuation PVC", metier: "plomberie", unite: "unité" },
    { reference: "PLB-PVC-007", designation: "Coude PVC 90° 100mm", prixUnitaireHT: "5.50", categorie: "Évacuation PVC", metier: "plomberie", unite: "unité" },
    { reference: "PLB-PVC-008", designation: "Culotte PVC 45° 100mm", prixUnitaireHT: "8.00", categorie: "Évacuation PVC", metier: "plomberie", unite: "unité" },
    { reference: "PLB-PVC-009", designation: "Manchon PVC 40mm", prixUnitaireHT: "1.50", categorie: "Évacuation PVC", metier: "plomberie", unite: "unité" },
    { reference: "PLB-PVC-010", designation: "Manchon PVC 100mm", prixUnitaireHT: "3.50", categorie: "Évacuation PVC", metier: "plomberie", unite: "unité" },
    
    // Sanitaires
    { reference: "PLB-SAN-001", designation: "WC complet avec réservoir", prixUnitaireHT: "120.00", categorie: "Sanitaires", metier: "plomberie", unite: "ensemble" },
    { reference: "PLB-SAN-002", designation: "Lavabo céramique blanc", prixUnitaireHT: "55.00", categorie: "Sanitaires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-SAN-003", designation: "Vasque à poser ronde", prixUnitaireHT: "85.00", categorie: "Sanitaires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-SAN-004", designation: "Receveur de douche 80x80", prixUnitaireHT: "95.00", categorie: "Sanitaires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-SAN-005", designation: "Receveur de douche 90x90", prixUnitaireHT: "110.00", categorie: "Sanitaires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-SAN-006", designation: "Baignoire acrylique 170x70", prixUnitaireHT: "180.00", categorie: "Sanitaires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-SAN-007", designation: "Bidet céramique blanc", prixUnitaireHT: "75.00", categorie: "Sanitaires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-SAN-008", designation: "Évier inox 1 bac", prixUnitaireHT: "65.00", categorie: "Sanitaires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-SAN-009", designation: "Évier inox 2 bacs", prixUnitaireHT: "95.00", categorie: "Sanitaires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-SAN-010", designation: "Abattant WC standard", prixUnitaireHT: "25.00", categorie: "Sanitaires", metier: "plomberie", unite: "unité" },
    
    // Chauffe-eau
    { reference: "PLB-CE-001", designation: "Chauffe-eau électrique 100L vertical", prixUnitaireHT: "280.00", categorie: "Chauffe-eau", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CE-002", designation: "Chauffe-eau électrique 150L vertical", prixUnitaireHT: "350.00", categorie: "Chauffe-eau", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CE-003", designation: "Chauffe-eau électrique 200L vertical", prixUnitaireHT: "420.00", categorie: "Chauffe-eau", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CE-004", designation: "Chauffe-eau électrique 300L vertical", prixUnitaireHT: "550.00", categorie: "Chauffe-eau", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CE-005", designation: "Groupe de sécurité", prixUnitaireHT: "18.00", categorie: "Chauffe-eau", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CE-006", designation: "Vase d'expansion sanitaire 8L", prixUnitaireHT: "45.00", categorie: "Chauffe-eau", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CE-007", designation: "Réducteur de pression", prixUnitaireHT: "35.00", categorie: "Chauffe-eau", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CE-008", designation: "Anode magnésium", prixUnitaireHT: "28.00", categorie: "Chauffe-eau", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CE-009", designation: "Thermostat chauffe-eau", prixUnitaireHT: "35.00", categorie: "Chauffe-eau", metier: "plomberie", unite: "unité" },
    { reference: "PLB-CE-010", designation: "Résistance stéatite 2400W", prixUnitaireHT: "65.00", categorie: "Chauffe-eau", metier: "plomberie", unite: "unité" },
    
    // Accessoires
    { reference: "PLB-ACC-001", designation: "Siphon lavabo chromé", prixUnitaireHT: "12.00", categorie: "Accessoires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ACC-002", designation: "Siphon évier 1 bac", prixUnitaireHT: "15.00", categorie: "Accessoires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ACC-003", designation: "Bonde de douche 90mm", prixUnitaireHT: "18.00", categorie: "Accessoires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ACC-004", designation: "Bonde de baignoire", prixUnitaireHT: "22.00", categorie: "Accessoires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ACC-005", designation: "Flexible douche 1.5m", prixUnitaireHT: "12.00", categorie: "Accessoires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ACC-006", designation: "Pommeau de douche", prixUnitaireHT: "18.00", categorie: "Accessoires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ACC-007", designation: "Barre de douche réglable", prixUnitaireHT: "25.00", categorie: "Accessoires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ACC-008", designation: "Colonne de douche complète", prixUnitaireHT: "180.00", categorie: "Accessoires", metier: "plomberie", unite: "ensemble" },
    { reference: "PLB-ACC-009", designation: "Porte-savon chromé", prixUnitaireHT: "15.00", categorie: "Accessoires", metier: "plomberie", unite: "unité" },
    { reference: "PLB-ACC-010", designation: "Porte-serviettes chromé", prixUnitaireHT: "22.00", categorie: "Accessoires", metier: "plomberie", unite: "unité" },
    
    // Main d'oeuvre
    { reference: "PLB-MO-001", designation: "Main d'oeuvre plomberie (heure)", prixUnitaireHT: "45.00", categorie: "Main d'oeuvre", metier: "plomberie", unite: "heure" },
    { reference: "PLB-MO-002", designation: "Déplacement zone 1 (0-20km)", prixUnitaireHT: "25.00", categorie: "Main d'oeuvre", metier: "plomberie", unite: "forfait" },
    { reference: "PLB-MO-003", designation: "Déplacement zone 2 (20-40km)", prixUnitaireHT: "45.00", categorie: "Main d'oeuvre", metier: "plomberie", unite: "forfait" },
    { reference: "PLB-MO-004", designation: "Installation WC complet", prixUnitaireHT: "150.00", categorie: "Main d'oeuvre", metier: "plomberie", unite: "forfait" },
    { reference: "PLB-MO-005", designation: "Installation lavabo", prixUnitaireHT: "80.00", categorie: "Main d'oeuvre", metier: "plomberie", unite: "forfait" },
    { reference: "PLB-MO-006", designation: "Installation douche complète", prixUnitaireHT: "350.00", categorie: "Main d'oeuvre", metier: "plomberie", unite: "forfait" },
    { reference: "PLB-MO-007", designation: "Installation chauffe-eau", prixUnitaireHT: "180.00", categorie: "Main d'oeuvre", metier: "plomberie", unite: "forfait" },
    { reference: "PLB-MO-008", designation: "Débouchage canalisation", prixUnitaireHT: "95.00", categorie: "Main d'oeuvre", metier: "plomberie", unite: "forfait" },
    { reference: "PLB-MO-009", designation: "Recherche de fuite", prixUnitaireHT: "120.00", categorie: "Main d'oeuvre", metier: "plomberie", unite: "forfait" },
    { reference: "PLB-MO-010", designation: "Remplacement robinet", prixUnitaireHT: "45.00", categorie: "Main d'oeuvre", metier: "plomberie", unite: "forfait" },
  ];
  
  const articlesElectricite: InsertBibliothequeArticle[] = [
    // Tableau électrique
    { reference: "ELE-TAB-001", designation: "Tableau électrique 2 rangées", prixUnitaireHT: "45.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-002", designation: "Tableau électrique 3 rangées", prixUnitaireHT: "65.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-003", designation: "Tableau électrique 4 rangées", prixUnitaireHT: "85.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-004", designation: "Disjoncteur différentiel 30mA 40A type A", prixUnitaireHT: "85.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-005", designation: "Disjoncteur différentiel 30mA 40A type AC", prixUnitaireHT: "65.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-006", designation: "Disjoncteur différentiel 30mA 63A type A", prixUnitaireHT: "110.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-007", designation: "Disjoncteur divisionnaire 10A", prixUnitaireHT: "8.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-008", designation: "Disjoncteur divisionnaire 16A", prixUnitaireHT: "8.50", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-009", designation: "Disjoncteur divisionnaire 20A", prixUnitaireHT: "9.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-010", designation: "Disjoncteur divisionnaire 32A", prixUnitaireHT: "12.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-011", designation: "Peigne d'alimentation horizontal", prixUnitaireHT: "18.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-012", designation: "Peigne d'alimentation vertical", prixUnitaireHT: "22.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-013", designation: "Bornier de terre", prixUnitaireHT: "8.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-014", designation: "Parafoudre modulaire", prixUnitaireHT: "95.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-015", designation: "Contacteur jour/nuit 20A", prixUnitaireHT: "35.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-016", designation: "Télérupteur 16A", prixUnitaireHT: "28.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-017", designation: "Minuterie d'escalier", prixUnitaireHT: "45.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-018", designation: "Horloge programmable", prixUnitaireHT: "55.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-019", designation: "Délesteur", prixUnitaireHT: "120.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-TAB-020", designation: "Compteur d'énergie modulaire", prixUnitaireHT: "85.00", categorie: "Tableau électrique", metier: "electricite", unite: "unité" },
    
    // Câblage
    { reference: "ELE-CAB-001", designation: "Câble R2V 3G1.5 (couronne 100m)", prixUnitaireHT: "85.00", categorie: "Câblage", metier: "electricite", unite: "couronne" },
    { reference: "ELE-CAB-002", designation: "Câble R2V 3G2.5 (couronne 100m)", prixUnitaireHT: "120.00", categorie: "Câblage", metier: "electricite", unite: "couronne" },
    { reference: "ELE-CAB-003", designation: "Câble R2V 3G6 (couronne 50m)", prixUnitaireHT: "145.00", categorie: "Câblage", metier: "electricite", unite: "couronne" },
    { reference: "ELE-CAB-004", designation: "Câble R2V 5G1.5 (couronne 100m)", prixUnitaireHT: "125.00", categorie: "Câblage", metier: "electricite", unite: "couronne" },
    { reference: "ELE-CAB-005", designation: "Câble R2V 5G2.5 (couronne 100m)", prixUnitaireHT: "175.00", categorie: "Câblage", metier: "electricite", unite: "couronne" },
    { reference: "ELE-CAB-006", designation: "Fil H07VU 1.5mm² (couronne 100m)", prixUnitaireHT: "22.00", categorie: "Câblage", metier: "electricite", unite: "couronne" },
    { reference: "ELE-CAB-007", designation: "Fil H07VU 2.5mm² (couronne 100m)", prixUnitaireHT: "35.00", categorie: "Câblage", metier: "electricite", unite: "couronne" },
    { reference: "ELE-CAB-008", designation: "Fil H07VU 6mm² (couronne 100m)", prixUnitaireHT: "75.00", categorie: "Câblage", metier: "electricite", unite: "couronne" },
    { reference: "ELE-CAB-009", designation: "Câble de terre 16mm² vert/jaune", prixUnitaireHT: "3.50", categorie: "Câblage", metier: "electricite", unite: "mètre" },
    { reference: "ELE-CAB-010", designation: "Câble de terre 25mm² vert/jaune", prixUnitaireHT: "5.50", categorie: "Câblage", metier: "electricite", unite: "mètre" },
    { reference: "ELE-CAB-011", designation: "Gaine ICTA 16mm (couronne 100m)", prixUnitaireHT: "28.00", categorie: "Câblage", metier: "electricite", unite: "couronne" },
    { reference: "ELE-CAB-012", designation: "Gaine ICTA 20mm (couronne 100m)", prixUnitaireHT: "35.00", categorie: "Câblage", metier: "electricite", unite: "couronne" },
    { reference: "ELE-CAB-013", designation: "Gaine ICTA 25mm (couronne 50m)", prixUnitaireHT: "25.00", categorie: "Câblage", metier: "electricite", unite: "couronne" },
    { reference: "ELE-CAB-014", designation: "Moulure PVC 20x10 (barre 2m)", prixUnitaireHT: "3.50", categorie: "Câblage", metier: "electricite", unite: "barre" },
    { reference: "ELE-CAB-015", designation: "Moulure PVC 32x12 (barre 2m)", prixUnitaireHT: "5.00", categorie: "Câblage", metier: "electricite", unite: "barre" },
    { reference: "ELE-CAB-016", designation: "Goulotte PVC 40x40 (barre 2m)", prixUnitaireHT: "8.00", categorie: "Câblage", metier: "electricite", unite: "barre" },
    { reference: "ELE-CAB-017", designation: "Goulotte PVC 60x40 (barre 2m)", prixUnitaireHT: "12.00", categorie: "Câblage", metier: "electricite", unite: "barre" },
    { reference: "ELE-CAB-018", designation: "Chemin de câbles 100mm (barre 3m)", prixUnitaireHT: "25.00", categorie: "Câblage", metier: "electricite", unite: "barre" },
    { reference: "ELE-CAB-019", designation: "Chemin de câbles 200mm (barre 3m)", prixUnitaireHT: "35.00", categorie: "Câblage", metier: "electricite", unite: "barre" },
    { reference: "ELE-CAB-020", designation: "Collier de fixation (lot 100)", prixUnitaireHT: "8.00", categorie: "Câblage", metier: "electricite", unite: "lot" },
    
    // Appareillage
    { reference: "ELE-APP-001", designation: "Interrupteur simple allumage blanc", prixUnitaireHT: "5.50", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-002", designation: "Interrupteur double allumage blanc", prixUnitaireHT: "8.00", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-003", designation: "Interrupteur va-et-vient blanc", prixUnitaireHT: "6.50", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-004", designation: "Bouton poussoir blanc", prixUnitaireHT: "6.00", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-005", designation: "Variateur de lumière 300W", prixUnitaireHT: "25.00", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-006", designation: "Prise de courant 2P+T blanc", prixUnitaireHT: "4.50", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-007", designation: "Prise de courant double 2P+T blanc", prixUnitaireHT: "12.00", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-008", designation: "Prise de courant étanche IP55", prixUnitaireHT: "12.00", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-009", designation: "Prise RJ45 cat.6", prixUnitaireHT: "18.00", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-010", designation: "Prise TV/SAT", prixUnitaireHT: "15.00", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-011", designation: "Prise téléphone RJ11", prixUnitaireHT: "12.00", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-012", designation: "Sortie de câble 20A", prixUnitaireHT: "8.00", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-013", designation: "Sortie de câble 32A", prixUnitaireHT: "12.00", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-014", designation: "Détecteur de mouvement", prixUnitaireHT: "35.00", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-015", designation: "Interrupteur crépusculaire", prixUnitaireHT: "28.00", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-016", designation: "Boîte d'encastrement simple", prixUnitaireHT: "0.80", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-017", designation: "Boîte d'encastrement double", prixUnitaireHT: "1.50", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-018", designation: "Boîte de dérivation 80x80", prixUnitaireHT: "2.50", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-019", designation: "Boîte de dérivation 100x100", prixUnitaireHT: "3.50", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    { reference: "ELE-APP-020", designation: "Boîte de dérivation étanche IP55", prixUnitaireHT: "5.50", categorie: "Appareillage", metier: "electricite", unite: "unité" },
    
    // Éclairage
    { reference: "ELE-ECL-001", designation: "Spot LED encastrable 7W", prixUnitaireHT: "12.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-002", designation: "Spot LED encastrable 10W", prixUnitaireHT: "15.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-003", designation: "Plafonnier LED 18W", prixUnitaireHT: "25.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-004", designation: "Plafonnier LED 24W", prixUnitaireHT: "35.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-005", designation: "Dalle LED 600x600 40W", prixUnitaireHT: "45.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-006", designation: "Réglette LED 60cm 18W", prixUnitaireHT: "18.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-007", designation: "Réglette LED 120cm 36W", prixUnitaireHT: "28.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-008", designation: "Réglette LED étanche 120cm", prixUnitaireHT: "35.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-009", designation: "Hublot LED 12W", prixUnitaireHT: "22.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-010", designation: "Hublot LED étanche 18W", prixUnitaireHT: "35.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-011", designation: "Applique murale LED", prixUnitaireHT: "28.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-012", designation: "Projecteur LED 20W", prixUnitaireHT: "25.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-013", designation: "Projecteur LED 50W", prixUnitaireHT: "45.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-014", designation: "Projecteur LED 100W", prixUnitaireHT: "75.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-015", designation: "Ampoule LED E27 10W", prixUnitaireHT: "5.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-016", designation: "Ampoule LED E14 5W", prixUnitaireHT: "4.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-017", designation: "Ampoule LED GU10 5W", prixUnitaireHT: "4.50", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-018", designation: "Tube LED T8 60cm", prixUnitaireHT: "8.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-019", designation: "Tube LED T8 120cm", prixUnitaireHT: "12.00", categorie: "Éclairage", metier: "electricite", unite: "unité" },
    { reference: "ELE-ECL-020", designation: "Bandeau LED 5m blanc", prixUnitaireHT: "25.00", categorie: "Éclairage", metier: "electricite", unite: "rouleau" },
    
    // Domotique
    { reference: "ELE-DOM-001", designation: "Interrupteur connecté WiFi", prixUnitaireHT: "35.00", categorie: "Domotique", metier: "electricite", unite: "unité" },
    { reference: "ELE-DOM-002", designation: "Prise connectée WiFi", prixUnitaireHT: "25.00", categorie: "Domotique", metier: "electricite", unite: "unité" },
    { reference: "ELE-DOM-003", designation: "Thermostat connecté", prixUnitaireHT: "120.00", categorie: "Domotique", metier: "electricite", unite: "unité" },
    { reference: "ELE-DOM-004", designation: "Détecteur de fumée connecté", prixUnitaireHT: "45.00", categorie: "Domotique", metier: "electricite", unite: "unité" },
    { reference: "ELE-DOM-005", designation: "Caméra de surveillance WiFi", prixUnitaireHT: "85.00", categorie: "Domotique", metier: "electricite", unite: "unité" },
    { reference: "ELE-DOM-006", designation: "Sonnette vidéo connectée", prixUnitaireHT: "150.00", categorie: "Domotique", metier: "electricite", unite: "unité" },
    { reference: "ELE-DOM-007", designation: "Volet roulant électrique", prixUnitaireHT: "280.00", categorie: "Domotique", metier: "electricite", unite: "unité" },
    { reference: "ELE-DOM-008", designation: "Moteur volet roulant", prixUnitaireHT: "120.00", categorie: "Domotique", metier: "electricite", unite: "unité" },
    { reference: "ELE-DOM-009", designation: "Télécommande volets 5 canaux", prixUnitaireHT: "45.00", categorie: "Domotique", metier: "electricite", unite: "unité" },
    { reference: "ELE-DOM-010", designation: "Box domotique", prixUnitaireHT: "250.00", categorie: "Domotique", metier: "electricite", unite: "unité" },
    
    // Sécurité
    { reference: "ELE-SEC-001", designation: "Détecteur de fumée NF", prixUnitaireHT: "18.00", categorie: "Sécurité", metier: "electricite", unite: "unité" },
    { reference: "ELE-SEC-002", designation: "Détecteur de monoxyde de carbone", prixUnitaireHT: "35.00", categorie: "Sécurité", metier: "electricite", unite: "unité" },
    { reference: "ELE-SEC-003", designation: "Centrale d'alarme filaire", prixUnitaireHT: "350.00", categorie: "Sécurité", metier: "electricite", unite: "unité" },
    { reference: "ELE-SEC-004", designation: "Centrale d'alarme sans fil", prixUnitaireHT: "450.00", categorie: "Sécurité", metier: "electricite", unite: "unité" },
    { reference: "ELE-SEC-005", designation: "Détecteur de mouvement infrarouge", prixUnitaireHT: "28.00", categorie: "Sécurité", metier: "electricite", unite: "unité" },
    { reference: "ELE-SEC-006", designation: "Détecteur d'ouverture porte/fenêtre", prixUnitaireHT: "22.00", categorie: "Sécurité", metier: "electricite", unite: "unité" },
    { reference: "ELE-SEC-007", designation: "Sirène intérieure", prixUnitaireHT: "45.00", categorie: "Sécurité", metier: "electricite", unite: "unité" },
    { reference: "ELE-SEC-008", designation: "Sirène extérieure", prixUnitaireHT: "85.00", categorie: "Sécurité", metier: "electricite", unite: "unité" },
    { reference: "ELE-SEC-009", designation: "Clavier à code", prixUnitaireHT: "65.00", categorie: "Sécurité", metier: "electricite", unite: "unité" },
    { reference: "ELE-SEC-010", designation: "Télécommande alarme", prixUnitaireHT: "35.00", categorie: "Sécurité", metier: "electricite", unite: "unité" },
    
    // Ventilation
    { reference: "ELE-VEN-001", designation: "VMC simple flux autoréglable", prixUnitaireHT: "120.00", categorie: "Ventilation", metier: "electricite", unite: "unité" },
    { reference: "ELE-VEN-002", designation: "VMC simple flux hygroréglable", prixUnitaireHT: "180.00", categorie: "Ventilation", metier: "electricite", unite: "unité" },
    { reference: "ELE-VEN-003", designation: "VMC double flux", prixUnitaireHT: "850.00", categorie: "Ventilation", metier: "electricite", unite: "unité" },
    { reference: "ELE-VEN-004", designation: "Bouche d'extraction cuisine", prixUnitaireHT: "25.00", categorie: "Ventilation", metier: "electricite", unite: "unité" },
    { reference: "ELE-VEN-005", designation: "Bouche d'extraction salle de bain", prixUnitaireHT: "18.00", categorie: "Ventilation", metier: "electricite", unite: "unité" },
    { reference: "ELE-VEN-006", designation: "Bouche d'extraction WC", prixUnitaireHT: "15.00", categorie: "Ventilation", metier: "electricite", unite: "unité" },
    { reference: "ELE-VEN-007", designation: "Gaine VMC 80mm (rouleau 6m)", prixUnitaireHT: "12.00", categorie: "Ventilation", metier: "electricite", unite: "rouleau" },
    { reference: "ELE-VEN-008", designation: "Gaine VMC 125mm (rouleau 6m)", prixUnitaireHT: "18.00", categorie: "Ventilation", metier: "electricite", unite: "rouleau" },
    { reference: "ELE-VEN-009", designation: "Extracteur d'air 100mm", prixUnitaireHT: "35.00", categorie: "Ventilation", metier: "electricite", unite: "unité" },
    { reference: "ELE-VEN-010", designation: "Extracteur d'air 125mm", prixUnitaireHT: "45.00", categorie: "Ventilation", metier: "electricite", unite: "unité" },
    
    // Chauffage électrique
    { reference: "ELE-CHA-001", designation: "Radiateur électrique 1000W", prixUnitaireHT: "180.00", categorie: "Chauffage électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-CHA-002", designation: "Radiateur électrique 1500W", prixUnitaireHT: "220.00", categorie: "Chauffage électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-CHA-003", designation: "Radiateur électrique 2000W", prixUnitaireHT: "280.00", categorie: "Chauffage électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-CHA-004", designation: "Sèche-serviettes électrique 500W", prixUnitaireHT: "150.00", categorie: "Chauffage électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-CHA-005", designation: "Sèche-serviettes électrique 750W", prixUnitaireHT: "200.00", categorie: "Chauffage électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-CHA-006", designation: "Convecteur électrique 1000W", prixUnitaireHT: "85.00", categorie: "Chauffage électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-CHA-007", designation: "Convecteur électrique 1500W", prixUnitaireHT: "95.00", categorie: "Chauffage électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-CHA-008", designation: "Panneau rayonnant 1000W", prixUnitaireHT: "120.00", categorie: "Chauffage électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-CHA-009", designation: "Panneau rayonnant 1500W", prixUnitaireHT: "150.00", categorie: "Chauffage électrique", metier: "electricite", unite: "unité" },
    { reference: "ELE-CHA-010", designation: "Plancher chauffant électrique (m²)", prixUnitaireHT: "45.00", categorie: "Chauffage électrique", metier: "electricite", unite: "m²" },
    
    // Main d'oeuvre
    { reference: "ELE-MO-001", designation: "Main d'oeuvre électricité (heure)", prixUnitaireHT: "48.00", categorie: "Main d'oeuvre", metier: "electricite", unite: "heure" },
    { reference: "ELE-MO-002", designation: "Déplacement zone 1 (0-20km)", prixUnitaireHT: "25.00", categorie: "Main d'oeuvre", metier: "electricite", unite: "forfait" },
    { reference: "ELE-MO-003", designation: "Déplacement zone 2 (20-40km)", prixUnitaireHT: "45.00", categorie: "Main d'oeuvre", metier: "electricite", unite: "forfait" },
    { reference: "ELE-MO-004", designation: "Installation tableau électrique", prixUnitaireHT: "350.00", categorie: "Main d'oeuvre", metier: "electricite", unite: "forfait" },
    { reference: "ELE-MO-005", designation: "Mise aux normes tableau", prixUnitaireHT: "450.00", categorie: "Main d'oeuvre", metier: "electricite", unite: "forfait" },
    { reference: "ELE-MO-006", designation: "Installation point lumineux", prixUnitaireHT: "65.00", categorie: "Main d'oeuvre", metier: "electricite", unite: "forfait" },
    { reference: "ELE-MO-007", designation: "Installation prise de courant", prixUnitaireHT: "55.00", categorie: "Main d'oeuvre", metier: "electricite", unite: "forfait" },
    { reference: "ELE-MO-008", designation: "Installation interrupteur", prixUnitaireHT: "45.00", categorie: "Main d'oeuvre", metier: "electricite", unite: "forfait" },
    { reference: "ELE-MO-009", designation: "Diagnostic électrique", prixUnitaireHT: "150.00", categorie: "Main d'oeuvre", metier: "electricite", unite: "forfait" },
    { reference: "ELE-MO-010", designation: "Consuel (attestation conformité)", prixUnitaireHT: "180.00", categorie: "Main d'oeuvre", metier: "electricite", unite: "forfait" },
  ];
  
  // Insert all articles
  await db.insert(bibliothequeArticles).values([...articlesPlomberie, ...articlesElectricite]);
  
  console.log(`[Seed] Inserted ${articlesPlomberie.length + articlesElectricite.length} articles into bibliotheque`);
}


// ============================================================================
// SIGNATURES DEVIS QUERIES
// ============================================================================

export async function createSignatureDevis(data: InsertSignatureDevis): Promise<SignatureDevis> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(signaturesDevis).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(signaturesDevis).where(eq(signaturesDevis.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created signature");
  return created[0];
}

export async function getSignatureByToken(token: string): Promise<SignatureDevis | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(signaturesDevis).where(eq(signaturesDevis.token, token)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getSignatureByDevisId(devisId: number): Promise<SignatureDevis | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(signaturesDevis).where(eq(signaturesDevis.devisId, devisId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateSignatureDevis(id: number, data: Partial<InsertSignatureDevis>): Promise<SignatureDevis> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(signaturesDevis).set(data).where(eq(signaturesDevis.id, id));
  const updated = await db.select().from(signaturesDevis).where(eq(signaturesDevis.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Signature not found");
  return updated[0];
}

export async function signDevis(token: string, signatureData: string, signataireName: string, signataireEmail: string, ipAddress: string, userAgent: string): Promise<SignatureDevis> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const signature = await getSignatureByToken(token);
  if (!signature) throw new Error("Signature token not found");
  if (signature.signedAt) throw new Error("Devis already signed");
  if (new Date() > signature.expiresAt) throw new Error("Signature link expired");
  
  await db.update(signaturesDevis).set({
    signatureData,
    signataireName,
    signataireEmail,
    ipAddress,
    userAgent,
    signedAt: new Date()
  }).where(eq(signaturesDevis.token, token));
  
  // Update devis status to accepted
  await db.update(devis).set({ statut: "accepte" }).where(eq(devis.id, signature.devisId));
  
  const updated = await db.select().from(signaturesDevis).where(eq(signaturesDevis.token, token)).limit(1);
  return updated[0];
}

// ============================================================================
// STOCKS QUERIES
// ============================================================================

export async function getStocksByArtisanId(artisanId: number): Promise<Stock[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(stocks).where(eq(stocks.artisanId, artisanId)).orderBy(stocks.designation);
}

export async function getStockById(id: number): Promise<Stock | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(stocks).where(eq(stocks.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createStock(data: InsertStock): Promise<Stock> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(stocks).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(stocks).where(eq(stocks.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created stock");
  return created[0];
}

export async function updateStock(id: number, data: Partial<InsertStock>): Promise<Stock> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(stocks).set(data).where(eq(stocks.id, id));
  const updated = await db.select().from(stocks).where(eq(stocks.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Stock not found");
  return updated[0];
}

export async function deleteStock(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(mouvementsStock).where(eq(mouvementsStock.stockId, id));
  await db.delete(stocks).where(eq(stocks.id, id));
}

export async function getLowStockItems(artisanId: number): Promise<Stock[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(stocks).where(
    and(
      eq(stocks.artisanId, artisanId),
      // Utiliser lte() au lieu de sql template literal pour éviter l'injection SQL
      lte(stocks.quantiteEnStock, stocks.seuilAlerte)
    )
  ).orderBy(stocks.designation);
}

export async function adjustStock(stockId: number, quantite: number, type: "entree" | "sortie" | "ajustement", motif?: string, reference?: string): Promise<MouvementStock> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const stock = await getStockById(stockId);
  if (!stock) throw new Error("Stock not found");
  
  const quantiteAvant = Number(stock.quantiteEnStock) || 0;
  let quantiteApres = quantiteAvant;
  
  if (type === "entree") {
    quantiteApres = quantiteAvant + quantite;
  } else if (type === "sortie") {
    quantiteApres = quantiteAvant - quantite;
    if (quantiteApres < 0) quantiteApres = 0;
  } else {
    quantiteApres = quantite;
  }
  
  // Create movement record
  const result = await db.insert(mouvementsStock).values({
    stockId,
    type,
    quantite: quantite.toFixed(2),
    quantiteAvant: quantiteAvant.toFixed(2),
    quantiteApres: quantiteApres.toFixed(2),
    motif,
    reference
  });
  
  // Update stock quantity
  await db.update(stocks).set({ quantiteEnStock: quantiteApres.toFixed(2) }).where(eq(stocks.id, stockId));
  
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(mouvementsStock).where(eq(mouvementsStock.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created movement");
  return created[0];
}

export async function getMouvementsStock(stockId: number): Promise<MouvementStock[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(mouvementsStock).where(eq(mouvementsStock.stockId, stockId)).orderBy(desc(mouvementsStock.createdAt));
}

// ============================================================================
// ADVANCED DASHBOARD STATISTICS
// ============================================================================

export async function getMonthlyCAStats(artisanId: number, months: number = 12) {
  const db = await getDb();
  if (!db) return [];
  
  const results = [];
  const now = new Date();
  
  for (let i = months - 1; i >= 0; i--) {
    const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    
    const ca = await db.select({ total: sql<number>`COALESCE(SUM(totalTTC), 0)` }).from(factures).where(
      and(
        eq(factures.artisanId, artisanId),
        eq(factures.statut, "payee"),
        gte(factures.datePaiement, startDate),
        lte(factures.datePaiement, endDate)
      )
    );
    
    results.push({
      month: startDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
      monthNum: startDate.getMonth() + 1,
      year: startDate.getFullYear(),
      ca: Number(ca[0]?.total) || 0
    });
  }
  
  return results;
}

export async function getYearlyComparison(artisanId: number) {
  const db = await getDb();
  if (!db) return { currentYear: 0, previousYear: 0, growth: 0 };
  
  const now = new Date();
  const currentYearStart = new Date(now.getFullYear(), 0, 1);
  const previousYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const previousYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
  
  const currentYearCA = await db.select({ total: sql<number>`COALESCE(SUM(totalTTC), 0)` }).from(factures).where(
    and(
      eq(factures.artisanId, artisanId),
      eq(factures.statut, "payee"),
      gte(factures.datePaiement, currentYearStart)
    )
  );
  
  const previousYearCA = await db.select({ total: sql<number>`COALESCE(SUM(totalTTC), 0)` }).from(factures).where(
    and(
      eq(factures.artisanId, artisanId),
      eq(factures.statut, "payee"),
      gte(factures.datePaiement, previousYearStart),
      lte(factures.datePaiement, previousYearEnd)
    )
  );
  
  const currentYear = Number(currentYearCA[0]?.total) || 0;
  const previousYear = Number(previousYearCA[0]?.total) || 0;
  const growth = previousYear > 0 ? ((currentYear - previousYear) / previousYear) * 100 : 0;
  
  return { currentYear, previousYear, growth };
}

export async function getConversionRate(artisanId: number) {
  const db = await getDb();
  if (!db) return { totalDevis: 0, devisAcceptes: 0, rate: 0 };
  
  const totalDevis = await db.select({ count: sql<number>`count(*)` }).from(devis).where(
    and(
      eq(devis.artisanId, artisanId),
      or(eq(devis.statut, "accepte"), eq(devis.statut, "refuse"), eq(devis.statut, "expire"))
    )
  );
  
  const devisAcceptes = await db.select({ count: sql<number>`count(*)` }).from(devis).where(
    and(
      eq(devis.artisanId, artisanId),
      eq(devis.statut, "accepte")
    )
  );
  
  const total = totalDevis[0]?.count || 0;
  const accepted = devisAcceptes[0]?.count || 0;
  const rate = total > 0 ? (accepted / total) * 100 : 0;
  
  return { totalDevis: total, devisAcceptes: accepted, rate };
}

export async function getTopClients(artisanId: number, limit: number = 5) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select({
    clientId: factures.clientId,
    totalCA: sql<number>`COALESCE(SUM(totalTTC), 0)`
  }).from(factures).where(
    and(
      eq(factures.artisanId, artisanId),
      eq(factures.statut, "payee")
    )
  ).groupBy(factures.clientId).orderBy(desc(sql`SUM(totalTTC)`)).limit(limit);
  
  const topClients = [];
  for (const row of result) {
    const client = await getClientById(row.clientId);
    if (client) {
      topClients.push({
        client,
        totalCA: Number(row.totalCA) || 0
      });
    }
  }
  
  return topClients;
}

export async function getClientEvolution(artisanId: number, months: number = 12) {
  const db = await getDb();
  if (!db) return [];
  
  const results = [];
  const now = new Date();
  
  for (let i = months - 1; i >= 0; i--) {
    const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    
    const count = await db.select({ count: sql<number>`count(*)` }).from(clients).where(
      and(
        eq(clients.artisanId, artisanId),
        lte(clients.createdAt, endDate)
      )
    );
    
    results.push({
      month: endDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
      count: count[0]?.count || 0
    });
  }
  
  return results;
}


// ============================================================================
// ADDITIONAL ARTISAN QUERY
// ============================================================================

export async function getArtisanById(id: number): Promise<Artisan | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(artisans).where(eq(artisans.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}


// ============================================================================
// FOURNISSEURS QUERIES
// ============================================================================

export async function getFournisseursByArtisan(artisanId: number): Promise<Fournisseur[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(fournisseurs).where(eq(fournisseurs.artisanId, artisanId)).orderBy(desc(fournisseurs.createdAt));
}

export async function getFournisseurById(id: number): Promise<Fournisseur | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(fournisseurs).where(eq(fournisseurs.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createFournisseur(data: InsertFournisseur): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(fournisseurs).values(data);
  return Number(result[0].insertId);
}

export async function updateFournisseur(id: number, data: Partial<InsertFournisseur>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(fournisseurs).set(data).where(eq(fournisseurs.id, id));
}

export async function deleteFournisseur(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(fournisseurs).where(eq(fournisseurs.id, id));
}

// ============================================================================
// ARTICLES FOURNISSEURS QUERIES
// ============================================================================

export async function getArticleFournisseurs(articleId: number): Promise<ArticleFournisseur[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(articlesFournisseurs).where(eq(articlesFournisseurs.articleId, articleId));
}

export async function getFournisseurArticles(fournisseurId: number): Promise<ArticleFournisseur[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(articlesFournisseurs).where(eq(articlesFournisseurs.fournisseurId, fournisseurId));
}

export async function createArticleFournisseur(data: InsertArticleFournisseur): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(articlesFournisseurs).values(data);
  return Number(result[0].insertId);
}

export async function updateArticleFournisseur(id: number, data: Partial<InsertArticleFournisseur>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(articlesFournisseurs).set(data).where(eq(articlesFournisseurs.id, id));
}

export async function deleteArticleFournisseur(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(articlesFournisseurs).where(eq(articlesFournisseurs.id, id));
}

// ============================================================================
// SMS VERIFICATION QUERIES
// ============================================================================

export async function createSmsVerification(data: InsertSmsVerification): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(smsVerifications).values(data);
  return Number(result[0].insertId);
}

export async function getSmsVerificationBySignature(signatureId: number): Promise<SmsVerification | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(smsVerifications)
    .where(eq(smsVerifications.signatureId, signatureId))
    .orderBy(desc(smsVerifications.createdAt))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function verifySmsCode(signatureId: number, code: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const verification = await db.select().from(smsVerifications)
    .where(and(
      eq(smsVerifications.signatureId, signatureId),
      eq(smsVerifications.code, code),
      eq(smsVerifications.verified, false)
    ))
    .limit(1);
  
  if (verification.length === 0) return false;
  
  const v = verification[0];
  if (new Date(v.expiresAt) < new Date()) return false;
  
  await db.update(smsVerifications)
    .set({ verified: true })
    .where(eq(smsVerifications.id, v.id));
  
  return true;
}

export async function markSmsVerified(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(smsVerifications).set({ verified: true }).where(eq(smsVerifications.id, id));
}


// ============================================================================
// RAPPORT COMMANDE FOURNISSEUR
// ============================================================================

export interface StockEnRupture {
  stock: Stock;
  fournisseur: Fournisseur | null;
  articleFournisseur: ArticleFournisseur | null;
  quantiteACommander: number;
}

export async function getStocksEnRupture(artisanId: number): Promise<StockEnRupture[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Récupérer les stocks en alerte ou en rupture
  const lowStocks = await db.select().from(stocks).where(
    and(
      eq(stocks.artisanId, artisanId),
      sql`CAST(${stocks.quantiteEnStock} AS DECIMAL(10,2)) <= CAST(${stocks.seuilAlerte} AS DECIMAL(10,2))`
    )
  ).orderBy(stocks.designation);
  
  const result: StockEnRupture[] = [];
  
  for (const stock of lowStocks) {
    let fournisseur: Fournisseur | null = null;
    let articleFournisseur: ArticleFournisseur | null = null;
    
    // Chercher le fournisseur associé si l'article a un articleId
    if (stock.articleId) {
      const associations = await db.select().from(articlesFournisseurs)
        .where(eq(articlesFournisseurs.articleId, stock.articleId))
        .limit(1);
      
      if (associations.length > 0) {
        articleFournisseur = associations[0];
        const fournisseurResult = await db.select().from(fournisseurs)
          .where(eq(fournisseurs.id, associations[0].fournisseurId))
          .limit(1);
        if (fournisseurResult.length > 0) {
          fournisseur = fournisseurResult[0];
        }
      }
    }
    
    // Calculer la quantité à commander (seuil * 2 - stock actuel)
    const seuilAlerte = Number(stock.seuilAlerte) || 0;
    const quantiteEnStock = Number(stock.quantiteEnStock) || 0;
    const quantiteACommander = Math.max(seuilAlerte * 2 - quantiteEnStock, seuilAlerte);
    
    result.push({
      stock,
      fournisseur,
      articleFournisseur,
      quantiteACommander
    });
  }
  
  return result;
}

export interface RapportCommandeFournisseur {
  fournisseur: Fournisseur | null;
  lignes: {
    stock: Stock;
    articleFournisseur: ArticleFournisseur | null;
    quantiteACommander: number;
    prixUnitaire: number;
    montantTotal: number;
  }[];
  totalCommande: number;
}

export async function getRapportCommandeFournisseur(artisanId: number): Promise<RapportCommandeFournisseur[]> {
  const stocksEnRupture = await getStocksEnRupture(artisanId);
  
  // Regrouper par fournisseur
  const parFournisseur = new Map<number | null, RapportCommandeFournisseur>();
  
  for (const item of stocksEnRupture) {
    const fournisseurId = item.fournisseur?.id || null;
    
    if (!parFournisseur.has(fournisseurId)) {
      parFournisseur.set(fournisseurId, {
        fournisseur: item.fournisseur,
        lignes: [],
        totalCommande: 0
      });
    }
    
    const commande = parFournisseur.get(fournisseurId)!;
    const prixUnitaire = item.articleFournisseur 
      ? Number(item.articleFournisseur.prixAchat) || 0
      : Number(item.stock.prixAchat) || 0;
    const montantTotal = prixUnitaire * item.quantiteACommander;
    
    commande.lignes.push({
      stock: item.stock,
      articleFournisseur: item.articleFournisseur,
      quantiteACommander: item.quantiteACommander,
      prixUnitaire,
      montantTotal
    });
    
    commande.totalCommande += montantTotal;
  }
  
  // Convertir en tableau et trier (fournisseurs connus en premier)
  const result = Array.from(parFournisseur.values());
  result.sort((a, b) => {
    if (a.fournisseur && !b.fournisseur) return -1;
    if (!a.fournisseur && b.fournisseur) return 1;
    if (a.fournisseur && b.fournisseur) {
      return a.fournisseur.nom.localeCompare(b.fournisseur.nom);
    }
    return 0;
  });
  
  return result;
}

// ============================================================================
// RELANCE DEVIS NON SIGNÉS
// ============================================================================

export interface DevisNonSigne {
  devis: Devis;
  client: Client | null;
  signature: SignatureDevis | null;
  joursDepuisCreation: number;
  joursDepuisEnvoi: number | null;
}

export async function getDevisNonSignes(artisanId: number, joursMinimum: number = 7): Promise<DevisNonSigne[]> {
  const db = await getDb();
  if (!db) return [];
  
  const dateLimit = new Date();
  dateLimit.setDate(dateLimit.getDate() - joursMinimum);
  // Convertir en Date pour la comparaison
  const dateLimitDate = new Date(dateLimit.getFullYear(), dateLimit.getMonth(), dateLimit.getDate());
  
  // Récupérer les devis envoyés mais non signés
  // Utiliser lte() au lieu de sql template literal pour éviter l'injection SQL
  const devisEnvoyesResult = await db.select().from(devis).where(
    and(
      eq(devis.artisanId, artisanId),
      eq(devis.statut, "envoye"),
      lte(devis.dateDevis, dateLimit)
    )
  ).orderBy(devis.dateDevis);
  
  const result: DevisNonSigne[] = [];
  
  for (const d of devisEnvoyesResult) {
    // Vérifier s'il y a une signature
    const signatureResult = await db.select().from(signaturesDevis)
      .where(eq(signaturesDevis.devisId, d.id))
      .limit(1);
    
    const signature = signatureResult.length > 0 ? signatureResult[0] : null;
    
    // Si le devis est déjà signé, on l'ignore
    if (signature?.signedAt) continue;
    
    // Récupérer le client
    const clientResult = await db.select().from(clients)
      .where(eq(clients.id, d.clientId))
      .limit(1);
    const client = clientResult.length > 0 ? clientResult[0] : null;
    
    // Calculer les jours
    const dateDevis = new Date(d.dateDevis);
    const joursDepuisCreation = Math.floor((Date.now() - dateDevis.getTime()) / (1000 * 60 * 60 * 24));
    
    let joursDepuisEnvoi: number | null = null;
    if (signature?.createdAt) {
      const dateEnvoi = new Date(signature.createdAt);
      joursDepuisEnvoi = Math.floor((Date.now() - dateEnvoi.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    result.push({
      devis: d,
      client,
      signature,
      joursDepuisCreation,
      joursDepuisEnvoi
    });
  }
  
  return result;
}

export interface HistoriqueRelance {
  id: number;
  devisId: number;
  dateRelance: Date;
  type: "email" | "notification";
  destinataire: string;
}

export async function getRelancesDevis(devisId: number): Promise<RelanceDevis[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(relancesDevis)
    .where(eq(relancesDevis.devisId, devisId))
    .orderBy(desc(relancesDevis.createdAt));
}

export async function createRelanceDevis(data: InsertRelanceDevis): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(relancesDevis).values(data);
  return Number(result[0].insertId);
}

export async function getLastRelanceDate(devisId: number): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(relancesDevis)
    .where(eq(relancesDevis.devisId, devisId))
    .orderBy(desc(relancesDevis.createdAt))
    .limit(1);
  return result.length > 0 ? result[0].createdAt : null;
}


// ============================================================================
// MODELES EMAIL
// ============================================================================

export async function getModelesEmailByArtisanId(artisanId: number): Promise<ModeleEmail[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(modelesEmail).where(eq(modelesEmail.artisanId, artisanId)).orderBy(modelesEmail.nom);
}

export async function getModelesEmailByType(artisanId: number, type: string): Promise<ModeleEmail[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(modelesEmail).where(
    and(
      eq(modelesEmail.artisanId, artisanId),
      eq(modelesEmail.type, type as any)
    )
  ).orderBy(modelesEmail.nom);
}

export async function getModeleEmailById(id: number): Promise<ModeleEmail | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(modelesEmail).where(eq(modelesEmail.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getDefaultModeleEmail(artisanId: number, type: string): Promise<ModeleEmail | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(modelesEmail).where(
    and(
      eq(modelesEmail.artisanId, artisanId),
      eq(modelesEmail.type, type as any),
      eq(modelesEmail.isDefault, true)
    )
  ).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createModeleEmail(data: InsertModeleEmail): Promise<ModeleEmail> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Si c'est le modèle par défaut, retirer le statut par défaut des autres
  if (data.isDefault) {
    await db.update(modelesEmail).set({ isDefault: false }).where(
      and(
        eq(modelesEmail.artisanId, data.artisanId),
        eq(modelesEmail.type, data.type)
      )
    );
  }
  
  const result = await db.insert(modelesEmail).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(modelesEmail).where(eq(modelesEmail.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created email template");
  return created[0];
}

export async function updateModeleEmail(id: number, data: Partial<InsertModeleEmail>): Promise<ModeleEmail> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getModeleEmailById(id);
  if (!existing) throw new Error("Email template not found");
  
  // Si on définit comme modèle par défaut, retirer le statut des autres
  if (data.isDefault) {
    await db.update(modelesEmail).set({ isDefault: false }).where(
      and(
        eq(modelesEmail.artisanId, existing.artisanId),
        eq(modelesEmail.type, existing.type)
      )
    );
  }
  
  await db.update(modelesEmail).set({ ...data, updatedAt: new Date() }).where(eq(modelesEmail.id, id));
  const updated = await db.select().from(modelesEmail).where(eq(modelesEmail.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Email template not found");
  return updated[0];
}

export async function deleteModeleEmail(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(modelesEmail).where(eq(modelesEmail.id, id));
}

// ============================================================================
// COMMANDES FOURNISSEURS
// ============================================================================

export async function getCommandesFournisseursByArtisanId(artisanId: number): Promise<CommandeFournisseur[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(commandesFournisseurs)
    .where(eq(commandesFournisseurs.artisanId, artisanId))
    .orderBy(desc(commandesFournisseurs.dateCommande));
}

export async function getCommandesFournisseursByFournisseurId(fournisseurId: number): Promise<CommandeFournisseur[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(commandesFournisseurs)
    .where(eq(commandesFournisseurs.fournisseurId, fournisseurId))
    .orderBy(desc(commandesFournisseurs.dateCommande));
}

export async function getCommandeFournisseurById(id: number): Promise<CommandeFournisseur | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(commandesFournisseurs).where(eq(commandesFournisseurs.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createCommandeFournisseur(data: InsertCommandeFournisseur): Promise<CommandeFournisseur> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(commandesFournisseurs).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(commandesFournisseurs).where(eq(commandesFournisseurs.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created supplier order");
  return created[0];
}

export async function updateCommandeFournisseur(id: number, data: Partial<InsertCommandeFournisseur>): Promise<CommandeFournisseur> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(commandesFournisseurs).set({ ...data, updatedAt: new Date() }).where(eq(commandesFournisseurs.id, id));
  const updated = await db.select().from(commandesFournisseurs).where(eq(commandesFournisseurs.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Supplier order not found");
  return updated[0];
}

export async function deleteCommandeFournisseur(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(lignesCommandesFournisseurs).where(eq(lignesCommandesFournisseurs.commandeId, id));
  await db.delete(commandesFournisseurs).where(eq(commandesFournisseurs.id, id));
}

export async function getLignesCommandeFournisseur(commandeId: number): Promise<LigneCommandeFournisseur[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(lignesCommandesFournisseurs).where(eq(lignesCommandesFournisseurs.commandeId, commandeId));
}

export async function createLigneCommandeFournisseur(data: InsertLigneCommandeFournisseur): Promise<LigneCommandeFournisseur> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(lignesCommandesFournisseurs).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(lignesCommandesFournisseurs).where(eq(lignesCommandesFournisseurs.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created order line");
  return created[0];
}

// Statistiques de performance fournisseur
export interface PerformanceFournisseur {
  fournisseur: Fournisseur;
  totalCommandes: number;
  commandesLivrees: number;
  commandesEnRetard: number;
  delaiMoyenLivraison: number | null;
  tauxFiabilite: number;
  montantTotal: number;
}

export async function getPerformancesFournisseurs(artisanId: number): Promise<PerformanceFournisseur[]> {
  const db = await getDb();
  if (!db) return [];
  
  const fournisseursList = await db.select().from(fournisseurs).where(eq(fournisseurs.artisanId, artisanId));
  const result: PerformanceFournisseur[] = [];
  
  for (const fournisseur of fournisseursList) {
    const commandes = await db.select().from(commandesFournisseurs)
      .where(eq(commandesFournisseurs.fournisseurId, fournisseur.id));
    
    const totalCommandes = commandes.length;
    const commandesLivrees = commandes.filter(c => c.statut === 'livree').length;
    
    // Calculer les commandes en retard (livrées après la date prévue)
    let commandesEnRetard = 0;
    let totalDelai = 0;
    let commandesAvecDelai = 0;
    
    for (const commande of commandes) {
      if (commande.dateLivraisonReelle && commande.dateLivraisonPrevue) {
        const delai = Math.floor((commande.dateLivraisonReelle.getTime() - commande.dateCommande.getTime()) / (1000 * 60 * 60 * 24));
        totalDelai += delai;
        commandesAvecDelai++;
        
        if (commande.dateLivraisonReelle > commande.dateLivraisonPrevue) {
          commandesEnRetard++;
        }
      }
    }
    
    const delaiMoyenLivraison = commandesAvecDelai > 0 ? Math.round(totalDelai / commandesAvecDelai) : null;
    const tauxFiabilite = totalCommandes > 0 ? Math.round(((commandesLivrees - commandesEnRetard) / totalCommandes) * 100) : 100;
    const montantTotal = commandes.reduce((sum, c) => sum + (Number(c.montantTotal) || 0), 0);
    
    result.push({
      fournisseur,
      totalCommandes,
      commandesLivrees,
      commandesEnRetard,
      delaiMoyenLivraison,
      tauxFiabilite: Math.max(0, tauxFiabilite),
      montantTotal
    });
  }
  
  return result.sort((a, b) => b.totalCommandes - a.totalCommandes);
}

// ============================================================================
// PAIEMENTS STRIPE
// ============================================================================

export async function getPaiementsByFactureId(factureId: number): Promise<PaiementStripe[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(paiementsStripe)
    .where(eq(paiementsStripe.factureId, factureId))
    .orderBy(desc(paiementsStripe.createdAt));
}

export async function getPaiementByToken(token: string): Promise<PaiementStripe | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(paiementsStripe).where(eq(paiementsStripe.tokenPaiement, token)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPaiementBySessionId(sessionId: string): Promise<PaiementStripe | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(paiementsStripe).where(eq(paiementsStripe.stripeSessionId, sessionId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createPaiementStripe(data: InsertPaiementStripe): Promise<PaiementStripe> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(paiementsStripe).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(paiementsStripe).where(eq(paiementsStripe.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to retrieve created payment");
  return created[0];
}

export async function updatePaiementStripe(id: number, data: Partial<InsertPaiementStripe>): Promise<PaiementStripe> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(paiementsStripe).set({ ...data, updatedAt: new Date() }).where(eq(paiementsStripe.id, id));
  const updated = await db.select().from(paiementsStripe).where(eq(paiementsStripe.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Payment not found");
  return updated[0];
}

export async function markPaiementComplete(id: number, paymentIntentId: string): Promise<PaiementStripe> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(paiementsStripe).set({ 
    statut: 'complete', 
    stripePaymentIntentId: paymentIntentId,
    paidAt: new Date(),
    updatedAt: new Date() 
  }).where(eq(paiementsStripe.id, id));
  const updated = await db.select().from(paiementsStripe).where(eq(paiementsStripe.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Payment not found");
  return updated[0];
}


// ============================================================================
// CLIENT PORTAL ACCESS QUERIES
// ============================================================================

export async function createClientPortalAccess(data: InsertClientPortalAccess): Promise<ClientPortalAccess> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clientPortalAccess).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(clientPortalAccess).where(eq(clientPortalAccess.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create portal access");
  return created[0];
}

export async function getClientPortalAccessByToken(token: string): Promise<ClientPortalAccess | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clientPortalAccess)
    .where(and(
      eq(clientPortalAccess.token, token),
      eq(clientPortalAccess.isActive, true),
      gte(clientPortalAccess.expiresAt, new Date())
    ))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateClientPortalAccessLastAccess(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(clientPortalAccess).set({ lastAccessAt: new Date() }).where(eq(clientPortalAccess.id, id));
}

export async function deactivateClientPortalAccess(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(clientPortalAccess).set({ isActive: false }).where(eq(clientPortalAccess.id, id));
}

// ============================================================================
// CLIENT PORTAL SESSION QUERIES
// ============================================================================

export async function createClientPortalSession(data: InsertClientPortalSession): Promise<ClientPortalSession> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clientPortalSessions).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(clientPortalSessions).where(eq(clientPortalSessions.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create session");
  return created[0];
}

export async function getClientPortalSessionByToken(token: string): Promise<ClientPortalSession | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clientPortalSessions)
    .where(and(
      eq(clientPortalSessions.sessionToken, token),
      gte(clientPortalSessions.expiresAt, new Date())
    ))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function deleteClientPortalSession(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(clientPortalSessions).where(eq(clientPortalSessions.sessionToken, token));
}

// ============================================================================
// CONTRATS MAINTENANCE QUERIES
// ============================================================================

export async function getContratsByArtisanId(artisanId: number): Promise<ContratMaintenance[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(contratsMaintenance)
    .where(eq(contratsMaintenance.artisanId, artisanId))
    .orderBy(desc(contratsMaintenance.createdAt));
}

export async function getContratById(id: number): Promise<ContratMaintenance | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contratsMaintenance).where(eq(contratsMaintenance.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getContratsByClientId(clientId: number): Promise<ContratMaintenance[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(contratsMaintenance)
    .where(eq(contratsMaintenance.clientId, clientId))
    .orderBy(desc(contratsMaintenance.createdAt));
}

export async function getContratsAFacturer(): Promise<ContratMaintenance[]> {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return await db.select().from(contratsMaintenance)
    .where(and(
      eq(contratsMaintenance.statut, 'actif'),
      lte(contratsMaintenance.prochainFacturation, now)
    ));
}

export async function createContrat(data: InsertContratMaintenance): Promise<ContratMaintenance> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contratsMaintenance).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(contratsMaintenance).where(eq(contratsMaintenance.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create contract");
  return created[0];
}

export async function updateContrat(id: number, data: Partial<InsertContratMaintenance>): Promise<ContratMaintenance> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contratsMaintenance).set({ ...data, updatedAt: new Date() }).where(eq(contratsMaintenance.id, id));
  const updated = await db.select().from(contratsMaintenance).where(eq(contratsMaintenance.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Contract not found");
  return updated[0];
}

export async function deleteContrat(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(contratsMaintenance).where(eq(contratsMaintenance.id, id));
}

export async function getNextContratNumber(artisanId: number): Promise<string> {
  const db = await getDb();
  if (!db) return `CONT-${Date.now()}`;
  const year = new Date().getFullYear();
  const result = await db.select().from(contratsMaintenance)
    .where(eq(contratsMaintenance.artisanId, artisanId))
    .orderBy(desc(contratsMaintenance.id))
    .limit(1);
  const lastNum = result.length > 0 ? parseInt(result[0].reference.split('-')[2] || '0') : 0;
  return `CONT-${year}-${String(lastNum + 1).padStart(4, '0')}`;
}

// ============================================================================
// FACTURES RECURRENTES QUERIES
// ============================================================================

export async function createFactureRecurrente(data: InsertFactureRecurrente): Promise<FactureRecurrente> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(facturesRecurrentes).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(facturesRecurrentes).where(eq(facturesRecurrentes.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create recurring invoice");
  return created[0];
}

export async function getFacturesRecurrentesByContratId(contratId: number): Promise<FactureRecurrente[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(facturesRecurrentes)
    .where(eq(facturesRecurrentes.contratId, contratId))
    .orderBy(desc(facturesRecurrentes.createdAt));
}

// ============================================================================
// INTERVENTIONS MOBILE QUERIES
// ============================================================================

export async function getInterventionMobileByInterventionId(interventionId: number): Promise<InterventionMobile | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(interventionsMobile)
    .where(eq(interventionsMobile.interventionId, interventionId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createInterventionMobile(data: InsertInterventionMobile): Promise<InterventionMobile> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(interventionsMobile).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(interventionsMobile).where(eq(interventionsMobile.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create mobile intervention");
  return created[0];
}

export async function updateInterventionMobile(id: number, data: Partial<InsertInterventionMobile>): Promise<InterventionMobile> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(interventionsMobile).set({ ...data, updatedAt: new Date() }).where(eq(interventionsMobile.id, id));
  const updated = await db.select().from(interventionsMobile).where(eq(interventionsMobile.id, id)).limit(1);
  if (updated.length === 0) throw new Error("Mobile intervention not found");
  return updated[0];
}

export async function getInterventionsMobilesPending(artisanId: number): Promise<InterventionMobile[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(interventionsMobile)
    .where(and(
      eq(interventionsMobile.artisanId, artisanId),
      eq(interventionsMobile.syncStatus, 'pending')
    ));
}

// ============================================================================
// PHOTOS INTERVENTIONS QUERIES
// ============================================================================

export async function getPhotosByInterventionMobileId(interventionMobileId: number): Promise<PhotoIntervention[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(photosInterventions)
    .where(eq(photosInterventions.interventionMobileId, interventionMobileId))
    .orderBy(photosInterventions.takenAt);
}

export async function createPhotoIntervention(data: InsertPhotoIntervention): Promise<PhotoIntervention> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(photosInterventions).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(photosInterventions).where(eq(photosInterventions.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create photo");
  return created[0];
}

export async function deletePhotoIntervention(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(photosInterventions).where(eq(photosInterventions.id, id));
}

// ============================================================================
// CLIENT PORTAL DATA QUERIES
// ============================================================================

export async function getDevisByClientId(clientId: number): Promise<Devis[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(devis)
    .where(eq(devis.clientId, clientId))
    .orderBy(desc(devis.createdAt));
}

export async function getFacturesByClientId(clientId: number): Promise<Facture[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(factures)
    .where(eq(factures.clientId, clientId))
    .orderBy(desc(factures.createdAt));
}

export async function getInterventionsByClientId(clientId: number): Promise<Intervention[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(interventions)
    .where(eq(interventions.clientId, clientId))
    .orderBy(desc(interventions.dateDebut));
}


// ============================================================================
// CONVERSATIONS (Chat)
// ============================================================================

export async function getConversationsByArtisanId(artisanId: number): Promise<Conversation[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(conversations)
    .where(eq(conversations.artisanId, artisanId))
    .orderBy(desc(conversations.dernierMessageAt));
}

export async function getConversationsByClientId(clientId: number): Promise<Conversation[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(conversations)
    .where(eq(conversations.clientId, clientId))
    .orderBy(desc(conversations.dernierMessageAt));
}

export async function getConversationById(id: number): Promise<Conversation | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return result[0] || null;
}

export async function getOrCreateConversation(artisanId: number, clientId: number, sujet?: string): Promise<Conversation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Chercher une conversation existante
  const existing = await db.select().from(conversations)
    .where(and(
      eq(conversations.artisanId, artisanId),
      eq(conversations.clientId, clientId),
      eq(conversations.statut, "active")
    ))
    .limit(1);
  
  if (existing.length > 0) return existing[0];
  
  // Créer une nouvelle conversation
  const result = await db.insert(conversations).values({
    artisanId,
    clientId,
    sujet: sujet || "Nouvelle conversation",
    dernierMessageAt: new Date(),
  });
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(conversations).where(eq(conversations.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create conversation");
  return created[0];
}

export async function updateConversation(id: number, data: Partial<InsertConversation>): Promise<Conversation | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(conversations).set({ ...data, updatedAt: new Date() }).where(eq(conversations.id, id));
  return await getConversationById(id);
}

// ============================================================================
// MESSAGES
// ============================================================================

export async function getMessagesByConversationId(conversationId: number): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

export async function createMessage(data: InsertMessage): Promise<Message> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(messages).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(messages).where(eq(messages.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create message");
  
  // Mettre à jour la date du dernier message dans la conversation
  await db.update(conversations)
    .set({ dernierMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(conversations.id, data.conversationId));
  
  return created[0];
}

export async function markMessagesAsRead(conversationId: number, expediteur: "artisan" | "client"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Marquer comme lus les messages de l'autre partie
  const otherParty = expediteur === "artisan" ? "client" : "artisan";
  await db.update(messages)
    .set({ lu: true, luAt: new Date() })
    .where(and(
      eq(messages.conversationId, conversationId),
      eq(messages.expediteur, otherParty),
      eq(messages.lu, false)
    ));
}

export async function getUnreadMessagesCount(artisanId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(and(
      eq(conversations.artisanId, artisanId),
      eq(messages.expediteur, "client"),
      eq(messages.lu, false)
    ));
  
  return result[0]?.count || 0;
}

// ============================================================================
// TECHNICIENS (Team members)
// ============================================================================

export async function getTechniciensByArtisanId(artisanId: number): Promise<Technicien[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(techniciens)
    .where(eq(techniciens.artisanId, artisanId))
    .orderBy(techniciens.nom);
}

export async function getTechnicienById(id: number): Promise<Technicien | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(techniciens).where(eq(techniciens.id, id)).limit(1);
  return result[0] || null;
}

export async function createTechnicien(data: InsertTechnicien): Promise<Technicien> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(techniciens).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(techniciens).where(eq(techniciens.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create technicien");
  return created[0];
}

export async function updateTechnicien(id: number, data: Partial<InsertTechnicien>): Promise<Technicien | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(techniciens).set({ ...data, updatedAt: new Date() }).where(eq(techniciens.id, id));
  return await getTechnicienById(id);
}

export async function deleteTechnicien(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(techniciens).where(eq(techniciens.id, id));
}

export async function getTechniciensDisponibles(artisanId: number, date: Date): Promise<Technicien[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Récupérer tous les techniciens actifs
  const allTechniciens = await db.select().from(techniciens)
    .where(and(
      eq(techniciens.artisanId, artisanId),
      eq(techniciens.statut, "actif")
    ));
  
  return allTechniciens;
}

// ============================================================================
// DISPONIBILITES TECHNICIENS
// ============================================================================

export async function getDisponibilitesByTechnicienId(technicienId: number): Promise<DisponibiliteTechnicien[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(disponibilitesTechniciens)
    .where(eq(disponibilitesTechniciens.technicienId, technicienId))
    .orderBy(disponibilitesTechniciens.jourSemaine);
}

export async function setDisponibilite(data: InsertDisponibiliteTechnicien): Promise<DisponibiliteTechnicien> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Supprimer l'ancienne disponibilité pour ce jour
  await db.delete(disponibilitesTechniciens)
    .where(and(
      eq(disponibilitesTechniciens.technicienId, data.technicienId),
      eq(disponibilitesTechniciens.jourSemaine, data.jourSemaine)
    ));
  
  const result = await db.insert(disponibilitesTechniciens).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(disponibilitesTechniciens).where(eq(disponibilitesTechniciens.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to set disponibilite");
  return created[0];
}

// ============================================================================
// AVIS CLIENTS
// ============================================================================

export async function getAvisByArtisanId(artisanId: number): Promise<AvisClient[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(avisClients)
    .where(eq(avisClients.artisanId, artisanId))
    .orderBy(desc(avisClients.createdAt));
}

export async function getAvisByClientId(clientId: number): Promise<AvisClient[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(avisClients)
    .where(eq(avisClients.clientId, clientId))
    .orderBy(desc(avisClients.createdAt));
}

export async function getAvisById(id: number): Promise<AvisClient | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(avisClients).where(eq(avisClients.id, id)).limit(1);
  return result[0] || null;
}

export async function getAvisByToken(token: string): Promise<AvisClient | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(avisClients).where(eq(avisClients.tokenAvis, token)).limit(1);
  return result[0] || null;
}

export async function createAvis(data: InsertAvisClient): Promise<AvisClient> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(avisClients).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(avisClients).where(eq(avisClients.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create avis");
  return created[0];
}

export async function updateAvis(id: number, data: Partial<InsertAvisClient>): Promise<AvisClient | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(avisClients).set({ ...data, updatedAt: new Date() }).where(eq(avisClients.id, id));
  return await getAvisById(id);
}

export async function getAvisStats(artisanId: number): Promise<{ moyenne: number; total: number; distribution: Record<number, number> }> {
  const db = await getDb();
  if (!db) return { moyenne: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  
  const allAvis = await db.select().from(avisClients)
    .where(and(
      eq(avisClients.artisanId, artisanId),
      eq(avisClients.statut, "publie")
    ));
  
  const total = allAvis.length;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let somme = 0;
  
  for (const avis of allAvis) {
    somme += avis.note;
    distribution[avis.note] = (distribution[avis.note] || 0) + 1;
  }
  
  const moyenne = total > 0 ? somme / total : 0;
  
  return { moyenne, total, distribution };
}

// ============================================================================
// DEMANDES AVIS
// ============================================================================

export async function getDemandeAvisByToken(token: string): Promise<DemandeAvis | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(demandesAvis).where(eq(demandesAvis.tokenDemande, token)).limit(1);
  return result[0] || null;
}

export async function createDemandeAvis(data: InsertDemandeAvis): Promise<DemandeAvis> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(demandesAvis).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(demandesAvis).where(eq(demandesAvis.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create demande avis");
  return created[0];
}

export async function updateDemandeAvis(id: number, data: Partial<InsertDemandeAvis>): Promise<DemandeAvis | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(demandesAvis).set(data).where(eq(demandesAvis.id, id));
  const result = await db.select().from(demandesAvis).where(eq(demandesAvis.id, id)).limit(1);
  return result[0] || null;
}

export async function getDemandesAvisByArtisanId(artisanId: number): Promise<DemandeAvis[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(demandesAvis)
    .where(eq(demandesAvis.artisanId, artisanId))
    .orderBy(desc(demandesAvis.createdAt));
}


// ============================================================================
// POSITIONS GPS TECHNICIENS
// ============================================================================
export async function updatePositionTechnicien(data: InsertPositionTechnicien): Promise<PositionTechnicien> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(positionsTechniciens).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(positionsTechniciens).where(eq(positionsTechniciens.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create position");
  return created[0];
}

export async function getLastPositionByTechnicienId(technicienId: number): Promise<PositionTechnicien | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(positionsTechniciens)
    .where(eq(positionsTechniciens.technicienId, technicienId))
    .orderBy(desc(positionsTechniciens.timestamp))
    .limit(1);
  return result[0] || null;
}

export async function getAllTechniciensPositions(artisanId: number): Promise<(PositionTechnicien & { technicien: Technicien })[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Récupérer tous les techniciens de l'artisan
  const techs = await db.select().from(techniciens).where(eq(techniciens.artisanId, artisanId));
  
  const result: (PositionTechnicien & { technicien: Technicien })[] = [];
  for (const tech of techs) {
    const lastPos = await getLastPositionByTechnicienId(tech.id);
    if (lastPos) {
      result.push({ ...lastPos, technicien: tech });
    }
  }
  
  return result;
}

export async function getPositionsHistorique(technicienId: number, dateDebut: Date, dateFin: Date): Promise<PositionTechnicien[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(positionsTechniciens)
    .where(and(
      eq(positionsTechniciens.technicienId, technicienId),
      gte(positionsTechniciens.timestamp, dateDebut),
      lte(positionsTechniciens.timestamp, dateFin)
    ))
    .orderBy(asc(positionsTechniciens.timestamp));
}

// ============================================================================
// HISTORIQUE DEPLACEMENTS
// ============================================================================
export async function createHistoriqueDeplacement(data: InsertHistoriqueDeplacement): Promise<HistoriqueDeplacement> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(historiqueDeplacements).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(historiqueDeplacements).where(eq(historiqueDeplacements.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create historique deplacement");
  return created[0];
}

export async function getHistoriqueDeplacementsByTechnicienId(technicienId: number): Promise<HistoriqueDeplacement[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(historiqueDeplacements)
    .where(eq(historiqueDeplacements.technicienId, technicienId))
    .orderBy(desc(historiqueDeplacements.dateDebut));
}

export async function getStatistiquesDeplacements(artisanId: number, dateDebut: Date, dateFin: Date) {
  const db = await getDb();
  if (!db) return { totalKm: 0, totalMinutes: 0, nombreDeplacements: 0 };
  
  const techs = await db.select().from(techniciens).where(eq(techniciens.artisanId, artisanId));
  const techIds = techs.map(t => t.id);
  
  if (techIds.length === 0) return { totalKm: 0, totalMinutes: 0, nombreDeplacements: 0 };
  
  const deplacements = await db.select().from(historiqueDeplacements)
    .where(and(
      inArray(historiqueDeplacements.technicienId, techIds),
      gte(historiqueDeplacements.dateDebut, dateDebut),
      lte(historiqueDeplacements.dateDebut, dateFin)
    ));
  
  const totalKm = deplacements.reduce((sum, d) => sum + (parseFloat(d.distanceKm?.toString() || '0')), 0);
  const totalMinutes = deplacements.reduce((sum, d) => sum + (d.dureeMinutes || 0), 0);
  
  return {
    totalKm: Math.round(totalKm * 100) / 100,
    totalMinutes,
    nombreDeplacements: deplacements.length
  };
}

// ============================================================================
// ECRITURES COMPTABLES
// ============================================================================
export async function createEcritureComptable(data: InsertEcritureComptable): Promise<EcritureComptable> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ecrituresComptables).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(ecrituresComptables).where(eq(ecrituresComptables.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create ecriture comptable");
  return created[0];
}

export async function getEcrituresComptables(artisanId: number, dateDebut?: Date, dateFin?: Date): Promise<EcritureComptable[]> {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(ecrituresComptables)
    .where(eq(ecrituresComptables.artisanId, artisanId));
  
  if (dateDebut && dateFin) {
    query = db.select().from(ecrituresComptables)
      .where(and(
        eq(ecrituresComptables.artisanId, artisanId),
        gte(ecrituresComptables.dateEcriture, dateDebut),
        lte(ecrituresComptables.dateEcriture, dateFin)
      ));
  }
  
  return await query.orderBy(asc(ecrituresComptables.dateEcriture));
}

export async function getGrandLivre(artisanId: number, dateDebut: Date, dateFin: Date): Promise<{
  compte: string;
  libelle: string;
  ecritures: EcritureComptable[];
  soldeDebit: number;
  soldeCredit: number;
}[]> {
  const db = await getDb();
  if (!db) return [];
  
  const ecritures = await getEcrituresComptables(artisanId, dateDebut, dateFin);
  
  // Grouper par compte
  const parCompte = new Map<string, EcritureComptable[]>();
  for (const e of ecritures) {
    const key = e.numeroCompte;
    if (!parCompte.has(key)) {
      parCompte.set(key, []);
    }
    parCompte.get(key)!.push(e);
  }
  
  const result = [];
  for (const [compte, ecrs] of Array.from(parCompte)) {
    const soldeDebit = ecrs.reduce((sum: number, e: EcritureComptable) => sum + parseFloat(e.debit?.toString() || '0'), 0);
    const soldeCredit = ecrs.reduce((sum: number, e: EcritureComptable) => sum + parseFloat(e.credit?.toString() || '0'), 0);
    result.push({
      compte,
      libelle: ecrs[0]?.libelleCompte || '',
      ecritures: ecrs,
      soldeDebit: Math.round(soldeDebit * 100) / 100,
      soldeCredit: Math.round(soldeCredit * 100) / 100
    });
  }
  
  return result.sort((a, b) => a.compte.localeCompare(b.compte));
}

export async function getBalance(artisanId: number, dateDebut: Date, dateFin: Date): Promise<{
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
  solde: number;
}[]> {
  const grandLivre = await getGrandLivre(artisanId, dateDebut, dateFin);
  
  return grandLivre.map(gl => ({
    compte: gl.compte,
    libelle: gl.libelle,
    debit: gl.soldeDebit,
    credit: gl.soldeCredit,
    solde: Math.round((gl.soldeDebit - gl.soldeCredit) * 100) / 100
  }));
}

export async function getJournalVentes(artisanId: number, dateDebut: Date, dateFin: Date): Promise<EcritureComptable[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(ecrituresComptables)
    .where(and(
      eq(ecrituresComptables.artisanId, artisanId),
      eq(ecrituresComptables.journal, 'VE'),
      gte(ecrituresComptables.dateEcriture, dateDebut),
      lte(ecrituresComptables.dateEcriture, dateFin)
    ))
    .orderBy(asc(ecrituresComptables.dateEcriture));
}

export async function getRapportTVA(artisanId: number, dateDebut: Date, dateFin: Date): Promise<{
  tvaCollectee: number;
  tvaDeductible: number;
  tvaNette: number;
}> {
  const db = await getDb();
  if (!db) return { tvaCollectee: 0, tvaDeductible: 0, tvaNette: 0 };
  
  const ecritures = await getEcrituresComptables(artisanId, dateDebut, dateFin);
  
  // Comptes TVA collectée (445710, 445711, etc.)
  const tvaCollectee = ecritures
    .filter(e => e.numeroCompte.startsWith('44571'))
    .reduce((sum, e) => sum + parseFloat(e.credit?.toString() || '0'), 0);
  
  // Comptes TVA déductible (445660, 445661, etc.)
  const tvaDeductible = ecritures
    .filter(e => e.numeroCompte.startsWith('44566'))
    .reduce((sum, e) => sum + parseFloat(e.debit?.toString() || '0'), 0);
  
  return {
    tvaCollectee: Math.round(tvaCollectee * 100) / 100,
    tvaDeductible: Math.round(tvaDeductible * 100) / 100,
    tvaNette: Math.round((tvaCollectee - tvaDeductible) * 100) / 100
  };
}

// Générer les écritures comptables pour une facture
export async function genererEcrituresFacture(factureId: number): Promise<EcritureComptable[]> {
  const db = await getDb();
  if (!db) return [];
  
  const facture = await getFactureById(factureId);
  if (!facture) return [];
  
  const artisan = await getArtisanById(facture.artisanId);
  if (!artisan) return [];
  
  const client = await getClientById(facture.clientId);
  const dateEcriture = facture.dateFacture;
  const pieceRef = facture.numero;
  const libelle = `Facture ${facture.numero} - ${client?.nom || 'Client'}`;
  
  const ecritures: InsertEcritureComptable[] = [
    // Débit compte client (411)
    {
      artisanId: facture.artisanId,
      dateEcriture,
      journal: 'VE',
      numeroCompte: '411000',
      libelleCompte: 'Clients',
      libelle,
      pieceRef,
      debit: facture.totalTTC?.toString() || '0',
      credit: '0',
      factureId
    },
    // Crédit compte produits (706)
    {
      artisanId: facture.artisanId,
      dateEcriture,
      journal: 'VE',
      numeroCompte: '706000',
      libelleCompte: 'Prestations de services',
      libelle,
      pieceRef,
      debit: '0',
      credit: facture.totalHT?.toString() || '0',
      factureId
    },
    // Crédit TVA collectée (44571)
    {
      artisanId: facture.artisanId,
      dateEcriture,
      journal: 'VE',
      numeroCompte: '445710',
      libelleCompte: 'TVA collectée',
      libelle,
      pieceRef,
      debit: '0',
      credit: facture.totalTVA?.toString() || '0',
      factureId
    }
  ];
  
  const created: EcritureComptable[] = [];
  for (const e of ecritures) {
    const result = await createEcritureComptable(e);
    created.push(result);
  }
  
  return created;
}

// ============================================================================
// PLAN COMPTABLE
// ============================================================================
export async function initPlanComptable(artisanId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  const comptesBase: InsertCompteComptable[] = [
    { artisanId, numeroCompte: '411000', libelle: 'Clients', classe: 4, type: 'actif' },
    { artisanId, numeroCompte: '401000', libelle: 'Fournisseurs', classe: 4, type: 'passif' },
    { artisanId, numeroCompte: '512000', libelle: 'Banque', classe: 5, type: 'actif' },
    { artisanId, numeroCompte: '530000', libelle: 'Caisse', classe: 5, type: 'actif' },
    { artisanId, numeroCompte: '706000', libelle: 'Prestations de services', classe: 7, type: 'produit' },
    { artisanId, numeroCompte: '707000', libelle: 'Ventes de marchandises', classe: 7, type: 'produit' },
    { artisanId, numeroCompte: '601000', libelle: 'Achats de matières premières', classe: 6, type: 'charge' },
    { artisanId, numeroCompte: '606000', libelle: 'Achats non stockés', classe: 6, type: 'charge' },
    { artisanId, numeroCompte: '445710', libelle: 'TVA collectée', classe: 4, type: 'passif' },
    { artisanId, numeroCompte: '445660', libelle: 'TVA déductible', classe: 4, type: 'actif' },
  ];
  
  for (const compte of comptesBase) {
    await db.insert(planComptable).values(compte);
  }
}

export async function getPlanComptable(artisanId: number): Promise<CompteComptable[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(planComptable)
    .where(eq(planComptable.artisanId, artisanId))
    .orderBy(asc(planComptable.numeroCompte));
}

// ============================================================================
// DEVIS OPTIONS
// ============================================================================
export async function createDevisOption(data: InsertDevisOption): Promise<DevisOption> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(devisOptions).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(devisOptions).where(eq(devisOptions.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create devis option");
  return created[0];
}

export async function getDevisOptionsByDevisId(devisId: number): Promise<DevisOption[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(devisOptions)
    .where(eq(devisOptions.devisId, devisId))
    .orderBy(asc(devisOptions.ordre));
}

export async function getDevisOptionById(id: number): Promise<DevisOption | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(devisOptions).where(eq(devisOptions.id, id)).limit(1);
  return result[0] || null;
}

export async function updateDevisOption(id: number, data: Partial<InsertDevisOption>): Promise<DevisOption | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(devisOptions).set(data).where(eq(devisOptions.id, id));
  const result = await db.select().from(devisOptions).where(eq(devisOptions.id, id)).limit(1);
  return result[0] || null;
}

export async function deleteDevisOption(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Supprimer d'abord les lignes
  await db.delete(devisOptionsLignes).where(eq(devisOptionsLignes.optionId, id));
  // Puis l'option
  await db.delete(devisOptions).where(eq(devisOptions.id, id));
}

export async function selectDevisOption(optionId: number): Promise<DevisOption | null> {
  const db = await getDb();
  if (!db) return null;
  
  const option = await getDevisOptionById(optionId);
  if (!option) return null;
  
  // Désélectionner toutes les autres options du même devis
  await db.update(devisOptions)
    .set({ selectionnee: false, dateSelection: null })
    .where(eq(devisOptions.devisId, option.devisId));
  
  // Sélectionner cette option
  await db.update(devisOptions)
    .set({ selectionnee: true, dateSelection: new Date() })
    .where(eq(devisOptions.id, optionId));
  
  return await getDevisOptionById(optionId);
}

// ============================================================================
// DEVIS OPTIONS LIGNES
// ============================================================================
export async function createDevisOptionLigne(data: InsertDevisOptionLigne): Promise<DevisOptionLigne> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(devisOptionsLignes).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(devisOptionsLignes).where(eq(devisOptionsLignes.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create devis option ligne");
  return created[0];
}

export async function getDevisOptionLignesByOptionId(optionId: number): Promise<DevisOptionLigne[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(devisOptionsLignes)
    .where(eq(devisOptionsLignes.optionId, optionId))
    .orderBy(asc(devisOptionsLignes.ordre));
}

export async function updateDevisOptionLigne(id: number, data: Partial<InsertDevisOptionLigne>): Promise<DevisOptionLigne | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(devisOptionsLignes).set(data).where(eq(devisOptionsLignes.id, id));
  const result = await db.select().from(devisOptionsLignes).where(eq(devisOptionsLignes.id, id)).limit(1);
  return result[0] || null;
}

export async function deleteDevisOptionLigne(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(devisOptionsLignes).where(eq(devisOptionsLignes.id, id));
}

export async function recalculerTotauxOption(optionId: number): Promise<DevisOption | null> {
  const db = await getDb();
  if (!db) return null;
  
  const lignes = await getDevisOptionLignesByOptionId(optionId);
  
  let totalHT = 0;
  let totalTVA = 0;
  
  for (const ligne of lignes) {
    totalHT += parseFloat(ligne.montantHT?.toString() || '0');
    totalTVA += parseFloat(ligne.montantTVA?.toString() || '0');
  }
  
  const totalTTC = totalHT + totalTVA;
  
  return await updateDevisOption(optionId, {
    totalHT: totalHT.toFixed(2),
    totalTVA: totalTVA.toFixed(2),
    totalTTC: totalTTC.toFixed(2)
  });
}

// Convertir l'option sélectionnée en lignes de devis standard
export async function convertirOptionEnDevis(optionId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  const option = await getDevisOptionById(optionId);
  if (!option) return;
  
  const lignesOption = await getDevisOptionLignesByOptionId(optionId);
  
  // Supprimer les lignes existantes du devis
  await db.delete(devisLignes).where(eq(devisLignes.devisId, option.devisId));
  
  // Créer les nouvelles lignes à partir de l'option
  for (const ligne of lignesOption) {
    await db.insert(devisLignes).values({
      devisId: option.devisId,
      designation: ligne.designation,
      description: ligne.description || undefined,
      quantite: ligne.quantite || '1',
      unite: ligne.unite || 'unité',
      prixUnitaireHT: ligne.prixUnitaireHT || '0',
      tauxTVA: ligne.tauxTVA || '20',
      montantHT: ligne.montantHT || '0',
      montantTVA: ligne.montantTVA || '0',
      montantTTC: ligne.montantTTC || '0',
      ordre: ligne.ordre || 1
    });
  }
  
  // Mettre à jour les totaux du devis
  await db.update(devis).set({
    totalHT: option.totalHT,
    totalTVA: option.totalTVA,
    totalTTC: option.totalTTC
  }).where(eq(devis.id, option.devisId));
}


// ============================================================================
// PLANIFICATION INTELLIGENTE
// ============================================================================

// Calcul de la distance entre deux points GPS (formule de Haversine)
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Estimer le temps de trajet en minutes (vitesse moyenne 40 km/h en ville)
export function estimateTrajetTime(distanceKm: number): number {
  const vitesseMoyenne = 40; // km/h
  return Math.round((distanceKm / vitesseMoyenne) * 60);
}

export interface TechnicienSuggestion {
  technicien: Technicien;
  distance: number;
  tempsTrajet: number;
  disponible: boolean;
  position: PositionTechnicien | null;
  score: number;
}

// Obtenir les suggestions de techniciens pour une intervention
export async function getSuggestionsTechniciens(
  artisanId: number,
  latitude: number,
  longitude: number,
  dateIntervention: Date
): Promise<TechnicienSuggestion[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Récupérer tous les techniciens actifs de l'artisan
  const techniciensList = await db.select().from(techniciens)
    .where(and(
      eq(techniciens.artisanId, artisanId),
      eq(techniciens.statut, 'actif')
    ));
  
  const suggestions: TechnicienSuggestion[] = [];
  
  for (const tech of techniciensList) {
    // Récupérer la dernière position du technicien
    const positions = await db.select().from(positionsTechniciens)
      .where(eq(positionsTechniciens.technicienId, tech.id))
      .orderBy(desc(positionsTechniciens.timestamp))
      .limit(1);
    
    const position = positions[0] || null;
    
    // Calculer la distance et le temps de trajet
    let distance = 0;
    let tempsTrajet = 0;
    
    if (position) {
      distance = calculateDistance(
        parseFloat(position.latitude),
        parseFloat(position.longitude),
        latitude,
        longitude
      );
      tempsTrajet = estimateTrajetTime(distance);
    }
    
    // Vérifier la disponibilité du technicien
    const jourSemaine = dateIntervention.getDay();
    const heureIntervention = dateIntervention.getHours() * 60 + dateIntervention.getMinutes();
    
    const disponibilites = await db.select().from(disponibilitesTechniciens)
      .where(and(
        eq(disponibilitesTechniciens.technicienId, tech.id),
        eq(disponibilitesTechniciens.jourSemaine, jourSemaine)
      ));
    
    let disponible = false;
    for (const dispo of disponibilites) {
      const debut = parseInt(dispo.heureDebut.split(':')[0]) * 60 + parseInt(dispo.heureDebut.split(':')[1]);
      const fin = parseInt(dispo.heureFin.split(':')[0]) * 60 + parseInt(dispo.heureFin.split(':')[1]);
      if (heureIntervention >= debut && heureIntervention <= fin) {
        disponible = true;
        break;
      }
    }
    
    // Vérifier s'il n'a pas déjà une intervention à cette heure
    const interventionsExistantes = await db.select().from(interventions)
      .where(and(
        eq(interventions.technicienId, tech.id),
        eq(interventions.dateDebut, dateIntervention)
      ));
    
    if (interventionsExistantes.length > 0) {
      disponible = false;
    }
    
    // Calculer un score (plus bas = meilleur)
    // Priorité: disponibilité > distance > temps de trajet
    let score = distance;
    if (!disponible) score += 1000;
    if (!position) score += 500;
    
    suggestions.push({
      technicien: tech,
      distance: Math.round(distance * 10) / 10,
      tempsTrajet,
      disponible,
      position,
      score
    });
  }
  
  // Trier par score (meilleur en premier)
  suggestions.sort((a, b) => a.score - b.score);
  
  return suggestions;
}

// Obtenir le technicien le plus proche disponible
export async function getTechnicienPlusProche(
  artisanId: number,
  latitude: number,
  longitude: number,
  dateIntervention: Date
): Promise<TechnicienSuggestion | null> {
  const suggestions = await getSuggestionsTechniciens(artisanId, latitude, longitude, dateIntervention);
  const disponibles = suggestions.filter(s => s.disponible);
  return disponibles[0] || null;
}


// ============================================================================
// RAPPORTS PERSONNALISABLES
// ============================================================================

export async function createRapportPersonnalise(data: InsertRapportPersonnalise): Promise<RapportPersonnalise> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(rapportsPersonnalises).values(data);
  const insertId = Number(result[0].insertId);
  const created = await db.select().from(rapportsPersonnalises).where(eq(rapportsPersonnalises.id, insertId)).limit(1);
  if (created.length === 0) throw new Error("Failed to create rapport");
  return created[0];
}

export async function getRapportsPersonnalisesByArtisanId(artisanId: number): Promise<RapportPersonnalise[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(rapportsPersonnalises)
    .where(eq(rapportsPersonnalises.artisanId, artisanId))
    .orderBy(desc(rapportsPersonnalises.createdAt));
}

export async function getRapportPersonnaliseById(id: number): Promise<RapportPersonnalise | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(rapportsPersonnalises).where(eq(rapportsPersonnalises.id, id)).limit(1);
  return result[0] || null;
}

export async function updateRapportPersonnalise(id: number, data: Partial<InsertRapportPersonnalise>): Promise<RapportPersonnalise | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(rapportsPersonnalises).set(data).where(eq(rapportsPersonnalises.id, id));
  return await getRapportPersonnaliseById(id);
}

export async function deleteRapportPersonnalise(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(rapportsPersonnalises).where(eq(rapportsPersonnalises.id, id));
}

export async function toggleRapportFavori(id: number): Promise<RapportPersonnalise | null> {
  const rapport = await getRapportPersonnaliseById(id);
  if (!rapport) return null;
  return await updateRapportPersonnalise(id, { favori: !rapport.favori });
}

// Exécuter un rapport et récupérer les données
export interface RapportResultat {
  colonnes: string[];
  lignes: Record<string, unknown>[];
  totaux?: Record<string, number>;
}

export async function executerRapport(rapportId: number, parametres?: Record<string, unknown>): Promise<RapportResultat> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const rapport = await getRapportPersonnaliseById(rapportId);
  if (!rapport) throw new Error("Rapport non trouvé");
  
  const filtres = (rapport.filtres as Record<string, unknown>) || {};
  const colonnesConfig = (rapport.colonnes as string[]) || [];
  const dateDebut = (parametres?.dateDebut as string) || (filtres.dateDebut as string);
  const dateFin = (parametres?.dateFin as string) || (filtres.dateFin as string);
  
  let lignes: Record<string, unknown>[] = [];
  let totaux: Record<string, number> = {};
  
  switch (rapport.type) {
    case "ventes": {
      // Rapport des ventes (factures)
      const facturesData = await db.select().from(factures)
        .where(eq(factures.artisanId, rapport.artisanId));
      
      lignes = facturesData
        .filter(f => {
          if (dateDebut && new Date(f.dateFacture) < new Date(dateDebut)) return false;
          if (dateFin && new Date(f.dateFacture) > new Date(dateFin)) return false;
          return true;
        })
        .map(f => ({
          id: f.id,
          numero: f.numero,
          date: f.dateFacture,
          client: f.clientId,
          totalHT: parseFloat(f.totalHT?.toString() || '0'),
          totalTTC: parseFloat(f.totalTTC?.toString() || '0'),
          statut: f.statut,
        }));
      
      totaux = {
        totalHT: lignes.reduce((sum, l) => sum + (l.totalHT as number), 0),
        totalTTC: lignes.reduce((sum, l) => sum + (l.totalTTC as number), 0),
        nombreFactures: lignes.length,
      };
      break;
    }
    
    case "clients": {
      // Rapport des clients
      const clientsData = await db.select().from(clients)
        .where(eq(clients.artisanId, rapport.artisanId));
      
      lignes = clientsData.map(c => ({
        id: c.id,
        nom: c.nom,
        prenom: c.prenom,
        email: c.email,
        telephone: c.telephone,
        ville: c.ville,
        dateCreation: c.createdAt,
      }));
      
      totaux = {
        nombreClients: lignes.length,
      };
      break;
    }
    
    case "interventions": {
      // Rapport des interventions
      const interventionsData = await db.select().from(interventions)
        .where(eq(interventions.artisanId, rapport.artisanId));
      
      lignes = interventionsData
        .filter(i => {
          if (dateDebut && new Date(i.dateDebut) < new Date(dateDebut)) return false;
          if (dateFin && new Date(i.dateDebut) > new Date(dateFin)) return false;
          return true;
        })
        .map(i => ({
          id: i.id,
          titre: i.titre,
          date: i.dateDebut,
          statut: i.statut,
          clientId: i.clientId,
          technicienId: i.technicienId,
        }));
      
      const parStatut: Record<string, number> = {};
      for (const l of lignes) {
        const statut = l.statut as string;
        parStatut[statut] = (parStatut[statut] || 0) + 1;
      }
      
      totaux = {
        nombreInterventions: lignes.length,
        ...parStatut,
      };
      break;
    }
    
    case "stocks": {
      // Rapport des stocks
      const stocksData = await db.select().from(stocks)
        .where(eq(stocks.artisanId, rapport.artisanId));
      
      lignes = stocksData.map(s => ({
        id: s.id,
        nom: s.designation,
        reference: s.reference,
        quantite: parseFloat(s.quantiteEnStock?.toString() || '0'),
        seuilAlerte: parseFloat(s.seuilAlerte?.toString() || '0'),
        prixAchat: parseFloat(s.prixAchat?.toString() || '0'),
        emplacement: s.emplacement || '-',
        valeurStock: parseFloat(s.quantiteEnStock?.toString() || '0') * parseFloat(s.prixAchat?.toString() || '0'),
      }));
      
      totaux = {
        nombreArticles: lignes.length,
        valeurTotale: lignes.reduce((sum, l) => sum + (l.valeurStock as number), 0),
        articlesEnAlerte: lignes.filter(l => (l.quantite as number) <= (l.seuilAlerte as number)).length,
      };
      break;
    }
    
    case "techniciens": {
      // Rapport des techniciens
      const techniciensData = await db.select().from(techniciens)
        .where(eq(techniciens.artisanId, rapport.artisanId));
      
      const technicienStats = await Promise.all(techniciensData.map(async (t) => {
        const interventionsTech = await db.select().from(interventions)
          .where(eq(interventions.technicienId, t.id));
        
        return {
          id: t.id,
          nom: t.nom,
          specialite: t.specialite,
          statut: t.statut,
          nombreInterventions: interventionsTech.length,
          interventionsTerminees: interventionsTech.filter(i => i.statut === 'terminee').length,
        };
      }));
      
      lignes = technicienStats;
      
      totaux = {
        nombreTechniciens: lignes.length,
        totalInterventions: lignes.reduce((sum, l) => sum + (l.nombreInterventions as number), 0),
      };
      break;
    }
    
    case "financier": {
      // Rapport financier global
      const facturesData = await db.select().from(factures)
        .where(eq(factures.artisanId, rapport.artisanId));
      
      const devisData = await db.select().from(devis)
        .where(eq(devis.artisanId, rapport.artisanId));
      
      const facturesFiltrees = facturesData.filter(f => {
        if (dateDebut && new Date(f.dateFacture) < new Date(dateDebut)) return false;
        if (dateFin && new Date(f.dateFacture) > new Date(dateFin)) return false;
        return true;
      });
      
      const devisFiltres = devisData.filter(d => {
        if (dateDebut && new Date(d.dateDevis) < new Date(dateDebut)) return false;
        if (dateFin && new Date(d.dateDevis) > new Date(dateFin)) return false;
        return true;
      });
      
      lignes = [
        { categorie: "Chiffre d'affaires", valeur: facturesFiltrees.filter(f => f.statut === 'payee').reduce((sum, f) => sum + parseFloat(f.totalTTC?.toString() || '0'), 0) },
        { categorie: "Factures en attente", valeur: facturesFiltrees.filter(f => f.statut === 'envoyee').reduce((sum, f) => sum + parseFloat(f.totalTTC?.toString() || '0'), 0) },
        { categorie: "Devis acceptés", valeur: devisFiltres.filter(d => d.statut === 'accepte').reduce((sum, d) => sum + parseFloat(d.totalTTC?.toString() || '0'), 0) },
        { categorie: "Devis en attente", valeur: devisFiltres.filter(d => d.statut === 'envoye').reduce((sum, d) => sum + parseFloat(d.totalTTC?.toString() || '0'), 0) },
      ];
      
      totaux = {
        totalCA: lignes[0].valeur as number,
        totalEnAttente: lignes[1].valeur as number,
      };
      break;
    }
    
    default:
      break;
  }
  
  // Enregistrer l'exécution
  const startTime = Date.now();
  await db.insert(executionsRapports).values({
    rapportId,
    artisanId: rapport.artisanId,
    parametres: parametres || {},
    resultats: { lignes, totaux },
    nombreLignes: lignes.length,
    tempsExecution: Date.now() - startTime,
  });
  
  return {
    colonnes: colonnesConfig.length > 0 ? colonnesConfig : Object.keys(lignes[0] || {}),
    lignes,
    totaux,
  };
}

export async function getHistoriqueExecutions(rapportId: number, limit: number = 10): Promise<ExecutionRapport[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(executionsRapports)
    .where(eq(executionsRapports.rapportId, rapportId))
    .orderBy(desc(executionsRapports.dateExecution))
    .limit(limit);
}


// ============================================================================
// NOTIFICATIONS PUSH
// ============================================================================

export async function savePushSubscription(data: InsertPushSubscription): Promise<PushSubscription | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(pushSubscriptions).values(data).$returningId();
  if (!result) return null;
  const [subscription] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, result.id));
  return subscription || null;
}

export async function getPushSubscriptionsByTechnicien(technicienId: number): Promise<PushSubscription[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.technicienId, technicienId), eq(pushSubscriptions.actif, true)));
}

export async function deletePushSubscription(endpoint: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  return true;
}

export async function getPreferencesNotifications(technicienId: number): Promise<PreferenceNotification | null> {
  const db = await getDb();
  if (!db) return null;
  const [prefs] = await db.select().from(preferencesNotifications)
    .where(eq(preferencesNotifications.technicienId, technicienId));
  return prefs || null;
}

export async function savePreferencesNotifications(data: InsertPreferenceNotification): Promise<PreferenceNotification | null> {
  const db = await getDb();
  if (!db) return null;
  
  const existing = await getPreferencesNotifications(data.technicienId);
  if (existing) {
    await db.update(preferencesNotifications)
      .set(data)
      .where(eq(preferencesNotifications.technicienId, data.technicienId));
    return await getPreferencesNotifications(data.technicienId);
  }
  
  const [result] = await db.insert(preferencesNotifications).values(data).$returningId();
  if (!result) return null;
  const [prefs] = await db.select().from(preferencesNotifications).where(eq(preferencesNotifications.id, result.id));
  return prefs || null;
}

export async function createHistoriqueNotificationPush(data: InsertHistoriqueNotificationPush): Promise<HistoriqueNotificationPush | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(historiqueNotificationsPush).values(data).$returningId();
  if (!result) return null;
  const [notif] = await db.select().from(historiqueNotificationsPush).where(eq(historiqueNotificationsPush.id, result.id));
  return notif || null;
}

export async function getHistoriqueNotificationsPush(technicienId: number, limit: number = 50): Promise<HistoriqueNotificationPush[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(historiqueNotificationsPush)
    .where(eq(historiqueNotificationsPush.technicienId, technicienId))
    .orderBy(desc(historiqueNotificationsPush.dateEnvoi))
    .limit(limit);
}

export async function markNotificationPushAsRead(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.update(historiqueNotificationsPush)
    .set({ statut: 'lu', dateLecture: new Date() })
    .where(eq(historiqueNotificationsPush.id, id));
  return true;
}

// ============================================================================
// CONGES ET ABSENCES
// ============================================================================

export async function createConge(data: InsertConge): Promise<Conge | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(conges).values(data).$returningId();
  if (!result) return null;
  const [conge] = await db.select().from(conges).where(eq(conges.id, result.id));
  return conge || null;
}

export async function getCongesByTechnicien(technicienId: number): Promise<Conge[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(conges)
    .where(eq(conges.technicienId, technicienId))
    .orderBy(desc(conges.dateDebut));
}

export async function getCongesByArtisan(artisanId: number, statut?: string): Promise<Conge[]> {
  const db = await getDb();
  if (!db) return [];
  
  if (statut) {
    return await db.select().from(conges)
      .where(and(eq(conges.artisanId, artisanId), eq(conges.statut, statut as any)))
      .orderBy(desc(conges.dateDebut));
  }
  
  return await db.select().from(conges)
    .where(eq(conges.artisanId, artisanId))
    .orderBy(desc(conges.dateDebut));
}

export async function getCongesEnAttente(artisanId: number): Promise<Conge[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(conges)
    .where(and(eq(conges.artisanId, artisanId), eq(conges.statut, 'en_attente')))
    .orderBy(asc(conges.dateDebut));
}

export async function updateCongeStatut(id: number, statut: string, validePar: number, commentaire?: string): Promise<Conge | null> {
  const db = await getDb();
  if (!db) return null;
  
  await db.update(conges)
    .set({ 
      statut: statut as any, 
      validePar, 
      commentaireValidation: commentaire,
      dateValidation: new Date()
    })
    .where(eq(conges.id, id));
  
  const [conge] = await db.select().from(conges).where(eq(conges.id, id));
  return conge || null;
}

export async function getCongeById(id: number): Promise<Conge | null> {
  const db = await getDb();
  if (!db) return null;
  const [conge] = await db.select().from(conges).where(eq(conges.id, id));
  return conge || null;
}

export async function deleteConge(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(conges).where(eq(conges.id, id));
  return true;
}

export async function getCongesParPeriode(artisanId: number, dateDebut: string, dateFin: string): Promise<Conge[]> {
  const db = await getDb();
  if (!db) return [];
  
  const allConges = await db.select().from(conges)
    .where(eq(conges.artisanId, artisanId));
  
  return allConges.filter(c => {
    const debut = new Date(c.dateDebut);
    const fin = new Date(c.dateFin);
    const periodeDebut = new Date(dateDebut);
    const periodeFin = new Date(dateFin);
    return (debut <= periodeFin && fin >= periodeDebut);
  });
}

export async function getSoldesConges(technicienId: number, annee: number): Promise<SoldeConge[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(soldesConges)
    .where(and(eq(soldesConges.technicienId, technicienId), eq(soldesConges.annee, annee)));
}

export async function updateSoldeConges(technicienId: number, type: string, annee: number, joursPris: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const [solde] = await db.select().from(soldesConges)
    .where(and(
      eq(soldesConges.technicienId, technicienId),
      eq(soldesConges.type, type as any),
      eq(soldesConges.annee, annee)
    ));
  
  if (solde) {
    const nouveauJoursPris = parseFloat(solde.joursPris?.toString() || '0') + joursPris;
    const nouveauSoldeRestant = parseFloat(solde.soldeInitial?.toString() || '0') + parseFloat(solde.joursAcquis?.toString() || '0') - nouveauJoursPris;
    
    await db.update(soldesConges)
      .set({ 
        joursPris: nouveauJoursPris.toFixed(2),
        soldeRestant: nouveauSoldeRestant.toFixed(2)
      })
      .where(eq(soldesConges.id, solde.id));
  }
  
  return true;
}

export async function initSoldeConges(data: InsertSoldeConge): Promise<SoldeConge | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(soldesConges).values(data).$returningId();
  if (!result) return null;
  const [solde] = await db.select().from(soldesConges).where(eq(soldesConges.id, result.id));
  return solde || null;
}

// ============================================================================
// PREVISIONS DE CA
// ============================================================================

export async function getHistoriqueCA(artisanId: number, nombreMois: number = 24): Promise<HistoriqueCA[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(historiqueCA)
    .where(eq(historiqueCA.artisanId, artisanId))
    .orderBy(desc(historiqueCA.annee), desc(historiqueCA.mois))
    .limit(nombreMois);
}

export async function saveHistoriqueCA(data: InsertHistoriqueCA): Promise<HistoriqueCA | null> {
  const db = await getDb();
  if (!db) return null;
  
  // Vérifier si l'entrée existe déjà
  const existing = await db.select().from(historiqueCA)
    .where(and(
      eq(historiqueCA.artisanId, data.artisanId),
      eq(historiqueCA.mois, data.mois),
      eq(historiqueCA.annee, data.annee)
    ));
  
  if (existing.length > 0) {
    await db.update(historiqueCA)
      .set(data)
      .where(eq(historiqueCA.id, existing[0].id));
    return existing[0];
  }
  
  const [result] = await db.insert(historiqueCA).values(data).$returningId();
  if (!result) return null;
  const [hist] = await db.select().from(historiqueCA).where(eq(historiqueCA.id, result.id));
  return hist || null;
}

export async function calculerHistoriqueCAMensuel(artisanId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Récupérer toutes les factures payées
  const facturesPayees = await db.select().from(factures)
    .where(and(eq(factures.artisanId, artisanId), eq(factures.statut, 'payee')));
  
  // Récupérer tous les devis
  const tousDevis = await db.select().from(devis)
    .where(eq(devis.artisanId, artisanId));
  
  // Grouper par mois/année
  const parMois: Record<string, { ca: number, nbFactures: number, clients: Set<number>, devisEnvoyes: number, devisAcceptes: number }> = {};
  
  facturesPayees.forEach(f => {
    const date = new Date(f.dateFacture);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    if (!parMois[key]) {
      parMois[key] = { ca: 0, nbFactures: 0, clients: new Set(), devisEnvoyes: 0, devisAcceptes: 0 };
    }
    parMois[key].ca += parseFloat(f.totalTTC?.toString() || '0');
    parMois[key].nbFactures++;
    parMois[key].clients.add(f.clientId);
  });
  
  tousDevis.forEach(d => {
    const date = new Date(d.dateDevis);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    if (!parMois[key]) {
      parMois[key] = { ca: 0, nbFactures: 0, clients: new Set(), devisEnvoyes: 0, devisAcceptes: 0 };
    }
    if (d.statut === 'envoye' || d.statut === 'accepte' || d.statut === 'refuse') {
      parMois[key].devisEnvoyes++;
    }
    if (d.statut === 'accepte') {
      parMois[key].devisAcceptes++;
    }
  });
  
  // Sauvegarder l'historique
  for (const [key, data] of Object.entries(parMois)) {
    const [annee, mois] = key.split('-').map(Number);
    const panierMoyen = data.nbFactures > 0 ? data.ca / data.nbFactures : 0;
    const tauxConversion = data.devisEnvoyes > 0 ? (data.devisAcceptes / data.devisEnvoyes) * 100 : 0;
    
    await saveHistoriqueCA({
      artisanId,
      mois,
      annee,
      caTotal: data.ca.toFixed(2),
      nombreFactures: data.nbFactures,
      nombreClients: data.clients.size,
      panierMoyen: panierMoyen.toFixed(2),
      tauxConversion: tauxConversion.toFixed(2),
    });
  }
}

export async function getPrevisionsCA(artisanId: number, annee: number): Promise<PrevisionCA[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(previsionsCA)
    .where(and(eq(previsionsCA.artisanId, artisanId), eq(previsionsCA.annee, annee)))
    .orderBy(asc(previsionsCA.mois));
}

export async function savePrevisionCA(data: InsertPrevisionCA): Promise<PrevisionCA | null> {
  const db = await getDb();
  if (!db) return null;
  
  // Vérifier si l'entrée existe déjà
  const existing = await db.select().from(previsionsCA)
    .where(and(
      eq(previsionsCA.artisanId, data.artisanId),
      eq(previsionsCA.mois, data.mois),
      eq(previsionsCA.annee, data.annee)
    ));
  
  if (existing.length > 0) {
    await db.update(previsionsCA)
      .set(data)
      .where(eq(previsionsCA.id, existing[0].id));
    const [updated] = await db.select().from(previsionsCA).where(eq(previsionsCA.id, existing[0].id));
    return updated || null;
  }
  
  const [result] = await db.insert(previsionsCA).values(data).$returningId();
  if (!result) return null;
  const [prev] = await db.select().from(previsionsCA).where(eq(previsionsCA.id, result.id));
  return prev || null;
}

export async function calculerPrevisionsCA(artisanId: number, methode: string = 'moyenne_mobile'): Promise<PrevisionCA[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Récupérer l'historique des 24 derniers mois
  const historique = await getHistoriqueCA(artisanId, 24);
  
  if (historique.length < 3) {
    return []; // Pas assez de données pour faire des prévisions
  }
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  const previsions: PrevisionCA[] = [];
  
  // Calculer les prévisions pour les 12 prochains mois
  for (let i = 0; i < 12; i++) {
    let targetMonth = currentMonth + i;
    let targetYear = currentYear;
    
    if (targetMonth > 12) {
      targetMonth -= 12;
      targetYear++;
    }
    
    let caPrevisionnel = 0;
    let confiance = 0;
    
    if (methode === 'moyenne_mobile') {
      // Moyenne mobile sur les 3 derniers mois
      const derniersMois = historique.slice(0, Math.min(3, historique.length));
      const moyenne = derniersMois.reduce((sum, h) => sum + parseFloat(h.caTotal?.toString() || '0'), 0) / derniersMois.length;
      caPrevisionnel = moyenne;
      confiance = Math.min(90, 60 + (historique.length * 2));
    } else if (methode === 'regression_lineaire') {
      // Régression linéaire simple
      const n = historique.length;
      const x = historique.map((_, idx) => idx);
      const y = historique.map(h => parseFloat(h.caTotal?.toString() || '0'));
      
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((sum, xi, idx) => sum + xi * y[idx], 0);
      const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      caPrevisionnel = intercept + slope * (n + i);
      confiance = Math.min(85, 50 + (historique.length * 1.5));
    } else if (methode === 'saisonnalite') {
      // Prendre la valeur du même mois l'année précédente avec ajustement
      const memesMois = historique.filter(h => h.mois === targetMonth);
      if (memesMois.length > 0) {
        const moyenne = memesMois.reduce((sum, h) => sum + parseFloat(h.caTotal?.toString() || '0'), 0) / memesMois.length;
        // Ajuster avec la tendance générale
        const tendance = historique.length >= 2 
          ? (parseFloat(historique[0].caTotal?.toString() || '0') - parseFloat(historique[historique.length - 1].caTotal?.toString() || '0')) / historique.length
          : 0;
        caPrevisionnel = moyenne + (tendance * i);
        confiance = Math.min(80, 55 + (memesMois.length * 10));
      } else {
        // Fallback sur moyenne mobile
        const derniersMois = historique.slice(0, 3);
        caPrevisionnel = derniersMois.reduce((sum, h) => sum + parseFloat(h.caTotal?.toString() || '0'), 0) / derniersMois.length;
        confiance = 50;
      }
    }
    
    // S'assurer que la prévision est positive
    caPrevisionnel = Math.max(0, caPrevisionnel);
    
    // Récupérer le CA réalisé si le mois est passé
    const historiqueMatch = historique.find(h => h.mois === targetMonth && h.annee === targetYear);
    const caRealise = historiqueMatch ? parseFloat(historiqueMatch.caTotal?.toString() || '0') : 0;
    const ecart = caRealise - caPrevisionnel;
    const ecartPourcentage = caPrevisionnel > 0 ? (ecart / caPrevisionnel) * 100 : 0;
    
    const prevision = await savePrevisionCA({
      artisanId,
      mois: targetMonth,
      annee: targetYear,
      caPrevisionnel: caPrevisionnel.toFixed(2),
      caRealise: caRealise.toFixed(2),
      ecart: ecart.toFixed(2),
      ecartPourcentage: ecartPourcentage.toFixed(2),
      methodeCalcul: methode as any,
      confiance: confiance.toFixed(2),
    });
    
    if (prevision) {
      previsions.push(prevision);
    }
  }
  
  return previsions;
}

export async function getComparaisonPrevisionsRealise(artisanId: number, annee: number): Promise<{ mois: number, previsionnel: number, realise: number, ecart: number, ecartPct: number }[]> {
  const db = await getDb();
  if (!db) return [];
  
  const previsions = await getPrevisionsCA(artisanId, annee);
  const historique = await getHistoriqueCA(artisanId, 12);
  
  return previsions.map(p => {
    const hist = historique.find(h => h.mois === p.mois && h.annee === p.annee);
    const realise = hist ? parseFloat(hist.caTotal?.toString() || '0') : 0;
    const previsionnel = parseFloat(p.caPrevisionnel?.toString() || '0');
    const ecart = realise - previsionnel;
    const ecartPct = previsionnel > 0 ? (ecart / previsionnel) * 100 : 0;
    
    return {
      mois: p.mois,
      previsionnel,
      realise,
      ecart,
      ecartPct,
    };
  });
}

// Fonction pour vérifier si un technicien est en congé à une date donnée
export async function isTechnicienEnConge(technicienId: number, date: Date): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const congesApprouves = await db.select().from(conges)
    .where(and(
      eq(conges.technicienId, technicienId),
      eq(conges.statut, 'approuve')
    ));
  
  const dateStr = date.toISOString().split('T')[0];
  
  return congesApprouves.some(c => {
    const debut = new Date(c.dateDebut).toISOString().split('T')[0];
    const fin = new Date(c.dateFin).toISOString().split('T')[0];
    return dateStr >= debut && dateStr <= fin;
  });
}

// Fonction pour obtenir les techniciens disponibles à une date donnée (avec vérification des congés)
export async function getTechniciensDisponiblesAvecConges(artisanId: number, date: Date): Promise<Technicien[]> {
  const db = await getDb();
  if (!db) return [];
  
  const allTechniciens = await db.select().from(techniciens)
    .where(and(eq(techniciens.artisanId, artisanId), eq(techniciens.statut, 'actif')));
  
  const disponibles: Technicien[] = [];
  
  for (const tech of allTechniciens) {
    const enConge = await isTechnicienEnConge(tech.id, date);
    if (!enConge) {
      disponibles.push(tech);
    }
  }
  
  return disponibles;
}


// ============================================================================
// GESTION DES VEHICULES
// ============================================================================

export async function createVehicule(data: InsertVehicule): Promise<Vehicule | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(vehicules).values(data);
  const [vehicule] = await db.select().from(vehicules).where(eq(vehicules.id, result.insertId));
  return vehicule || null;
}

export async function getVehiculesByArtisan(artisanId: number): Promise<Vehicule[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(vehicules).where(eq(vehicules.artisanId, artisanId)).orderBy(desc(vehicules.createdAt));
}

export async function getVehiculeById(id: number): Promise<Vehicule | null> {
  const db = await getDb();
  if (!db) return null;
  const [vehicule] = await db.select().from(vehicules).where(eq(vehicules.id, id));
  return vehicule || null;
}

export async function updateVehicule(id: number, data: Partial<InsertVehicule>): Promise<Vehicule | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(vehicules).set(data).where(eq(vehicules.id, id));
  return getVehiculeById(id);
}

export async function deleteVehicule(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(vehicules).where(eq(vehicules.id, id));
  return true;
}

// Historique kilométrique
export async function addHistoriqueKilometrage(data: InsertHistoriqueKilometrage): Promise<HistoriqueKilometrage | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(historiqueKilometrage).values(data);
  // Mettre à jour le kilométrage actuel du véhicule
  await db.update(vehicules).set({ kilometrageActuel: data.kilometrage }).where(eq(vehicules.id, data.vehiculeId));
  const [hist] = await db.select().from(historiqueKilometrage).where(eq(historiqueKilometrage.id, result.insertId));
  return hist || null;
}

export async function getHistoriqueKilometrageByVehicule(vehiculeId: number): Promise<HistoriqueKilometrage[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(historiqueKilometrage).where(eq(historiqueKilometrage.vehiculeId, vehiculeId)).orderBy(desc(historiqueKilometrage.dateReleve));
}

// Entretiens véhicules
export async function createEntretienVehicule(data: InsertEntretienVehicule): Promise<EntretienVehicule | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(entretiensVehicules).values(data);
  const [entretien] = await db.select().from(entretiensVehicules).where(eq(entretiensVehicules.id, result.insertId));
  return entretien || null;
}

export async function getEntretiensByVehicule(vehiculeId: number): Promise<EntretienVehicule[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(entretiensVehicules).where(eq(entretiensVehicules.vehiculeId, vehiculeId)).orderBy(desc(entretiensVehicules.dateEntretien));
}

export async function getEntretiensAVenir(artisanId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const vehiculesArtisan = await db.select().from(vehicules).where(eq(vehicules.artisanId, artisanId));
  const vehiculeIds = vehiculesArtisan.map(v => v.id);
  if (vehiculeIds.length === 0) return [];
  
  const entretiens = await db.select().from(entretiensVehicules)
    .where(inArray(entretiensVehicules.vehiculeId, vehiculeIds));
  
  const aujourdhui = new Date();
  return entretiens.filter(e => {
    if (e.prochainEntretienDate) {
      return new Date(e.prochainEntretienDate) <= new Date(aujourdhui.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    return false;
  }).map(e => {
    const vehicule = vehiculesArtisan.find(v => v.id === e.vehiculeId);
    return { ...e, vehicule };
  });
}

// Assurances véhicules
export async function createAssuranceVehicule(data: InsertAssuranceVehicule): Promise<AssuranceVehicule | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(assurancesVehicules).values(data);
  const [assurance] = await db.select().from(assurancesVehicules).where(eq(assurancesVehicules.id, result.insertId));
  return assurance || null;
}

export async function getAssurancesByVehicule(vehiculeId: number): Promise<AssuranceVehicule[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(assurancesVehicules).where(eq(assurancesVehicules.vehiculeId, vehiculeId)).orderBy(desc(assurancesVehicules.dateDebut));
}

export async function getAssurancesExpirant(artisanId: number, joursAvant: number = 30): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const vehiculesArtisan = await db.select().from(vehicules).where(eq(vehicules.artisanId, artisanId));
  const vehiculeIds = vehiculesArtisan.map(v => v.id);
  if (vehiculeIds.length === 0) return [];
  
  const assurances = await db.select().from(assurancesVehicules)
    .where(inArray(assurancesVehicules.vehiculeId, vehiculeIds));
  
  const aujourdhui = new Date();
  const dateLimite = new Date(aujourdhui.getTime() + joursAvant * 24 * 60 * 60 * 1000);
  
  return assurances.filter(a => {
    const dateFin = new Date(a.dateFin);
    return dateFin <= dateLimite && dateFin >= aujourdhui;
  }).map(a => {
    const vehicule = vehiculesArtisan.find(v => v.id === a.vehiculeId);
    return { ...a, vehicule };
  });
}

export async function updateAssuranceVehicule(id: number, data: Partial<InsertAssuranceVehicule>): Promise<AssuranceVehicule | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(assurancesVehicules).set(data).where(eq(assurancesVehicules.id, id));
  const [assurance] = await db.select().from(assurancesVehicules).where(eq(assurancesVehicules.id, id));
  return assurance || null;
}

// ============================================================================
// BADGES ET GAMIFICATION
// ============================================================================

export async function createBadge(data: InsertBadge): Promise<Badge | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(badges).values(data);
  const [badge] = await db.select().from(badges).where(eq(badges.id, result.insertId));
  return badge || null;
}

export async function getBadgesByArtisan(artisanId: number): Promise<Badge[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(badges).where(eq(badges.artisanId, artisanId)).orderBy(badges.categorie);
}

export async function getBadgeById(id: number): Promise<Badge | null> {
  const db = await getDb();
  if (!db) return null;
  const [badge] = await db.select().from(badges).where(eq(badges.id, id));
  return badge || null;
}

export async function updateBadge(id: number, data: Partial<InsertBadge>): Promise<Badge | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(badges).set(data).where(eq(badges.id, id));
  return getBadgeById(id);
}

export async function deleteBadge(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(badges).where(eq(badges.id, id));
  return true;
}

// Badges des techniciens
export async function attribuerBadge(technicienId: number, badgeId: number, valeurAtteinte?: number): Promise<BadgeTechnicien | null> {
  const db = await getDb();
  if (!db) return null;
  
  // Vérifier si le badge n'est pas déjà attribué
  const [existing] = await db.select().from(badgesTechniciens)
    .where(and(eq(badgesTechniciens.technicienId, technicienId), eq(badgesTechniciens.badgeId, badgeId)));
  if (existing) return existing;
  
  const [result] = await db.insert(badgesTechniciens).values({
    technicienId,
    badgeId,
    valeurAtteinte,
  });
  const [badge] = await db.select().from(badgesTechniciens).where(eq(badgesTechniciens.id, result.insertId));
  return badge || null;
}

export async function getBadgesTechnicien(technicienId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const badgesTech = await db.select().from(badgesTechniciens).where(eq(badgesTechniciens.technicienId, technicienId));
  const badgesDetails = await db.select().from(badges).where(inArray(badges.id, badgesTech.map(b => b.badgeId)));
  return badgesTech.map(bt => ({
    ...bt,
    badge: badgesDetails.find(b => b.id === bt.badgeId),
  }));
}

export async function getNouveauxBadgesNonNotifies(technicienId: number): Promise<BadgeTechnicien[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(badgesTechniciens)
    .where(and(eq(badgesTechniciens.technicienId, technicienId), eq(badgesTechniciens.notifie, false)));
}

export async function marquerBadgeNotifie(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(badgesTechniciens).set({ notifie: true }).where(eq(badgesTechniciens.id, id));
}

// Objectifs techniciens
export async function createObjectifTechnicien(data: InsertObjectifTechnicien): Promise<ObjectifTechnicien | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(objectifsTechniciens).values(data);
  const [objectif] = await db.select().from(objectifsTechniciens).where(eq(objectifsTechniciens.id, result.insertId));
  return objectif || null;
}

export async function getObjectifsTechnicien(technicienId: number, annee: number): Promise<ObjectifTechnicien[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(objectifsTechniciens)
    .where(and(eq(objectifsTechniciens.technicienId, technicienId), eq(objectifsTechniciens.annee, annee)))
    .orderBy(objectifsTechniciens.mois);
}

export async function updateObjectifTechnicien(id: number, data: Partial<InsertObjectifTechnicien>): Promise<ObjectifTechnicien | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(objectifsTechniciens).set(data).where(eq(objectifsTechniciens.id, id));
  const [objectif] = await db.select().from(objectifsTechniciens).where(eq(objectifsTechniciens.id, id));
  return objectif || null;
}

// Classement techniciens
export async function getClassementTechniciens(artisanId: number, periode: "semaine" | "mois" | "trimestre" | "annee"): Promise<ClassementTechnicien[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(classementTechniciens)
    .where(and(eq(classementTechniciens.artisanId, artisanId), eq(classementTechniciens.periode, periode)))
    .orderBy(asc(classementTechniciens.rang));
}

export async function calculerClassement(artisanId: number, periode: "semaine" | "mois" | "trimestre" | "annee"): Promise<ClassementTechnicien[]> {
  const db = await getDb();
  if (!db) return [];
  
  const techniciensList = await db.select().from(techniciens)
    .where(and(eq(techniciens.artisanId, artisanId), eq(techniciens.statut, 'actif')));
  
  const aujourdhui = new Date();
  let dateDebut: Date;
  let dateFin = aujourdhui;
  
  switch (periode) {
    case 'semaine':
      dateDebut = new Date(aujourdhui.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'mois':
      dateDebut = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1);
      break;
    case 'trimestre':
      const trimestre = Math.floor(aujourdhui.getMonth() / 3);
      dateDebut = new Date(aujourdhui.getFullYear(), trimestre * 3, 1);
      break;
    case 'annee':
      dateDebut = new Date(aujourdhui.getFullYear(), 0, 1);
      break;
  }
  
  const classements: any[] = [];
  
  for (const tech of techniciensList) {
    // Compter les interventions terminées
    const interventionsList = await db.select().from(interventions)
      .where(and(
        eq(interventions.technicienId, tech.id),
        eq(interventions.statut, 'terminee')
      ));
    
    // Calculer le CA (factures payées liées aux interventions)
    const facturesList = await db.select().from(factures)
      .where(eq(factures.statut, 'payee'));
    
    // Calculer la note moyenne des avis
    const avisList = await db.select().from(avisClients)
      .where(eq(avisClients.statut, 'publie'));
    
    const noteMoyenne = avisList.length > 0 
      ? avisList.reduce((sum, a) => sum + a.note, 0) / avisList.length 
      : 0;
    
    const points = interventionsList.length * 10 + Math.round(noteMoyenne * 20);
    
    classements.push({
      technicienId: tech.id,
      artisanId,
      periode,
      dateDebut: dateDebut.toISOString().split('T')[0],
      dateFin: dateFin.toISOString().split('T')[0],
      pointsTotal: points,
      interventions: interventionsList.length,
      ca: "0.00",
      noteMoyenne: noteMoyenne.toFixed(2),
    });
  }
  
  // Trier par points et attribuer les rangs
  classements.sort((a, b) => b.pointsTotal - a.pointsTotal);
  classements.forEach((c, index) => {
    c.rang = index + 1;
  });
  
  // Sauvegarder le classement
  for (const c of classements) {
    await db.insert(classementTechniciens).values(c);
  }
  
  return classements;
}

// Vérifier et attribuer les badges automatiquement
export async function verifierEtAttribuerBadges(technicienId: number, artisanId: number): Promise<Badge[]> {
  const db = await getDb();
  if (!db) return [];
  
  const badgesArtisan = await db.select().from(badges)
    .where(and(eq(badges.artisanId, artisanId), eq(badges.actif, true)));
  
  const badgesObtenus = await db.select().from(badgesTechniciens)
    .where(eq(badgesTechniciens.technicienId, technicienId));
  
  const badgesDejaObtenus = badgesObtenus.map(b => b.badgeId);
  const nouveauxBadges: Badge[] = [];
  
  // Compter les interventions
  const interventionsList = await db.select().from(interventions)
    .where(and(eq(interventions.technicienId, technicienId), eq(interventions.statut, 'terminee')));
  const nbInterventions = interventionsList.length;
  
  // Compter les avis positifs (note >= 4)
  const avisList = await db.select().from(avisClients)
    .where(eq(avisClients.statut, 'publie'));
  const nbAvisPositifs = avisList.filter(a => a.note >= 4).length;
  
  for (const badge of badgesArtisan) {
    if (badgesDejaObtenus.includes(badge.id)) continue;
    
    let valeurActuelle = 0;
    
    switch (badge.categorie) {
      case 'interventions':
        valeurActuelle = nbInterventions;
        break;
      case 'avis':
        valeurActuelle = nbAvisPositifs;
        break;
    }
    
    if (badge.seuil && valeurActuelle >= badge.seuil) {
      await attribuerBadge(technicienId, badge.id, valeurActuelle);
      nouveauxBadges.push(badge);
    }
  }
  
  return nouveauxBadges;
}

// ============================================================================
// ALERTES ECARTS PREVISIONS CA
// ============================================================================

export async function getConfigAlertePrevision(artisanId: number): Promise<ConfigAlertePrevision | null> {
  const db = await getDb();
  if (!db) return null;
  const [config] = await db.select().from(configAlertesPrevisions).where(eq(configAlertesPrevisions.artisanId, artisanId));
  return config || null;
}

export async function saveConfigAlertePrevision(data: InsertConfigAlertePrevision): Promise<ConfigAlertePrevision | null> {
  const db = await getDb();
  if (!db) return null;
  
  const existing = await getConfigAlertePrevision(data.artisanId);
  if (existing) {
    await db.update(configAlertesPrevisions).set(data).where(eq(configAlertesPrevisions.artisanId, data.artisanId));
    return getConfigAlertePrevision(data.artisanId);
  }
  
  const [result] = await db.insert(configAlertesPrevisions).values(data);
  const [config] = await db.select().from(configAlertesPrevisions).where(eq(configAlertesPrevisions.id, result.insertId));
  return config || null;
}

export async function getHistoriqueAlertesPrevisions(artisanId: number): Promise<HistoriqueAlertePrevision[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(historiqueAlertesPrevisions)
    .where(eq(historiqueAlertesPrevisions.artisanId, artisanId))
    .orderBy(desc(historiqueAlertesPrevisions.dateEnvoi));
}

export async function createHistoriqueAlertePrevision(data: InsertHistoriqueAlertePrevision): Promise<HistoriqueAlertePrevision | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(historiqueAlertesPrevisions).values(data);
  const [alerte] = await db.select().from(historiqueAlertesPrevisions).where(eq(historiqueAlertesPrevisions.id, result.insertId));
  return alerte || null;
}

export async function verifierEcartsEtEnvoyerAlertes(artisanId: number): Promise<HistoriqueAlertePrevision[]> {
  const db = await getDb();
  if (!db) return [];
  
  const config = await getConfigAlertePrevision(artisanId);
  if (!config || !config.actif) return [];
  
  const aujourdhui = new Date();
  const moisActuel = aujourdhui.getMonth() + 1;
  const anneeActuelle = aujourdhui.getFullYear();
  
  // Récupérer les prévisions du mois actuel
  const [prevision] = await db.select().from(previsionsCA)
    .where(and(
      eq(previsionsCA.artisanId, artisanId),
      eq(previsionsCA.mois, moisActuel),
      eq(previsionsCA.annee, anneeActuelle)
    ));
  
  if (!prevision) return [];
  
  const caPrevisionnel = parseFloat(prevision.caPrevisionnel?.toString() || '0');
  const caRealise = parseFloat(prevision.caRealise?.toString() || '0');
  
  if (caPrevisionnel === 0) return [];
  
  const ecartPct = ((caRealise - caPrevisionnel) / caPrevisionnel) * 100;
  const seuilPositif = parseFloat(config.seuilAlertePositif?.toString() || '10');
  const seuilNegatif = parseFloat(config.seuilAlerteNegatif?.toString() || '10');
  
  const alertesEnvoyees: HistoriqueAlertePrevision[] = [];
  
  // Vérifier si une alerte a déjà été envoyée ce mois
  const alertesExistantes = await db.select().from(historiqueAlertesPrevisions)
    .where(and(
      eq(historiqueAlertesPrevisions.artisanId, artisanId),
      eq(historiqueAlertesPrevisions.mois, moisActuel),
      eq(historiqueAlertesPrevisions.annee, anneeActuelle)
    ));
  
  if (alertesExistantes.length > 0) return [];
  
  let typeAlerte: "depassement_positif" | "depassement_negatif" | null = null;
  let message = "";
  
  if (ecartPct >= seuilPositif) {
    typeAlerte = "depassement_positif";
    message = `Bonne nouvelle ! Votre CA réalisé (${caRealise.toLocaleString('fr-FR')} €) dépasse vos prévisions de ${ecartPct.toFixed(1)}%.`;
  } else if (ecartPct <= -seuilNegatif) {
    typeAlerte = "depassement_negatif";
    message = `Attention : Votre CA réalisé (${caRealise.toLocaleString('fr-FR')} €) est inférieur à vos prévisions de ${Math.abs(ecartPct).toFixed(1)}%.`;
  }
  
  if (typeAlerte) {
    let canalEnvoi: "email" | "sms" | "les_deux" = "email";
    if (config.alerteEmail && config.alerteSms) {
      canalEnvoi = "les_deux";
    } else if (config.alerteSms) {
      canalEnvoi = "sms";
    }
    
    const alerte = await createHistoriqueAlertePrevision({
      artisanId,
      mois: moisActuel,
      annee: anneeActuelle,
      typeAlerte,
      caPrevisionnel: caPrevisionnel.toString(),
      caRealise: caRealise.toString(),
      ecartPourcentage: ecartPct.toFixed(2),
      canalEnvoi,
      message,
    });
    
    if (alerte) {
      alertesEnvoyees.push(alerte);
    }
  }
  
  return alertesEnvoyees;
}

// Statistiques des véhicules
export async function getStatistiquesFlotte(artisanId: number): Promise<any> {
  const db = await getDb();
  if (!db) return null;
  
  const vehiculesArtisan = await db.select().from(vehicules).where(eq(vehicules.artisanId, artisanId));
  
  const totalVehicules = vehiculesArtisan.length;
  const vehiculesActifs = vehiculesArtisan.filter(v => v.statut === 'actif').length;
  const vehiculesEnMaintenance = vehiculesArtisan.filter(v => v.statut === 'en_maintenance').length;
  
  const kilometrageTotal = vehiculesArtisan.reduce((sum, v) => sum + (v.kilometrageActuel || 0), 0);
  
  const assurancesExpirant = await getAssurancesExpirant(artisanId, 30);
  const entretiensAVenir = await getEntretiensAVenir(artisanId);
  
  return {
    totalVehicules,
    vehiculesActifs,
    vehiculesEnMaintenance,
    kilometrageTotal,
    assurancesExpirant: assurancesExpirant.length,
    entretiensAVenir: entretiensAVenir.length,
  };
}


// ============================================================================
// CHANTIERS MULTI-INTERVENTIONS
// ============================================================================

export async function createChantier(data: InsertChantier): Promise<Chantier | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(chantiers).values(data);
  const [result] = await db.select().from(chantiers).where(eq(chantiers.reference, data.reference)).limit(1);
  return result || null;
}

export async function getChantiersByArtisan(artisanId: number): Promise<Chantier[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(chantiers).where(eq(chantiers.artisanId, artisanId)).orderBy(desc(chantiers.createdAt));
}

export async function getChantierById(id: number): Promise<Chantier | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.select().from(chantiers).where(eq(chantiers.id, id)).limit(1);
  return result || null;
}

export async function updateChantier(id: number, data: Partial<InsertChantier>): Promise<Chantier | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(chantiers).set(data).where(eq(chantiers.id, id));
  return getChantierById(id);
}

export async function deleteChantier(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(chantiers).where(eq(chantiers.id, id));
  return true;
}

// Phases de chantier
export async function createPhaseChantier(data: InsertPhaseChantier): Promise<PhaseChantier | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(phasesChantier).values(data);
  const [result] = await db.select().from(phasesChantier).where(eq(phasesChantier.chantierId, data.chantierId)).orderBy(desc(phasesChantier.id)).limit(1);
  return result || null;
}

export async function getPhasesByChantier(chantierId: number): Promise<PhaseChantier[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(phasesChantier).where(eq(phasesChantier.chantierId, chantierId)).orderBy(asc(phasesChantier.ordre));
}

export async function updatePhaseChantier(id: number, data: Partial<InsertPhaseChantier>): Promise<PhaseChantier | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(phasesChantier).set(data).where(eq(phasesChantier.id, id));
  const [result] = await db.select().from(phasesChantier).where(eq(phasesChantier.id, id)).limit(1);
  return result || null;
}

export async function deletePhaseChantier(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(phasesChantier).where(eq(phasesChantier.id, id));
  return true;
}

// Interventions du chantier
export async function associerInterventionChantier(data: InsertInterventionChantier): Promise<InterventionChantier | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(interventionsChantier).values(data);
  const [result] = await db.select().from(interventionsChantier).where(eq(interventionsChantier.interventionId, data.interventionId)).limit(1);
  return result || null;
}

export async function getInterventionsByChantier(chantierId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const assocs = await db.select().from(interventionsChantier).where(eq(interventionsChantier.chantierId, chantierId)).orderBy(asc(interventionsChantier.ordre));
  
  const result = [];
  for (const assoc of assocs) {
    const [intervention] = await db.select().from(interventions).where(eq(interventions.id, assoc.interventionId)).limit(1);
    if (intervention) {
      result.push({ ...intervention, phaseId: assoc.phaseId, ordre: assoc.ordre });
    }
  }
  return result;
}

export async function getAllInterventionsChantier(artisanId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  // Récupérer tous les chantiers de l'artisan
  const chantiersArtisan = await db.select().from(chantiers).where(eq(chantiers.artisanId, artisanId));
  const chantierIds = chantiersArtisan.map(c => c.id);
  if (chantierIds.length === 0) return [];
  
  // Récupérer toutes les associations
  const allAssocs = [];
  for (const chantierId of chantierIds) {
    const assocs = await db.select().from(interventionsChantier).where(eq(interventionsChantier.chantierId, chantierId));
    allAssocs.push(...assocs);
  }
  return allAssocs;
}

export async function dissocierInterventionChantier(chantierId: number, interventionId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(interventionsChantier).where(
    and(
      eq(interventionsChantier.chantierId, chantierId),
      eq(interventionsChantier.interventionId, interventionId)
    )
  );
  return true;
}

// Documents du chantier
export async function addDocumentChantier(data: InsertDocumentChantier): Promise<DocumentChantier | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(documentsChantier).values(data);
  const [result] = await db.select().from(documentsChantier).where(eq(documentsChantier.chantierId, data.chantierId)).orderBy(desc(documentsChantier.id)).limit(1);
  return result || null;
}

export async function getDocumentsByChantier(chantierId: number): Promise<DocumentChantier[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentsChantier).where(eq(documentsChantier.chantierId, chantierId)).orderBy(desc(documentsChantier.uploadedAt));
}

export async function deleteDocumentChantier(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(documentsChantier).where(eq(documentsChantier.id, id));
  return true;
}

// Statistiques du chantier
export async function getStatistiquesChantier(chantierId: number): Promise<any> {
  const db = await getDb();
  if (!db) return null;
  
  const chantier = await getChantierById(chantierId);
  if (!chantier) return null;
  
  const phases = await getPhasesByChantier(chantierId);
  const interventionsAssociees = await getInterventionsByChantier(chantierId);
  const documents = await getDocumentsByChantier(chantierId);
  
  const phasesTerminees = phases.filter(p => p.statut === 'termine').length;
  const interventionsTerminees = interventionsAssociees.filter((i: any) => i.statut === 'terminee').length;
  
  // Calculer le coût réel
  let coutReel = 0;
  for (const intervention of interventionsAssociees) {
    // Récupérer les factures liées aux interventions
    const facturesIntervention = await db.select().from(factures).where(eq(factures.clientId, chantier.clientId));
    coutReel += facturesIntervention.reduce((sum, f) => sum + parseFloat(f.totalTTC || '0'), 0);
  }
  
  return {
    totalPhases: phases.length,
    phasesTerminees,
    totalInterventions: interventionsAssociees.length,
    interventionsTerminees,
    totalDocuments: documents.length,
    budgetPrevisionnel: parseFloat(chantier.budgetPrevisionnel || '0'),
    budgetRealise: coutReel,
    ecartBudget: parseFloat(chantier.budgetPrevisionnel || '0') - coutReel,
    avancement: chantier.avancement || 0,
  };
}

// Calculer et mettre à jour l'avancement du chantier
export async function calculerAvancementChantier(chantierId: number): Promise<number> {
  const phases = await getPhasesByChantier(chantierId);
  if (phases.length === 0) return 0;
  
  const avancementTotal = phases.reduce((sum, p) => sum + (p.avancement || 0), 0);
  const avancementMoyen = Math.round(avancementTotal / phases.length);
  
  await updateChantier(chantierId, { avancement: avancementMoyen });
  return avancementMoyen;
}

// ============================================================================
// INTEGRATIONS COMPTABLES
// ============================================================================

export async function getConfigurationComptable(artisanId: number): Promise<ConfigurationComptable | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.select().from(configurationsComptables).where(eq(configurationsComptables.artisanId, artisanId)).limit(1);
  return result || null;
}

export async function saveConfigurationComptable(data: InsertConfigurationComptable): Promise<ConfigurationComptable | null> {
  const db = await getDb();
  if (!db) return null;
  
  const existing = await getConfigurationComptable(data.artisanId);
  if (existing) {
    await db.update(configurationsComptables).set(data).where(eq(configurationsComptables.artisanId, data.artisanId));
  } else {
    await db.insert(configurationsComptables).values(data);
  }
  return getConfigurationComptable(data.artisanId);
}

export async function createExportComptable(data: InsertExportComptable): Promise<ExportComptable | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(exportsComptables).values(data);
  const [result] = await db.select().from(exportsComptables).where(eq(exportsComptables.artisanId, data.artisanId)).orderBy(desc(exportsComptables.id)).limit(1);
  return result || null;
}

export async function getExportsComptables(artisanId: number): Promise<ExportComptable[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(exportsComptables).where(eq(exportsComptables.artisanId, artisanId)).orderBy(desc(exportsComptables.createdAt));
}

export async function updateExportComptable(id: number, data: Partial<InsertExportComptable>): Promise<ExportComptable | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(exportsComptables).set(data).where(eq(exportsComptables.id, id));
  const [result] = await db.select().from(exportsComptables).where(eq(exportsComptables.id, id)).limit(1);
  return result || null;
}

// Générer l'export FEC (Fichier des Écritures Comptables) pour Sage
export async function genererExportFEC(artisanId: number, dateDebut: Date, dateFin: Date): Promise<string> {
  const db = await getDb();
  if (!db) return '';
  
  const config = await getConfigurationComptable(artisanId);
  const ecritures = await db.select().from(ecrituresComptables)
    .where(
      and(
        eq(ecrituresComptables.artisanId, artisanId),
        gte(ecrituresComptables.dateEcriture, dateDebut),
        lte(ecrituresComptables.dateEcriture, dateFin)
      )
    )
    .orderBy(asc(ecrituresComptables.dateEcriture));
  
  // Format FEC: JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise
  const lignes = ['JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise'];
  
  for (const e of ecritures) {
    const dateStr = e.dateEcriture ? new Date(e.dateEcriture).toISOString().split('T')[0].replace(/-/g, '') : '';
    const debit = e.debit || '0.00';
    const credit = e.credit || '0.00';
    
    lignes.push([
      e.journal || config?.journalVentes || 'VE',
      'Journal des ventes',
      e.id.toString() || '',
      dateStr,
      e.numeroCompte || '',
      e.libelle || '',
      '',  // compteAuxiliaire non disponible
      '',
      e.pieceRef || '',
      dateStr,
      e.libelle || '',
      debit,
      credit,
      '',
      '',
      dateStr,
      '',
      'EUR'
    ].join('|'));
  }
  
  return lignes.join('\n');
}

// Générer l'export IIF pour QuickBooks
export async function genererExportIIF(artisanId: number, dateDebut: Date, dateFin: Date): Promise<string> {
  const db = await getDb();
  if (!db) return '';
  
  const facturesData = await db.select().from(factures)
    .where(
      and(
        eq(factures.artisanId, artisanId),
        gte(factures.dateFacture, dateDebut),
        lte(factures.dateFacture, dateFin)
      )
    )
    .orderBy(asc(factures.dateFacture));
  
  const lignes = [
    '!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO',
    '!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO',
    '!ENDTRNS'
  ];
  
  for (const f of facturesData) {
    const dateStr = f.dateFacture ? new Date(f.dateFacture).toLocaleDateString('en-US') : '';
    const client = await getClientById(f.clientId);
    const clientNom = client?.nom || 'Client';
    
    // Transaction principale
    lignes.push(`TRNS\tINVOICE\t${dateStr}\tAccounts Receivable\t${clientNom}\t${f.totalTTC}\t${f.numero}\tFacture ${f.numero}`);
    // Split pour le revenu
    lignes.push(`SPL\tINVOICE\t${dateStr}\tSales\t${clientNom}\t-${f.totalHT}\t${f.numero}\t`);
    // Split pour la TVA
    const tva = parseFloat(f.totalTTC || '0') - parseFloat(f.totalHT || '0');
    if (tva > 0) {
      lignes.push(`SPL\tINVOICE\t${dateStr}\tSales Tax Payable\t${clientNom}\t-${tva.toFixed(2)}\t${f.numero}\t`);
    }
    lignes.push('ENDTRNS');
  }
  
  return lignes.join('\n');
}

// ============================================================================
// DEVIS AUTOMATIQUE PAR IA
// ============================================================================

export async function createAnalysePhoto(data: InsertAnalysePhotoChantier): Promise<AnalysePhotoChantier | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(analysesPhotosChantier).values(data);
  const [result] = await db.select().from(analysesPhotosChantier).where(eq(analysesPhotosChantier.artisanId, data.artisanId)).orderBy(desc(analysesPhotosChantier.id)).limit(1);
  return result || null;
}

export async function getAnalysesPhotosByArtisan(artisanId: number): Promise<AnalysePhotoChantier[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(analysesPhotosChantier).where(eq(analysesPhotosChantier.artisanId, artisanId)).orderBy(desc(analysesPhotosChantier.createdAt));
}

export async function getAnalysePhotoById(id: number): Promise<AnalysePhotoChantier | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.select().from(analysesPhotosChantier).where(eq(analysesPhotosChantier.id, id)).limit(1);
  return result || null;
}

export async function updateAnalysePhoto(id: number, data: Partial<InsertAnalysePhotoChantier>): Promise<AnalysePhotoChantier | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(analysesPhotosChantier).set(data).where(eq(analysesPhotosChantier.id, id));
  return getAnalysePhotoById(id);
}

export async function addPhotoToAnalyse(data: InsertPhotoAnalyse): Promise<PhotoAnalyse | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(photosAnalyse).values(data);
  const [result] = await db.select().from(photosAnalyse).where(eq(photosAnalyse.analyseId, data.analyseId)).orderBy(desc(photosAnalyse.id)).limit(1);
  return result || null;
}

export async function getPhotosByAnalyse(analyseId: number): Promise<PhotoAnalyse[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(photosAnalyse).where(eq(photosAnalyse.analyseId, analyseId)).orderBy(asc(photosAnalyse.ordre));
}

export async function saveResultatAnalyseIA(data: InsertResultatAnalyseIA): Promise<ResultatAnalyseIA | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(resultatsAnalyseIA).values(data);
  const [result] = await db.select().from(resultatsAnalyseIA).where(eq(resultatsAnalyseIA.analyseId, data.analyseId)).orderBy(desc(resultatsAnalyseIA.id)).limit(1);
  return result || null;
}

export async function getResultatsAnalyse(analyseId: number): Promise<ResultatAnalyseIA[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(resultatsAnalyseIA).where(eq(resultatsAnalyseIA.analyseId, analyseId));
}

export async function saveSuggestionArticleIA(data: InsertSuggestionArticleIA): Promise<SuggestionArticleIA | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(suggestionsArticlesIA).values(data);
  const [result] = await db.select().from(suggestionsArticlesIA).where(eq(suggestionsArticlesIA.resultatId, data.resultatId)).orderBy(desc(suggestionsArticlesIA.id)).limit(1);
  return result || null;
}

export async function getSuggestionsByResultat(resultatId: number): Promise<SuggestionArticleIA[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(suggestionsArticlesIA).where(eq(suggestionsArticlesIA.resultatId, resultatId));
}

export async function updateSuggestionArticle(id: number, data: Partial<InsertSuggestionArticleIA>): Promise<SuggestionArticleIA | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(suggestionsArticlesIA).set(data).where(eq(suggestionsArticlesIA.id, id));
  const [result] = await db.select().from(suggestionsArticlesIA).where(eq(suggestionsArticlesIA.id, id)).limit(1);
  return result || null;
}

export async function saveDevisGenereIA(data: InsertDevisGenereIA): Promise<DevisGenereIA | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(devisGenereIA).values(data);
  const [result] = await db.select().from(devisGenereIA).where(eq(devisGenereIA.analyseId, data.analyseId)).limit(1);
  return result || null;
}

export async function getDevisGenereByAnalyse(analyseId: number): Promise<DevisGenereIA | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.select().from(devisGenereIA).where(eq(devisGenereIA.analyseId, analyseId)).limit(1);
  return result || null;
}

// Fonction pour créer un devis à partir des suggestions IA
export async function creerDevisDepuisAnalyseIA(analyseId: number, clientId: number, artisanId: number): Promise<Devis | null> {
  const db = await getDb();
  if (!db) return null;
  
  const analyse = await getAnalysePhotoById(analyseId);
  if (!analyse) return null;
  
  const resultats = await getResultatsAnalyse(analyseId);
  if (resultats.length === 0) return null;
  
  // Récupérer toutes les suggestions sélectionnées
  const toutesLesSuggestions: SuggestionArticleIA[] = [];
  for (const resultat of resultats) {
    const suggestions = await getSuggestionsByResultat(resultat.id);
    toutesLesSuggestions.push(...suggestions.filter(s => s.selectionne));
  }
  
  if (toutesLesSuggestions.length === 0) return null;
  
  // Calculer les totaux
  let totalHT = 0;
  for (const s of toutesLesSuggestions) {
    totalHT += parseFloat(s.prixEstime || '0') * parseFloat(s.quantiteSuggeree || '1');
  }
  const tauxTVA = 20;
  const totalTVA = totalHT * (tauxTVA / 100);
  const totalTTC = totalHT + totalTVA;
  
  // Générer le numéro de devis
  const numero = `DEV-IA-${Date.now()}`;
  
  // Créer le devis
  const devisData: InsertDevis = {
    artisanId,
    clientId,
    numero,
    dateDevis: new Date(),
    dateValidite: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 jours
    statut: 'brouillon',
    totalHT: totalHT.toFixed(2),
    totalTVA: totalTVA.toFixed(2),
    totalTTC: totalTTC.toFixed(2),
    notes: `Devis généré automatiquement par IA à partir de l'analyse #${analyseId}`,
  };
  
  const devis = await createDevis(devisData);
  if (!devis) return null;
  
  // Créer les lignes du devis
  for (const suggestion of toutesLesSuggestions) {
    const prixUnitaire = parseFloat(suggestion.prixEstime || '0');
    const quantite = parseFloat(suggestion.quantiteSuggeree || '1');
    const montantHT = prixUnitaire * quantite;
    const montantTVA = montantHT * (tauxTVA / 100);
    const montantTTC = montantHT + montantTVA;
    
    await createLigneDevis({
      devisId: devis.id,
      designation: suggestion.nomArticle,
      description: suggestion.description,
      quantite: suggestion.quantiteSuggeree || '1',
      unite: suggestion.unite || 'unité',
      prixUnitaireHT: prixUnitaire.toFixed(2),
      tauxTVA: tauxTVA.toString(),
      montantHT: montantHT.toFixed(2),
      montantTVA: montantTVA.toFixed(2),
      montantTTC: montantTTC.toFixed(2),
    });
  }
  
  // Enregistrer le lien analyse-devis
  await saveDevisGenereIA({
    analyseId,
    devisId: devis.id,
    montantEstime: totalTTC.toFixed(2),
  });
  
  return devis;
}


// ============================================================================
// SYNCHRONISATION COMPTABLE AUTOMATIQUE
// ============================================================================

export async function saveSyncConfigComptable(data: Partial<InsertConfigurationComptable> & { artisanId: number }): Promise<ConfigurationComptable | null> {
  const db = await getDb();
  if (!db) return null;
  
  const existing = await getConfigurationComptable(data.artisanId);
  if (existing) {
    await db.update(configurationsComptables).set(data).where(eq(configurationsComptables.artisanId, data.artisanId));
  } else {
    await db.insert(configurationsComptables).values(data);
  }
  return getConfigurationComptable(data.artisanId);
}

export async function getSyncLogsComptables(artisanId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Récupérer les exports récents comme logs
  const exportsRecents = await db.select().from(exportsComptables)
    .where(eq(exportsComptables.artisanId, artisanId))
    .orderBy(desc(exportsComptables.createdAt))
    .limit(50);
  
  return exportsRecents.map(e => ({
    id: e.id,
    type: 'export',
    logiciel: e.logiciel,
    statut: e.statut,
    nombreEcritures: e.nombreEcritures,
    createdAt: e.createdAt,
  }));
}

export async function getPendingItemsComptables(artisanId: number): Promise<{
  facturesEnAttente: number;
  paiementsEnAttente: number;
  erreurs: number;
  items: any[];
}> {
  const db = await getDb();
  if (!db) return { facturesEnAttente: 0, paiementsEnAttente: 0, erreurs: 0, items: [] };
  
  // Récupérer les factures non synchronisées (celles qui n'ont pas d'export récent)
  const facturesNonSync = await db.select().from(factures)
    .where(eq(factures.artisanId, artisanId))
    .orderBy(desc(factures.createdAt))
    .limit(100);
  
  // Simuler les éléments en attente (dans une vraie implémentation, on aurait une table de suivi)
  const items: any[] = [];
  let facturesEnAttente = 0;
  let paiementsEnAttente = 0;
  let erreurs = 0;
  
  // Marquer les factures récentes comme en attente de sync
  for (const f of facturesNonSync.slice(0, 5)) {
    if (f.statut === 'envoyee' || f.statut === 'payee') {
      items.push({
        type: 'facture',
        id: f.id,
        reference: f.numero,
        date: f.dateFacture,
        montant: f.totalTTC,
        statut: 'en_attente',
      });
      facturesEnAttente++;
    }
  }
  
  return { facturesEnAttente, paiementsEnAttente, erreurs, items };
}

export async function lancerSynchronisationComptable(artisanId: number): Promise<{
  facturesSyncees: number;
  paiementsSynces: number;
  erreurs: number;
}> {
  const db = await getDb();
  if (!db) return { facturesSyncees: 0, paiementsSynces: 0, erreurs: 0 };
  
  const config = await getConfigurationComptable(artisanId);
  if (!config) return { facturesSyncees: 0, paiementsSynces: 0, erreurs: 0 };
  
  // Simuler la synchronisation
  // Dans une vraie implémentation, on enverrait les données vers Sage/QuickBooks via leur API
  
  // Récupérer les factures à synchroniser
  const facturesASync = await db.select().from(factures)
    .where(
      and(
        eq(factures.artisanId, artisanId),
        or(
          eq(factures.statut, 'envoyee'),
          eq(factures.statut, 'payee')
        )
      )
    )
    .limit(50);
  
  let facturesSyncees = 0;
  let paiementsSynces = 0;
  let erreurs = 0;
  
  // Simuler le traitement
  for (const f of facturesASync) {
    // Simuler l'envoi vers le logiciel comptable
    // En production, on appellerait l'API du logiciel comptable ici
    facturesSyncees++;
    
    // Si la facture est payée, synchroniser aussi le paiement
    if (f.statut === 'payee') {
      paiementsSynces++;
    }
  }
  
  // Mettre à jour la date de dernière synchronisation
  await db.update(configurationsComptables)
    .set({ 
      derniereSync: new Date(),
      prochainSync: calculerProchaineSync(config.frequenceSync || 'manuel', config.heureSync || '02:00'),
    })
    .where(eq(configurationsComptables.artisanId, artisanId));
  
  // Créer un log d'export pour tracer la synchronisation
  await createExportComptable({
    artisanId,
    logiciel: config.logiciel || 'sage',
    formatExport: config.formatExport || 'fec',
    periodeDebut: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    periodeFin: new Date(),
    nombreEcritures: facturesSyncees + paiementsSynces,
    statut: 'termine',
  });
  
  return { facturesSyncees, paiementsSynces, erreurs };
}

function calculerProchaineSync(frequence: string, heure: string): Date {
  const maintenant = new Date();
  const [heures, minutes] = heure.split(':').map(Number);
  
  const prochaine = new Date(maintenant);
  prochaine.setHours(heures, minutes, 0, 0);
  
  switch (frequence) {
    case 'quotidien':
      if (prochaine <= maintenant) {
        prochaine.setDate(prochaine.getDate() + 1);
      }
      break;
    case 'hebdomadaire':
      prochaine.setDate(prochaine.getDate() + 7);
      break;
    case 'mensuel':
      prochaine.setMonth(prochaine.getMonth() + 1);
      break;
    default:
      return maintenant;
  }
  
  return prochaine;
}

export async function retrySyncItem(artisanId: number, type: string, id: number): Promise<boolean> {
  // Dans une vraie implémentation, on réessaierait de synchroniser l'élément spécifique
  // Pour l'instant, on simule le succès
  return true;
}


// ============================================================================
// PREFERENCES COULEURS CALENDRIER
// ============================================================================
export async function getCouleursCalendrier(artisanId: number): Promise<Record<number, string>> {
  const db = await getDb();
  if (!db) return {};
  
  const prefs = await db.select()
    .from(preferencesCouleursCalendrier)
    .where(eq(preferencesCouleursCalendrier.artisanId, artisanId));
  
  const result: Record<number, string> = {};
  for (const pref of prefs) {
    result[pref.interventionId] = pref.couleur;
  }
  return result;
}

export async function setCouleurIntervention(
  artisanId: number, 
  interventionId: number, 
  couleur: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Vérifier si une préférence existe déjà
  const existing = await db.select()
    .from(preferencesCouleursCalendrier)
    .where(and(
      eq(preferencesCouleursCalendrier.artisanId, artisanId),
      eq(preferencesCouleursCalendrier.interventionId, interventionId)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    // Mettre à jour
    await db.update(preferencesCouleursCalendrier)
      .set({ couleur, updatedAt: new Date() })
      .where(and(
        eq(preferencesCouleursCalendrier.artisanId, artisanId),
        eq(preferencesCouleursCalendrier.interventionId, interventionId)
      ));
  } else {
    // Créer
    await db.insert(preferencesCouleursCalendrier).values({
      artisanId,
      interventionId,
      couleur,
    });
  }
}

export async function deleteCouleurIntervention(
  artisanId: number, 
  interventionId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(preferencesCouleursCalendrier)
    .where(and(
      eq(preferencesCouleursCalendrier.artisanId, artisanId),
      eq(preferencesCouleursCalendrier.interventionId, interventionId)
    ));
}

export async function setCouleursMultiples(
  artisanId: number, 
  couleurs: Record<number, string>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  for (const [interventionId, couleur] of Object.entries(couleurs)) {
    await setCouleurIntervention(artisanId, parseInt(interventionId), couleur);
  }
}


// ============================================================================
// MODELES DEVIS FUNCTIONS
// ============================================================================

export async function getModelesDevisByArtisanId(artisanId: number): Promise<ModeleDevis[]> {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select()
    .from(modelesDevis)
    .where(eq(modelesDevis.artisanId, artisanId))
    .orderBy(desc(modelesDevis.createdAt));
}

export async function getModeleDevisById(modeleId: number): Promise<ModeleDevis | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(modelesDevis)
    .where(eq(modelesDevis.id, modeleId))
    .limit(1);
  
  return result[0] || null;
}

export async function createModeleDevis(
  artisanId: number,
  data: {
    nom: string;
    description?: string;
    notes?: string;
    isDefault?: boolean;
  }
): Promise<ModeleDevis> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(modelesDevis).values({
    artisanId,
    nom: data.nom,
    description: data.description,
    notes: data.notes,
    isDefault: data.isDefault || false,
  });
  
  const id = result[0].insertId as number;
  const created = await getModeleDevisById(id);
  if (!created) throw new Error("Failed to create modele devis");
  
  return created;
}

export async function updateModeleDevis(
  modeleId: number,
  data: Partial<{
    nom: string;
    description: string;
    notes: string;
    isDefault: boolean;
  }>
): Promise<ModeleDevis | null> {
  const db = await getDb();
  if (!db) return null;
  
  await db
    .update(modelesDevis)
    .set(data)
    .where(eq(modelesDevis.id, modeleId));
  
  return await getModeleDevisById(modeleId);
}

export async function deleteModeleDevis(modeleId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Supprimer les lignes d'abord
  await db
    .delete(modelesDevisLignes)
    .where(eq(modelesDevisLignes.modeleId, modeleId));
  
  // Puis le modèle
  await db
    .delete(modelesDevis)
    .where(eq(modelesDevis.id, modeleId));
}

export async function getModeleDevisLignes(modeleId: number): Promise<ModeleDevisLigne[]> {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select()
    .from(modelesDevisLignes)
    .where(eq(modelesDevisLignes.modeleId, modeleId))
    .orderBy(asc(modelesDevisLignes.ordre));
}

export async function addLigneToModeleDevis(
  modeleId: number,
  data: {
    articleId?: number;
    designation: string;
    description?: string;
    quantite: number;
    unite: string;
    prixUnitaireHT: number;
    tauxTVA: number;
    remise?: number;
    ordre?: number;
  }
): Promise<ModeleDevisLigne> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(modelesDevisLignes).values({
    modeleId,
    articleId: data.articleId,
    designation: data.designation,
    description: data.description,
    quantite: data.quantite.toString(),
    unite: data.unite,
    prixUnitaireHT: data.prixUnitaireHT.toString(),
    tauxTVA: data.tauxTVA.toString(),
    remise: data.remise?.toString() || "0",
    ordre: data.ordre || 1,
  });
  
  const id = result[0].insertId as number;
  const lignes = await db
    .select()
    .from(modelesDevisLignes)
    .where(eq(modelesDevisLignes.id, id))
    .limit(1);
  
  if (!lignes[0]) throw new Error("Failed to create ligne");
  return lignes[0];
}

export async function deleteLigneFromModeleDevis(ligneId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db
    .delete(modelesDevisLignes)
    .where(eq(modelesDevisLignes.id, ligneId));
}

// Export types for use in other modules
export type {
  Devis,
  DevisLigne,
  Facture,
  FactureLigne,
  Artisan,
  Client,
};
