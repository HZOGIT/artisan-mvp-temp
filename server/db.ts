import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, and, or, like, desc, asc, sql, inArray, gte, lte, isNull, between, ne } from "drizzle-orm";
import { 
  users, User, InsertUser,
  artisans, Artisan, InsertArtisan,
  clients, Client, InsertClient,
  bibliothequeArticles, BibliothequeArticle, InsertBibliothequeArticle,
  articlesArtisan, ArticleArtisan, InsertArticleArtisan,
  devis, Devis, InsertDevis,
  devisLignes, DevisLigne, InsertDevisLigne,
  factures, Facture, InsertFacture,
  facturesLignes, FactureLigne, InsertFactureLigne,
  interventions, Intervention, InsertIntervention,
  notifications, Notification, InsertNotification,
  parametresArtisan, ParametresArtisan, InsertParametresArtisan,
  signaturesDevis, SignatureDevis, InsertSignatureDevis,
  stocks, Stock, InsertStock,
  mouvementsStock, MouvementStock, InsertMouvementStock,
  fournisseurs, Fournisseur, InsertFournisseur,
  articlesFournisseurs, ArticleFournisseur, InsertArticleFournisseur,
  smsVerifications, SmsVerification, InsertSmsVerification,
  relancesDevis, RelanceDevis, InsertRelanceDevis,
  modelesEmail, ModeleEmail, InsertModeleEmail,
  commandesFournisseurs, CommandeFournisseur, InsertCommandeFournisseur,
  lignesCommandesFournisseurs, LigneCommandeFournisseur, InsertLigneCommandeFournisseur,
  paiementsStripe, PaiementStripe, InsertPaiementStripe,
  modelesDevis, ModeleDevis, InsertModeleDevis,
  modelesDevisLignes, ModeleDevisLigne, InsertModeleDevisLigne
} from "../drizzle/schema";

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;
let _connectionInProgress = false;

function parseDatabaseUrl(url: string) {
  try {
    const dbUrl = new URL(url);
    return {
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port) || 3306,
      user: decodeURIComponent(dbUrl.username),
      password: decodeURIComponent(dbUrl.password),
      database: dbUrl.pathname.substring(1).split('?')[0],
      ssl: dbUrl.searchParams.get('ssl') ? JSON.parse(dbUrl.searchParams.get('ssl')!) : undefined,
    };
  } catch (error) {
    console.error('[Database] Failed to parse DATABASE_URL:', error);
    throw new Error('Invalid DATABASE_URL format');
  }
}

export async function getDb() {
  if (_db) return _db;

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
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not defined');
    }
    
    const dbConfig = parseDatabaseUrl(databaseUrl);
    
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

    const connection = await _pool.getConnection();
    await connection.ping();
    connection.release();

    _db = drizzle(_pool);
    console.log('[Database] Connected successfully');
    return _db;
  } catch (error) {
    console.error('[Database] Connection failed:', error);
    _db = null;
    throw error;
  } finally {
    _connectionInProgress = false;
  }
}

export function getPool() {
  return _pool;
}

// ============================================================================
// USERS
// ============================================================================

export async function getUserById(id: number): Promise<User | undefined> {
  const db = await getDb();
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb();
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function createUser(data: InsertUser): Promise<User> {
  const db = await getDb();
  await db.insert(users).values(data);
  const result = await db.select().from(users).where(eq(users.email, data.email!)).limit(1);
  return result[0];
}

export async function updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
  const db = await getDb();
  await db.update(users).set(data).where(eq(users.id, id));
  return getUserById(id);
}

// ============================================================================
// ARTISANS
// ============================================================================

export async function getArtisanById(id: number): Promise<Artisan | undefined> {
  const db = await getDb();
  const result = await db.select().from(artisans).where(eq(artisans.id, id)).limit(1);
  return result[0];
}

export async function getArtisanByUserId(userId: number): Promise<Artisan | undefined> {
  const db = await getDb();
  const result = await db.select().from(artisans).where(eq(artisans.userId, userId)).limit(1);
  return result[0];
}

export async function createArtisan(data: InsertArtisan): Promise<Artisan> {
  const db = await getDb();
  await db.insert(artisans).values(data);
  const result = await db.select().from(artisans).where(eq(artisans.userId, data.userId)).limit(1);
  return result[0];
}

export async function updateArtisan(id: number, data: Partial<InsertArtisan>): Promise<Artisan | undefined> {
  const db = await getDb();
  await db.update(artisans).set(data).where(eq(artisans.id, id));
  return getArtisanById(id);
}

// ============================================================================
// CLIENTS
// ============================================================================

export async function getClientById(id: number): Promise<Client | undefined> {
  const db = await getDb();
  const result = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return result[0];
}

export async function getClientsByArtisanId(artisanId: number): Promise<Client[]> {
  const db = await getDb();
  return await db.select().from(clients).where(eq(clients.artisanId, artisanId)).orderBy(desc(clients.createdAt));
}

export async function createClient(artisanId: number, data: Omit<InsertClient, 'artisanId'>): Promise<Client> {
  const db = await getDb();
  const clientData: InsertClient = { ...data, artisanId };
  await db.insert(clients).values(clientData);
  const result = await db.select().from(clients)
    .where(and(eq(clients.artisanId, artisanId), eq(clients.nom, data.nom)))
    .orderBy(desc(clients.createdAt))
    .limit(1);
  return result[0];
}

export async function updateClient(id: number, data: Partial<InsertClient>): Promise<Client | undefined> {
  const db = await getDb();
  await db.update(clients).set(data).where(eq(clients.id, id));
  return getClientById(id);
}

export async function deleteClient(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(clients).where(eq(clients.id, id));
}

export async function searchClients(artisanId: number, query: string): Promise<Client[]> {
  const db = await getDb();
  const searchTerm = `%${query}%`;
  return await db.select().from(clients)
    .where(and(
      eq(clients.artisanId, artisanId),
      or(
        like(clients.nom, searchTerm),
        like(clients.prenom, searchTerm),
        like(clients.email, searchTerm),
        like(clients.telephone, searchTerm)
      )
    ))
    .orderBy(desc(clients.createdAt));
}

// ============================================================================
// BIBLIOTHEQUE ARTICLES
// ============================================================================

export async function getBibliothequeArticles(metier?: string, categorie?: string): Promise<BibliothequeArticle[]> {
  const db = await getDb();
  let query = db.select().from(bibliothequeArticles);
  
  const conditions = [];
  if (metier) conditions.push(eq(bibliothequeArticles.metier, metier as any));
  if (categorie) conditions.push(eq(bibliothequeArticles.categorie, categorie));
  
  if (conditions.length > 0) {
    return await query.where(and(...conditions));
  }
  return await query;
}

export async function searchArticles(query: string, metier?: string): Promise<BibliothequeArticle[]> {
  const db = await getDb();
  const searchTerm = `%${query}%`;
  const conditions = [
    or(
      like(bibliothequeArticles.designation, searchTerm),
      like(bibliothequeArticles.reference, searchTerm),
      like(bibliothequeArticles.description, searchTerm)
    )
  ];
  if (metier) {
    conditions.push(eq(bibliothequeArticles.metier, metier as any));
  }
  return await db.select().from(bibliothequeArticles).where(and(...conditions)).limit(50);
}

export async function createBibliothequeArticle(data: InsertBibliothequeArticle): Promise<BibliothequeArticle> {
  const db = await getDb();
  await db.insert(bibliothequeArticles).values(data);
  const result = await db.select().from(bibliothequeArticles)
    .where(eq(bibliothequeArticles.reference, data.reference))
    .limit(1);
  return result[0];
}

export async function updateBibliothequeArticle(id: number, data: Partial<InsertBibliothequeArticle>): Promise<BibliothequeArticle | undefined> {
  const db = await getDb();
  await db.update(bibliothequeArticles).set(data).where(eq(bibliothequeArticles.id, id));
  const result = await db.select().from(bibliothequeArticles).where(eq(bibliothequeArticles.id, id)).limit(1);
  return result[0];
}

export async function deleteBibliothequeArticle(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(bibliothequeArticles).where(eq(bibliothequeArticles.id, id));
}

export async function seedBibliothequeArticles(articles: InsertBibliothequeArticle[]): Promise<void> {
  const db = await getDb();
  for (const article of articles) {
    try {
      await db.insert(bibliothequeArticles).values(article);
    } catch (e) {
      // Skip duplicates
    }
  }
}

// ============================================================================
// ARTICLES ARTISAN (Custom articles)
// ============================================================================

export async function getArticlesArtisan(artisanId: number): Promise<ArticleArtisan[]> {
  const db = await getDb();
  return await db.select().from(articlesArtisan).where(eq(articlesArtisan.artisanId, artisanId));
}

export async function createArticleArtisan(artisanId: number, data: Omit<InsertArticleArtisan, 'artisanId'>): Promise<ArticleArtisan> {
  const db = await getDb();
  await db.insert(articlesArtisan).values({ ...data, artisanId });
  const result = await db.select().from(articlesArtisan)
    .where(and(eq(articlesArtisan.artisanId, artisanId), eq(articlesArtisan.reference, data.reference)))
    .orderBy(desc(articlesArtisan.createdAt))
    .limit(1);
  return result[0];
}

export async function updateArticleArtisan(id: number, data: Partial<InsertArticleArtisan>): Promise<ArticleArtisan | undefined> {
  const db = await getDb();
  await db.update(articlesArtisan).set(data).where(eq(articlesArtisan.id, id));
  const result = await db.select().from(articlesArtisan).where(eq(articlesArtisan.id, id)).limit(1);
  return result[0];
}

export async function deleteArticleArtisan(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(articlesArtisan).where(eq(articlesArtisan.id, id));
}

// ============================================================================
// DEVIS (Quotes)
// ============================================================================

export async function getDevisByArtisanId(artisanId: number): Promise<Devis[]> {
  const db = await getDb();
  return await db.select().from(devis).where(eq(devis.artisanId, artisanId)).orderBy(desc(devis.createdAt));
}

export async function getDevisById(id: number): Promise<Devis | undefined> {
  const db = await getDb();
  const result = await db.select().from(devis).where(eq(devis.id, id)).limit(1);
  return result[0];
}

export async function getDevisByClientId(clientId: number): Promise<Devis[]> {
  const db = await getDb();
  return await db.select().from(devis).where(eq(devis.clientId, clientId)).orderBy(desc(devis.createdAt));
}

export async function getNextDevisNumber(artisanId: number): Promise<string> {
  const db = await getDb();
  const params = await db.select().from(parametresArtisan).where(eq(parametresArtisan.artisanId, artisanId)).limit(1);
  const prefix = params[0]?.prefixeDevis || 'DEV';
  const compteur = (params[0]?.compteurDevis || 0) + 1;
  
  // Update counter
  if (params[0]) {
    await db.update(parametresArtisan).set({ compteurDevis: compteur }).where(eq(parametresArtisan.artisanId, artisanId));
  } else {
    await db.insert(parametresArtisan).values({ artisanId, compteurDevis: compteur });
  }
  
  return `${prefix}-${String(compteur).padStart(5, '0')}`;
}

export async function createDevis(artisanId: number, data: Omit<InsertDevis, 'artisanId'>): Promise<Devis> {
  const db = await getDb();
  const numero = data.numero || await getNextDevisNumber(artisanId);
  await db.insert(devis).values({ ...data, artisanId, numero });
  const result = await db.select().from(devis)
    .where(and(eq(devis.artisanId, artisanId), eq(devis.numero, numero)))
    .limit(1);
  return result[0];
}

export async function updateDevis(id: number, data: Partial<InsertDevis>): Promise<Devis | undefined> {
  const db = await getDb();
  await db.update(devis).set(data).where(eq(devis.id, id));
  return getDevisById(id);
}

export async function deleteDevis(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(devisLignes).where(eq(devisLignes.devisId, id));
  await db.delete(devis).where(eq(devis.id, id));
}

export async function getDevisNonSignes(artisanId: number): Promise<Devis[]> {
  const db = await getDb();
  return await db.select().from(devis)
    .where(and(
      eq(devis.artisanId, artisanId),
      or(eq(devis.statut, 'brouillon'), eq(devis.statut, 'envoye'))
    ))
    .orderBy(desc(devis.createdAt));
}

// ============================================================================
// DEVIS LIGNES (Quote line items)
// ============================================================================

export async function getLignesDevisByDevisId(devisId: number): Promise<DevisLigne[]> {
  const db = await getDb();
  return await db.select().from(devisLignes).where(eq(devisLignes.devisId, devisId)).orderBy(asc(devisLignes.ordre));
}

export async function createLigneDevis(data: InsertDevisLigne): Promise<DevisLigne> {
  const db = await getDb();
  await db.insert(devisLignes).values(data);
  const result = await db.select().from(devisLignes)
    .where(eq(devisLignes.devisId, data.devisId))
    .orderBy(desc(devisLignes.id))
    .limit(1);
  return result[0];
}

export async function updateLigneDevis(id: number, data: Partial<InsertDevisLigne>): Promise<DevisLigne | undefined> {
  const db = await getDb();
  await db.update(devisLignes).set(data).where(eq(devisLignes.id, id));
  const result = await db.select().from(devisLignes).where(eq(devisLignes.id, id)).limit(1);
  return result[0];
}

export async function deleteLigneDevis(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(devisLignes).where(eq(devisLignes.id, id));
}

export async function recalculateDevisTotals(devisId: number): Promise<Devis | undefined> {
  const db = await getDb();
  const lignes = await getLignesDevisByDevisId(devisId);
  
  let totalHT = 0;
  let totalTVA = 0;
  
  for (const ligne of lignes) {
    const montantHT = parseFloat(ligne.montantHT?.toString() || '0');
    const montantTVA = parseFloat(ligne.montantTVA?.toString() || '0');
    totalHT += montantHT;
    totalTVA += montantTVA;
  }
  
  const totalTTC = totalHT + totalTVA;
  
  await db.update(devis).set({
    totalHT: totalHT.toFixed(2),
    totalTVA: totalTVA.toFixed(2),
    totalTTC: totalTTC.toFixed(2),
  }).where(eq(devis.id, devisId));
  
  return getDevisById(devisId);
}

// ============================================================================
// FACTURES (Invoices)
// ============================================================================

export async function getFacturesByArtisanId(artisanId: number): Promise<Facture[]> {
  const db = await getDb();
  return await db.select().from(factures).where(eq(factures.artisanId, artisanId)).orderBy(desc(factures.createdAt));
}

export async function getFactureById(id: number): Promise<Facture | undefined> {
  const db = await getDb();
  const result = await db.select().from(factures).where(eq(factures.id, id)).limit(1);
  return result[0];
}

export async function getFacturesByClientId(clientId: number): Promise<Facture[]> {
  const db = await getDb();
  return await db.select().from(factures).where(eq(factures.clientId, clientId)).orderBy(desc(factures.createdAt));
}

export async function getNextFactureNumber(artisanId: number): Promise<string> {
  const db = await getDb();
  const params = await db.select().from(parametresArtisan).where(eq(parametresArtisan.artisanId, artisanId)).limit(1);
  const prefix = params[0]?.prefixeFacture || 'FAC';
  const compteur = (params[0]?.compteurFacture || 0) + 1;
  
  if (params[0]) {
    await db.update(parametresArtisan).set({ compteurFacture: compteur }).where(eq(parametresArtisan.artisanId, artisanId));
  } else {
    await db.insert(parametresArtisan).values({ artisanId, compteurFacture: compteur });
  }
  
  return `${prefix}-${String(compteur).padStart(5, '0')}`;
}

export async function createFacture(artisanId: number, data: Omit<InsertFacture, 'artisanId'>): Promise<Facture> {
  const db = await getDb();
  const numero = data.numero || await getNextFactureNumber(artisanId);
  await db.insert(factures).values({ ...data, artisanId, numero });
  const result = await db.select().from(factures)
    .where(and(eq(factures.artisanId, artisanId), eq(factures.numero, numero)))
    .limit(1);
  return result[0];
}

export async function createFactureFromDevis(devisId: number): Promise<Facture> {
  const db = await getDb();
  const devisData = await getDevisById(devisId);
  if (!devisData) throw new Error('Devis not found');
  
  const lignesDevis = await getLignesDevisByDevisId(devisId);
  const numero = await getNextFactureNumber(devisData.artisanId);
  
  // Create facture
  await db.insert(factures).values({
    artisanId: devisData.artisanId,
    clientId: devisData.clientId,
    devisId: devisData.id,
    numero,
    objet: devisData.objet,
    conditionsPaiement: devisData.conditionsPaiement,
    notes: devisData.notes,
    totalHT: devisData.totalHT,
    totalTVA: devisData.totalTVA,
    totalTTC: devisData.totalTTC,
  });
  
  const factureResult = await db.select().from(factures)
    .where(eq(factures.numero, numero))
    .limit(1);
  const facture = factureResult[0];
  
  // Copy lignes
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
      montantTTC: ligne.montantTTC,
    });
  }
  
  // Update devis status
  await db.update(devis).set({ statut: 'accepte' }).where(eq(devis.id, devisId));
  
  return facture;
}

export async function updateFacture(id: number, data: Partial<InsertFacture>): Promise<Facture | undefined> {
  const db = await getDb();
  await db.update(factures).set(data).where(eq(factures.id, id));
  return getFactureById(id);
}

export async function deleteFacture(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(facturesLignes).where(eq(facturesLignes.factureId, id));
  await db.delete(factures).where(eq(factures.id, id));
}

// ============================================================================
// FACTURES LIGNES
// ============================================================================

export async function getLignesFacturesByFactureId(factureId: number): Promise<FactureLigne[]> {
  const db = await getDb();
  return await db.select().from(facturesLignes).where(eq(facturesLignes.factureId, factureId)).orderBy(asc(facturesLignes.ordre));
}

export async function createLigneFacture(data: InsertFactureLigne): Promise<FactureLigne> {
  const db = await getDb();
  await db.insert(facturesLignes).values(data);
  const result = await db.select().from(facturesLignes)
    .where(eq(facturesLignes.factureId, data.factureId))
    .orderBy(desc(facturesLignes.id))
    .limit(1);
  return result[0];
}

export async function recalculateFactureTotals(factureId: number): Promise<Facture | undefined> {
  const db = await getDb();
  const lignes = await getLignesFacturesByFactureId(factureId);
  
  let totalHT = 0;
  let totalTVA = 0;
  
  for (const ligne of lignes) {
    totalHT += parseFloat(ligne.montantHT?.toString() || '0');
    totalTVA += parseFloat(ligne.montantTVA?.toString() || '0');
  }
  
  const totalTTC = totalHT + totalTVA;
  
  await db.update(factures).set({
    totalHT: totalHT.toFixed(2),
    totalTVA: totalTVA.toFixed(2),
    totalTTC: totalTTC.toFixed(2),
  }).where(eq(factures.id, factureId));
  
  return getFactureById(factureId);
}

// ============================================================================
// INTERVENTIONS
// ============================================================================

export async function getInterventionsByArtisanId(artisanId: number): Promise<Intervention[]> {
  const db = await getDb();
  return await db.select().from(interventions).where(eq(interventions.artisanId, artisanId)).orderBy(desc(interventions.dateDebut));
}

export async function getInterventionById(id: number): Promise<Intervention | undefined> {
  const db = await getDb();
  const result = await db.select().from(interventions).where(eq(interventions.id, id)).limit(1);
  return result[0];
}

export async function getInterventionsByClientId(clientId: number): Promise<Intervention[]> {
  const db = await getDb();
  return await db.select().from(interventions).where(eq(interventions.clientId, clientId)).orderBy(desc(interventions.dateDebut));
}

export async function getUpcomingInterventions(artisanId: number, days: number = 7): Promise<Intervention[]> {
  const db = await getDb();
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);
  
  return await db.select().from(interventions)
    .where(and(
      eq(interventions.artisanId, artisanId),
      gte(interventions.dateDebut, now),
      lte(interventions.dateDebut, future)
    ))
    .orderBy(asc(interventions.dateDebut));
}

export async function createIntervention(data: InsertIntervention): Promise<Intervention> {
  const db = await getDb();
  await db.insert(interventions).values(data);
  const result = await db.select().from(interventions)
    .where(and(
      eq(interventions.artisanId, data.artisanId),
      eq(interventions.clientId, data.clientId),
      eq(interventions.titre, data.titre)
    ))
    .orderBy(desc(interventions.createdAt))
    .limit(1);
  return result[0];
}

export async function updateIntervention(id: number, data: Partial<InsertIntervention>): Promise<Intervention | undefined> {
  const db = await getDb();
  await db.update(interventions).set(data).where(eq(interventions.id, id));
  return getInterventionById(id);
}

export async function deleteIntervention(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(interventions).where(eq(interventions.id, id));
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export async function getNotificationsByArtisanId(artisanId: number): Promise<Notification[]> {
  const db = await getDb();
  return await db.select().from(notifications)
    .where(and(eq(notifications.artisanId, artisanId), eq(notifications.archived, false)))
    .orderBy(desc(notifications.createdAt));
}

export async function getUnreadNotificationsCount(artisanId: number): Promise<number> {
  const db = await getDb();
  const result = await db.select().from(notifications)
    .where(and(
      eq(notifications.artisanId, artisanId),
      eq(notifications.lu, false),
      eq(notifications.archived, false)
    ));
  return result.length;
}

export async function createNotification(data: InsertNotification): Promise<Notification> {
  const db = await getDb();
  await db.insert(notifications).values(data);
  const result = await db.select().from(notifications)
    .where(eq(notifications.artisanId, data.artisanId))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  return result[0];
}

export async function markNotificationAsRead(id: number): Promise<void> {
  const db = await getDb();
  await db.update(notifications).set({ lu: true }).where(eq(notifications.id, id));
}

export async function markAllNotificationsAsRead(artisanId: number): Promise<void> {
  const db = await getDb();
  await db.update(notifications).set({ lu: true }).where(eq(notifications.artisanId, artisanId));
}

export async function archiveNotification(id: number): Promise<void> {
  const db = await getDb();
  await db.update(notifications).set({ archived: true }).where(eq(notifications.id, id));
}

// ============================================================================
// PARAMETRES ARTISAN
// ============================================================================

export async function getParametresArtisan(artisanId: number): Promise<ParametresArtisan | undefined> {
  const db = await getDb();
  const result = await db.select().from(parametresArtisan).where(eq(parametresArtisan.artisanId, artisanId)).limit(1);
  return result[0];
}

export async function updateParametresArtisan(artisanId: number, data: Partial<InsertParametresArtisan>): Promise<ParametresArtisan> {
  const db = await getDb();
  const existing = await getParametresArtisan(artisanId);
  
  if (existing) {
    await db.update(parametresArtisan).set(data).where(eq(parametresArtisan.artisanId, artisanId));
  } else {
    await db.insert(parametresArtisan).values({ artisanId, ...data });
  }
  
  return (await getParametresArtisan(artisanId))!;
}

// ============================================================================
// STOCKS
// ============================================================================

export async function getStocksByArtisanId(artisanId: number): Promise<Stock[]> {
  const db = await getDb();
  return await db.select().from(stocks).where(eq(stocks.artisanId, artisanId));
}

export async function getStockById(id: number): Promise<Stock | undefined> {
  const db = await getDb();
  const result = await db.select().from(stocks).where(eq(stocks.id, id)).limit(1);
  return result[0];
}

export async function getLowStockItems(artisanId: number): Promise<Stock[]> {
  const db = await getDb();
  return await db.select().from(stocks)
    .where(and(
      eq(stocks.artisanId, artisanId),
      sql`${stocks.quantiteEnStock} <= ${stocks.seuilAlerte}`
    ));
}

export async function getStocksEnRupture(artisanId: number): Promise<Stock[]> {
  return getLowStockItems(artisanId);
}

export async function createStock(artisanId: number, data: Omit<InsertStock, 'artisanId'>): Promise<Stock> {
  const db = await getDb();
  await db.insert(stocks).values({ ...data, artisanId });
  const result = await db.select().from(stocks)
    .where(and(eq(stocks.artisanId, artisanId), eq(stocks.reference, data.reference)))
    .orderBy(desc(stocks.createdAt))
    .limit(1);
  return result[0];
}

export async function updateStock(id: number, data: Partial<InsertStock>): Promise<Stock | undefined> {
  const db = await getDb();
  await db.update(stocks).set(data).where(eq(stocks.id, id));
  return getStockById(id);
}

export async function deleteStock(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(stocks).where(eq(stocks.id, id));
}

export async function adjustStock(id: number, quantity: number, type: 'entree' | 'sortie' | 'ajustement', motif?: string, reference?: string): Promise<Stock | undefined> {
  const db = await getDb();
  const stock = await getStockById(id);
  if (!stock) return undefined;

  const currentQty = parseFloat(stock.quantiteEnStock?.toString() || '0');
  const newQty = type === 'sortie' ? currentQty - quantity : currentQty + quantity;

  await db.update(stocks).set({ quantiteEnStock: newQty.toString() }).where(eq(stocks.id, id));

  // Log movement
  await db.insert(mouvementsStock).values({
    stockId: id,
    type,
    quantite: quantity.toString(),
    motif: motif || (type === 'entree' ? 'Ajout manuel' : type === 'sortie' ? 'Retrait manuel' : 'Ajustement'),
    reference: reference || undefined,
  });

  return getStockById(id);
}

export async function getMouvementsStock(stockId: number): Promise<MouvementStock[]> {
  const db = await getDb();
  return await db.select().from(mouvementsStock)
    .where(eq(mouvementsStock.stockId, stockId))
    .orderBy(desc(mouvementsStock.createdAt));
}

// ============================================================================
// FOURNISSEURS
// ============================================================================

export async function getFournisseursByArtisanId(artisanId: number): Promise<Fournisseur[]> {
  const db = await getDb();
  return await db.select().from(fournisseurs).where(eq(fournisseurs.artisanId, artisanId));
}

export async function getFournisseurById(id: number): Promise<Fournisseur | undefined> {
  const db = await getDb();
  const result = await db.select().from(fournisseurs).where(eq(fournisseurs.id, id)).limit(1);
  return result[0];
}

export async function createFournisseur(artisanId: number, data: Omit<InsertFournisseur, 'artisanId'>): Promise<Fournisseur> {
  const db = await getDb();
  await db.insert(fournisseurs).values({ ...data, artisanId });
  const result = await db.select().from(fournisseurs)
    .where(and(eq(fournisseurs.artisanId, artisanId), eq(fournisseurs.nom, data.nom)))
    .orderBy(desc(fournisseurs.createdAt))
    .limit(1);
  return result[0];
}

export async function updateFournisseur(id: number, data: Partial<InsertFournisseur>): Promise<Fournisseur | undefined> {
  const db = await getDb();
  await db.update(fournisseurs).set(data).where(eq(fournisseurs.id, id));
  return getFournisseurById(id);
}

export async function deleteFournisseur(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(fournisseurs).where(eq(fournisseurs.id, id));
}

export async function getFournisseurArticles(fournisseurId: number): Promise<ArticleFournisseur[]> {
  const db = await getDb();
  return await db.select().from(articlesFournisseurs).where(eq(articlesFournisseurs.fournisseurId, fournisseurId));
}

export async function getArticleFournisseurs(articleId: number): Promise<ArticleFournisseur[]> {
  const db = await getDb();
  return await db.select().from(articlesFournisseurs).where(eq(articlesFournisseurs.articleId, articleId));
}

export async function createArticleFournisseur(data: InsertArticleFournisseur): Promise<ArticleFournisseur> {
  const db = await getDb();
  await db.insert(articlesFournisseurs).values(data);
  const result = await db.select().from(articlesFournisseurs)
    .where(and(
      eq(articlesFournisseurs.fournisseurId, data.fournisseurId),
      eq(articlesFournisseurs.articleId, data.articleId)
    ))
    .limit(1);
  return result[0];
}

export async function updateArticleFournisseur(id: number, data: Partial<InsertArticleFournisseur>): Promise<void> {
  const db = await getDb();
  await db.update(articlesFournisseurs).set(data).where(eq(articlesFournisseurs.id, id));
}

export async function deleteArticleFournisseur(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(articlesFournisseurs).where(eq(articlesFournisseurs.id, id));
}

export async function getPerformancesFournisseurs(artisanId: number): Promise<any[]> {
  const db = await getDb();
  const fournisseursList = await getFournisseursByArtisanId(artisanId);
  // Simplified performance data
  return fournisseursList.map(f => ({
    fournisseur: f,
    totalCommandes: 0,
    delaiMoyen: 0,
    tauxConformite: 100,
  }));
}

// ============================================================================
// COMMANDES FOURNISSEURS
// ============================================================================

export async function getCommandesFournisseursByArtisanId(artisanId: number): Promise<CommandeFournisseur[]> {
  const db = await getDb();
  return await db.select().from(commandesFournisseurs)
    .where(eq(commandesFournisseurs.artisanId, artisanId))
    .orderBy(desc(commandesFournisseurs.createdAt));
}

export async function getCommandeFournisseurById(id: number): Promise<CommandeFournisseur | undefined> {
  const db = await getDb();
  const result = await db.select().from(commandesFournisseurs).where(eq(commandesFournisseurs.id, id)).limit(1);
  return result[0];
}

export async function createCommandeFournisseur(data: InsertCommandeFournisseur): Promise<CommandeFournisseur> {
  const db = await getDb();
  await db.insert(commandesFournisseurs).values(data);
  const result = await db.select().from(commandesFournisseurs)
    .where(eq(commandesFournisseurs.artisanId, data.artisanId))
    .orderBy(desc(commandesFournisseurs.createdAt))
    .limit(1);
  return result[0];
}

export async function updateCommandeFournisseur(id: number, data: Partial<InsertCommandeFournisseur>): Promise<void> {
  const db = await getDb();
  await db.update(commandesFournisseurs).set(data).where(eq(commandesFournisseurs.id, id));
}

export async function deleteCommandeFournisseur(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(lignesCommandesFournisseurs).where(eq(lignesCommandesFournisseurs.commandeId, id));
  await db.delete(commandesFournisseurs).where(eq(commandesFournisseurs.id, id));
}

export async function getLignesCommandeFournisseur(commandeId: number): Promise<LigneCommandeFournisseur[]> {
  const db = await getDb();
  return await db.select().from(lignesCommandesFournisseurs).where(eq(lignesCommandesFournisseurs.commandeId, commandeId));
}

export async function createLigneCommandeFournisseur(data: InsertLigneCommandeFournisseur): Promise<LigneCommandeFournisseur> {
  const db = await getDb();
  await db.insert(lignesCommandesFournisseurs).values(data);
  const result = await db.select().from(lignesCommandesFournisseurs)
    .where(eq(lignesCommandesFournisseurs.commandeId, data.commandeId))
    .orderBy(desc(lignesCommandesFournisseurs.id))
    .limit(1);
  return result[0];
}

export async function getRapportCommandeFournisseur(artisanId: number): Promise<any> {
  const commandes = await getCommandesFournisseursByArtisanId(artisanId);
  return {
    totalCommandes: commandes.length,
    commandesEnCours: commandes.filter(c => c.statut === 'en_cours').length,
    commandesLivrees: commandes.filter(c => c.statut === 'livree').length,
  };
}

// ============================================================================
// SIGNATURES DEVIS
// ============================================================================

export async function getSignatureByDevisId(devisId: number): Promise<SignatureDevis | undefined> {
  const db = await getDb();
  const result = await db.select().from(signaturesDevis).where(eq(signaturesDevis.devisId, devisId)).limit(1);
  return result[0];
}

export async function getSignatureByToken(token: string): Promise<SignatureDevis | undefined> {
  const db = await getDb();
  const result = await db.select().from(signaturesDevis).where(eq(signaturesDevis.token, token)).limit(1);
  return result[0];
}

export async function createSignatureDevis(data: InsertSignatureDevis): Promise<SignatureDevis> {
  const db = await getDb();
  await db.insert(signaturesDevis).values(data);
  return (await getSignatureByToken(data.token))!;
}

export async function signDevis(token: string, signatureData: string, signataireName: string, ipAddress: string, userAgent: string): Promise<void> {
  const db = await getDb();
  const signature = await getSignatureByToken(token);
  if (!signature) throw new Error('Signature not found');
  
  await db.update(signaturesDevis).set({
    signatureData,
    signataireName,
    ipAddress,
    userAgent,
    signedAt: new Date(),
  }).where(eq(signaturesDevis.token, token));
  
  // Update devis status
  await db.update(devis).set({ statut: 'accepte' }).where(eq(devis.id, signature.devisId));
}

// ============================================================================
// SMS VERIFICATIONS
// ============================================================================

export async function createSmsVerification(data: InsertSmsVerification): Promise<SmsVerification> {
  const db = await getDb();
  await db.insert(smsVerifications).values(data);
  const result = await db.select().from(smsVerifications)
    .where(eq(smsVerifications.signatureId, data.signatureId))
    .orderBy(desc(smsVerifications.createdAt))
    .limit(1);
  return result[0];
}

export async function getSmsVerificationBySignature(signatureId: number): Promise<SmsVerification | undefined> {
  const db = await getDb();
  const result = await db.select().from(smsVerifications)
    .where(eq(smsVerifications.signatureId, signatureId))
    .orderBy(desc(smsVerifications.createdAt))
    .limit(1);
  return result[0];
}

export async function verifySmsCode(signatureId: number, code: string): Promise<boolean> {
  const db = await getDb();
  const verification = await getSmsVerificationBySignature(signatureId);
  if (!verification) return false;
  if (verification.code !== code) return false;
  if (new Date() > verification.expiresAt) return false;
  
  await db.update(smsVerifications).set({ verified: true }).where(eq(smsVerifications.id, verification.id));
  return true;
}

// ============================================================================
// RELANCES DEVIS
// ============================================================================

export async function getRelancesDevis(artisanId: number): Promise<RelanceDevis[]> {
  const db = await getDb();
  return await db.select().from(relancesDevis)
    .where(eq(relancesDevis.artisanId, artisanId))
    .orderBy(desc(relancesDevis.createdAt));
}

export async function createRelanceDevis(data: InsertRelanceDevis): Promise<RelanceDevis> {
  const db = await getDb();
  await db.insert(relancesDevis).values(data);
  const result = await db.select().from(relancesDevis)
    .where(eq(relancesDevis.devisId, data.devisId))
    .orderBy(desc(relancesDevis.createdAt))
    .limit(1);
  return result[0];
}

export async function getLastRelanceDate(devisId: number): Promise<Date | null> {
  const db = await getDb();
  const result = await db.select().from(relancesDevis)
    .where(eq(relancesDevis.devisId, devisId))
    .orderBy(desc(relancesDevis.createdAt))
    .limit(1);
  return result[0]?.createdAt || null;
}

// ============================================================================
// MODELES EMAIL
// ============================================================================

export async function getModelesEmailByArtisanId(artisanId: number): Promise<ModeleEmail[]> {
  const db = await getDb();
  return await db.select().from(modelesEmail).where(eq(modelesEmail.artisanId, artisanId));
}

export async function getModeleEmailById(id: number): Promise<ModeleEmail | undefined> {
  const db = await getDb();
  const result = await db.select().from(modelesEmail).where(eq(modelesEmail.id, id)).limit(1);
  return result[0];
}

export async function getModelesEmailByType(artisanId: number, type: string): Promise<ModeleEmail[]> {
  const db = await getDb();
  return await db.select().from(modelesEmail)
    .where(and(eq(modelesEmail.artisanId, artisanId), eq(modelesEmail.type, type)));
}

export async function getDefaultModeleEmail(artisanId: number, type: string): Promise<ModeleEmail | undefined> {
  const db = await getDb();
  const result = await db.select().from(modelesEmail)
    .where(and(
      eq(modelesEmail.artisanId, artisanId),
      eq(modelesEmail.type, type),
      eq(modelesEmail.isDefault, true)
    ))
    .limit(1);
  return result[0];
}

export async function createModeleEmail(data: InsertModeleEmail): Promise<ModeleEmail> {
  const db = await getDb();
  await db.insert(modelesEmail).values(data);
  const result = await db.select().from(modelesEmail)
    .where(and(eq(modelesEmail.artisanId, data.artisanId), eq(modelesEmail.nom, data.nom)))
    .orderBy(desc(modelesEmail.createdAt))
    .limit(1);
  return result[0];
}

export async function updateModeleEmail(id: number, data: Partial<InsertModeleEmail>): Promise<void> {
  const db = await getDb();
  await db.update(modelesEmail).set(data).where(eq(modelesEmail.id, id));
}

export async function deleteModeleEmail(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(modelesEmail).where(eq(modelesEmail.id, id));
}

// ============================================================================
// PAIEMENTS STRIPE
// ============================================================================

export async function getPaiementsByFactureId(factureId: number): Promise<PaiementStripe[]> {
  const db = await getDb();
  return await db.select().from(paiementsStripe).where(eq(paiementsStripe.factureId, factureId));
}

export async function createPaiementStripe(data: InsertPaiementStripe): Promise<PaiementStripe> {
  const db = await getDb();
  await db.insert(paiementsStripe).values(data);
  const result = await db.select().from(paiementsStripe)
    .where(eq(paiementsStripe.stripePaymentIntentId, data.stripePaymentIntentId))
    .limit(1);
  return result[0];
}

// ============================================================================
// DASHBOARD STATS
// ============================================================================

export async function getDashboardStats(artisanId: number): Promise<any> {
  const db = await getDb();
  
  const clientsList = await db.select().from(clients).where(eq(clients.artisanId, artisanId));
  const devisList = await db.select().from(devis).where(eq(devis.artisanId, artisanId));
  const facturesList = await db.select().from(factures).where(eq(factures.artisanId, artisanId));
  const interventionsList = await db.select().from(interventions).where(eq(interventions.artisanId, artisanId));
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  
  const facturesPayees = facturesList.filter(f => f.statut === 'payee');
  const facturesThisMonth = facturesPayees.filter(f => {
    const date = f.datePaiement ? new Date(f.datePaiement) : new Date(f.createdAt);
    return date >= startOfMonth;
  });
  const caMonth = facturesThisMonth.reduce((sum, f) => sum + parseFloat(f.totalTTC?.toString() || '0'), 0);
  
  const facturesThisYear = facturesPayees.filter(f => {
    const date = f.datePaiement ? new Date(f.datePaiement) : new Date(f.createdAt);
    return date >= startOfYear;
  });
  const caYear = facturesThisYear.reduce((sum, f) => sum + parseFloat(f.totalTTC?.toString() || '0'), 0);
  
  const devisEnCours = devisList.filter(d => d.statut === 'brouillon' || d.statut === 'envoye').length;
  
  const facturesImpayeesList = facturesList.filter(f => f.statut !== 'payee' && f.statut !== 'annulee');
  const facturesImpayees = {
    count: facturesImpayeesList.length,
    total: facturesImpayeesList.reduce((sum, f) => sum + parseFloat(f.totalTTC?.toString() || '0'), 0)
  };
  
  const interventionsAVenir = interventionsList.filter(i => {
    if (i.statut !== 'planifiee') return false;
    const dateDebut = new Date(i.dateDebut);
    return dateDebut >= now;
  }).length;
  
  return {
    caMonth,
    caYear,
    devisEnCours,
    facturesImpayees,
    totalClients: clientsList.length,
    interventionsAVenir,
    totalDevis: devisList.length,
    totalFactures: facturesList.length,
    totalInterventions: interventionsList.length,
  };
}

export async function getMonthlyCAStats(artisanId: number, months: number = 12): Promise<any[]> {
  const db = await getDb();
  const facturesList = await db.select().from(factures)
    .where(and(eq(factures.artisanId, artisanId), eq(factures.statut, 'payee')));
  
  const stats: any[] = [];
  const now = new Date();
  
  for (let i = 0; i < months; i++) {
    const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    
    const monthFactures = facturesList.filter(f => {
      const date = new Date(f.dateFacture);
      return date >= month && date <= monthEnd;
    });
    
    stats.unshift({
      month: month.toISOString().slice(0, 7),
      ca: monthFactures.reduce((sum, f) => sum + parseFloat(f.totalTTC?.toString() || '0'), 0),
      count: monthFactures.length,
    });
  }
  
  return stats;
}

export async function getTopClients(artisanId: number, limit: number = 5): Promise<any[]> {
  const db = await getDb();
  const facturesList = await db.select().from(factures).where(eq(factures.artisanId, artisanId));
  const clientsList = await db.select().from(clients).where(eq(clients.artisanId, artisanId));
  
  const clientStats = clientsList.map(client => {
    const clientFactures = facturesList.filter(f => f.clientId === client.id);
    return {
      client,
      totalCA: clientFactures.reduce((sum, f) => sum + parseFloat(f.totalTTC?.toString() || '0'), 0),
      facturesCount: clientFactures.length,
    };
  });
  
  return clientStats.sort((a, b) => b.totalCA - a.totalCA).slice(0, limit);
}

export async function getConversionRate(artisanId: number): Promise<number> {
  const db = await getDb();
  const devisList = await db.select().from(devis).where(eq(devis.artisanId, artisanId));
  
  if (devisList.length === 0) return 0;
  
  const acceptes = devisList.filter(d => d.statut === 'accepte').length;
  return Math.round((acceptes / devisList.length) * 100);
}

export async function getClientEvolution(artisanId: number, months: number = 6): Promise<any[]> {
  const db = await getDb();
  const clientsList = await db.select().from(clients).where(eq(clients.artisanId, artisanId));
  
  const stats: any[] = [];
  const now = new Date();
  
  for (let i = 0; i < months; i++) {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const count = clientsList.filter(c => new Date(c.createdAt) <= monthEnd).length;
    
    stats.unshift({
      month: new Date(now.getFullYear(), now.getMonth() - i, 1).toISOString().slice(0, 7),
      count,
    });
  }
  
  return stats;
}

export async function getYearlyComparison(artisanId: number): Promise<any> {
  const db = await getDb();
  const now = new Date();
  const thisYearStart = new Date(now.getFullYear(), 0, 1);
  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);
  
  const facturesList = await db.select().from(factures)
    .where(and(eq(factures.artisanId, artisanId), eq(factures.statut, 'payee')));
  
  const thisYearFactures = facturesList.filter(f => new Date(f.dateFacture) >= thisYearStart);
  const lastYearFactures = facturesList.filter(f => {
    const date = new Date(f.dateFacture);
    return date >= lastYearStart && date <= lastYearEnd;
  });
  
  return {
    thisYear: thisYearFactures.reduce((sum, f) => sum + parseFloat(f.totalTTC?.toString() || '0'), 0),
    lastYear: lastYearFactures.reduce((sum, f) => sum + parseFloat(f.totalTTC?.toString() || '0'), 0),
  };
}

// ============================================================================
// MODELES DEVIS (Quote templates)
// ============================================================================

export async function getModelesDevisByArtisanId(artisanId: number): Promise<ModeleDevis[]> {
  const db = await getDb();
  return await db.select().from(modelesDevis).where(eq(modelesDevis.artisanId, artisanId)).orderBy(desc(modelesDevis.createdAt));
}

export async function getModeleDevisById(id: number): Promise<ModeleDevis | undefined> {
  const db = await getDb();
  const result = await db.select().from(modelesDevis).where(eq(modelesDevis.id, id)).limit(1);
  return result[0];
}

export async function createModeleDevis(artisanId: number, data: { nom: string; description?: string; notes?: string }): Promise<ModeleDevis> {
  const db = await getDb();
  await db.insert(modelesDevis).values({ artisanId, ...data });
  const result = await db.select().from(modelesDevis).where(eq(modelesDevis.artisanId, artisanId)).orderBy(desc(modelesDevis.id)).limit(1);
  return result[0];
}

export async function getModeleDevisLignes(modeleId: number): Promise<ModeleDevisLigne[]> {
  const db = await getDb();
  return await db.select().from(modelesDevisLignes).where(eq(modelesDevisLignes.modeleId, modeleId)).orderBy(asc(modelesDevisLignes.ordre));
}

export async function addLigneToModeleDevis(modeleId: number, data: Omit<InsertModeleDevisLigne, 'modeleId'>): Promise<ModeleDevisLigne> {
  const db = await getDb();
  const existingLignes = await getModeleDevisLignes(modeleId);
  const ordre = existingLignes.length + 1;
  await db.insert(modelesDevisLignes).values({ ...data, modeleId, ordre });
  const result = await db.select().from(modelesDevisLignes).where(eq(modelesDevisLignes.modeleId, modeleId)).orderBy(desc(modelesDevisLignes.id)).limit(1);
  return result[0];
}

export async function deleteModeleDevis(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(modelesDevisLignes).where(eq(modelesDevisLignes.modeleId, id));
  await db.delete(modelesDevis).where(eq(modelesDevis.id, id));
}

// ============================================================================
// EXPORTS
// ============================================================================

export { User, InsertUser } from "../drizzle/schema";
export { Artisan, InsertArtisan } from "../drizzle/schema";
export { Client, InsertClient } from "../drizzle/schema";
export { BibliothequeArticle, InsertBibliothequeArticle } from "../drizzle/schema";
export { ArticleArtisan, InsertArticleArtisan } from "../drizzle/schema";
export { Devis, InsertDevis } from "../drizzle/schema";
export { DevisLigne, InsertDevisLigne } from "../drizzle/schema";
export { Facture, InsertFacture } from "../drizzle/schema";
export { FactureLigne, InsertFactureLigne } from "../drizzle/schema";
export { Intervention, InsertIntervention } from "../drizzle/schema";
export { Notification, InsertNotification } from "../drizzle/schema";
export { ParametresArtisan, InsertParametresArtisan } from "../drizzle/schema";
export { SignatureDevis, InsertSignatureDevis } from "../drizzle/schema";
export { Stock, InsertStock } from "../drizzle/schema";
export { MouvementStock, InsertMouvementStock } from "../drizzle/schema";
export { Fournisseur, InsertFournisseur } from "../drizzle/schema";
export { ArticleFournisseur, InsertArticleFournisseur } from "../drizzle/schema";
export { SmsVerification, InsertSmsVerification } from "../drizzle/schema";
export { RelanceDevis, InsertRelanceDevis } from "../drizzle/schema";
export { ModeleEmail, InsertModeleEmail } from "../drizzle/schema";
export { CommandeFournisseur, InsertCommandeFournisseur } from "../drizzle/schema";
export { LigneCommandeFournisseur, InsertLigneCommandeFournisseur } from "../drizzle/schema";
export { PaiementStripe, InsertPaiementStripe } from "../drizzle/schema";
export { ModeleDevis, InsertModeleDevis } from "../drizzle/schema";
export { ModeleDevisLigne, InsertModeleDevisLigne } from "../drizzle/schema";
