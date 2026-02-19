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
  modelesDevisLignes, ModeleDevisLigne, InsertModeleDevisLigne,
  avisClients, AvisClient, InsertAvisClient,
  demandesAvis, DemandeAvis, InsertDemandeAvis,
  techniciens, Technicien, InsertTechnicien,
  positionsTechniciens, PositionTechnicien, InsertPositionTechnicien,
  disponibilitesTechniciens, DisponibiliteTechnicien,
  historiqueDeplacements,
  chantiers, Chantier, InsertChantier,
  phasesChantier, PhaseChantier, InsertPhaseChantier,
  interventionsChantier, InterventionChantier, InsertInterventionChantier,
  documentsChantier, DocumentChantier, InsertDocumentChantier,
  rapportsPersonnalises, RapportPersonnalise, InsertRapportPersonnalise,
  executionsRapports, ExecutionRapport, InsertExecutionRapport,
  ecrituresComptables, EcritureComptable, InsertEcritureComptable,
  planComptable, CompteComptable, InsertCompteComptable,
  previsionsCA, PrevisionCA, InsertPrevisionCA,
  historiqueCA, HistoriqueCA, InsertHistoriqueCA,
  clientPortalAccess, ClientPortalAccess, InsertClientPortalAccess,
  contratsMaintenance, ContratMaintenance, InsertContratMaintenance,
  facturesRecurrentes, FactureRecurrente, InsertFactureRecurrente,
  interventionsContrat, InterventionContrat, InsertInterventionContrat,
  conversations, Conversation, InsertConversation,
  messages, Message, InsertMessage,
  rdvEnLigne, RdvEnLigne, InsertRdvEnLigne,
  suiviChantier, SuiviChantier, InsertSuiviChantier,
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
      charset: 'utf8mb4',
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
  // Check if user has artisanId set (collaborator linked to an enterprise)
  const userResult = await db.select({ artisanId: users.artisanId }).from(users).where(eq(users.id, userId)).limit(1);
  if (userResult[0]?.artisanId) {
    const result = await db.select().from(artisans).where(eq(artisans.id, userResult[0].artisanId)).limit(1);
    if (result[0]) return result[0];
  }
  // Fallback: direct owner (artisans.userId = userId)
  const result = await db.select().from(artisans).where(eq(artisans.userId, userId)).limit(1);
  return result[0];
}

export async function getArtisanBySlug(slug: string): Promise<Artisan | undefined> {
  const db = await getDb();
  const result = await db.select().from(artisans).where(eq(artisans.slug, slug)).limit(1);
  return result[0];
}

export async function isSlugAvailable(slug: string, excludeArtisanId?: number): Promise<boolean> {
  const db = await getDb();
  if (excludeArtisanId) {
    const result = await db.select().from(artisans).where(and(eq(artisans.slug, slug), ne(artisans.id, excludeArtisanId))).limit(1);
    return result.length === 0;
  }
  const result = await db.select().from(artisans).where(eq(artisans.slug, slug)).limit(1);
  return result.length === 0;
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
      like(bibliothequeArticles.nom, searchTerm),
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
  const compteurParam = (params[0]?.compteurDevis || 0) + 1;

  // Also check MAX existing number in DB to avoid duplicates
  const maxResult = await db.select({ maxNum: sql<string>`MAX(numero)` }).from(devis)
    .where(eq(devis.artisanId, artisanId));
  let maxFromDb = 0;
  if (maxResult[0]?.maxNum) {
    const match = maxResult[0].maxNum.match(/-(\d+)$/);
    if (match) maxFromDb = parseInt(match[1], 10) + 1;
  }

  const compteur = Math.max(compteurParam, maxFromDb);

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
  const compteurParam = (params[0]?.compteurFacture || 0) + 1;

  // Also check MAX existing number in DB to avoid duplicates
  const maxResult = await db.select({ maxNum: sql<string>`MAX(numero)` }).from(factures)
    .where(eq(factures.artisanId, artisanId));
  let maxFromDb = 0;
  if (maxResult[0]?.maxNum) {
    const match = maxResult[0].maxNum.match(/-(\d+)$/);
    if (match) maxFromDb = parseInt(match[1], 10) + 1;
  }

  const compteur = Math.max(compteurParam, maxFromDb);

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
    quantiteAvant: currentQty.toString(),
    quantiteApres: newQty.toString(),
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

export async function getRapportCommandeFournisseur(artisanId: number): Promise<any[]> {
  const lowStockItems = await getLowStockItems(artisanId);
  if (lowStockItems.length === 0) return [];

  const fournisseursList = await getFournisseursByArtisanId(artisanId);
  const fournisseursMap = new Map(fournisseursList.map(f => [f.id, f]));

  // For each low-stock item, find linked fournisseur via articlesFournisseurs
  const grouped = new Map<number | 0, { fournisseur: any; lignes: any[] }>();

  for (const stock of lowStockItems) {
    const artFournisseurs = stock.articleId ? await getArticleFournisseurs(stock.articleId) : [];
    const af = artFournisseurs[0] || null;
    const fournisseurId = af ? af.fournisseurId : 0;
    const fournisseur = fournisseurId ? fournisseursMap.get(fournisseurId) || null : null;

    if (!grouped.has(fournisseurId)) {
      grouped.set(fournisseurId, { fournisseur, lignes: [] });
    }

    const qteEnStock = parseFloat(stock.quantiteEnStock || "0");
    const seuil = parseFloat(stock.seuilAlerte || "5");
    const quantiteACommander = Math.max(seuil * 2 - qteEnStock, 1);
    const prixUnitaire = parseFloat(af?.prixAchat || stock.prixAchat || "0");

    grouped.get(fournisseurId)!.lignes.push({
      stock: {
        id: stock.id,
        reference: stock.reference,
        designation: stock.designation,
        quantiteEnStock: stock.quantiteEnStock,
        seuilAlerte: stock.seuilAlerte,
        unite: stock.unite,
        prixAchat: stock.prixAchat,
      },
      articleFournisseur: af ? {
        referenceExterne: af.referenceExterne,
        prixAchat: af.prixAchat,
        delaiLivraison: af.delaiLivraison,
      } : null,
      quantiteACommander,
      prixUnitaire,
      montantTotal: quantiteACommander * prixUnitaire,
    });
  }

  return Array.from(grouped.values()).map(g => ({
    fournisseur: g.fournisseur,
    lignes: g.lignes,
    totalCommande: g.lignes.reduce((sum, l) => sum + l.montantTotal, 0),
  }));
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

export async function signDevis(token: string, signatureData: string, signataireName: string, signataireEmail: string, ipAddress: string, userAgent: string): Promise<SignatureDevis> {
  const db = await getDb();
  const signature = await getSignatureByToken(token);
  if (!signature) throw new Error('Signature not found');

  await db.update(signaturesDevis).set({
    statut: 'accepte',
    signatureData,
    signataireName,
    signataireEmail,
    ipAddress,
    userAgent,
    signedAt: new Date(),
  }).where(eq(signaturesDevis.token, token));

  // Update devis status
  await db.update(devis).set({ statut: 'accepte' }).where(eq(devis.id, signature.devisId));

  return (await getSignatureByToken(token))!;
}

export async function refuserDevis(token: string, motifRefus: string | undefined, ipAddress: string, userAgent: string): Promise<SignatureDevis> {
  const db = await getDb();
  const signature = await getSignatureByToken(token);
  if (!signature) throw new Error('Signature not found');

  await db.update(signaturesDevis).set({
    statut: 'refuse',
    motifRefus: motifRefus || null,
    ipAddress,
    userAgent,
    signedAt: new Date(),
  }).where(eq(signaturesDevis.token, token));

  // Update devis status
  await db.update(devis).set({ statut: 'refuse' }).where(eq(devis.id, signature.devisId));

  return (await getSignatureByToken(token))!;
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
export { AvisClient, InsertAvisClient } from "../drizzle/schema";
export { DemandeAvis, InsertDemandeAvis } from "../drizzle/schema";
export { Technicien } from "../drizzle/schema";
export { PositionTechnicien } from "../drizzle/schema";

// ============================================================================
// AVIS CLIENTS
// ============================================================================

export async function getAvisByArtisanId(artisanId: number): Promise<AvisClient[]> {
  const db = await getDb();
  return await db.select().from(avisClients)
    .where(eq(avisClients.artisanId, artisanId))
    .orderBy(desc(avisClients.createdAt));
}

export async function getPublishedAvisByArtisanId(artisanId: number): Promise<AvisClient[]> {
  const db = await getDb();
  return await db.select().from(avisClients)
    .where(and(eq(avisClients.artisanId, artisanId), eq(avisClients.statut, 'publie')))
    .orderBy(desc(avisClients.createdAt));
}

export async function getPublishedAvisStats(artisanId: number): Promise<{ moyenne: number; total: number; distribution: Record<number, number> }> {
  const db = await getDb();
  const allAvis = await db.select().from(avisClients)
    .where(and(eq(avisClients.artisanId, artisanId), eq(avisClients.statut, 'publie')));
  const total = allAvis.length;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  allAvis.forEach(a => { sum += a.note; distribution[a.note] = (distribution[a.note] || 0) + 1; });
  return { moyenne: total > 0 ? Math.round((sum / total) * 10) / 10 : 0, total, distribution };
}

export async function getVitrinePublicStats(artisanId: number): Promise<{ totalClients: number; totalInterventions: number }> {
  const db = await getDb();
  const clientsList = await db.select().from(clients).where(eq(clients.artisanId, artisanId));
  const interventionsList = await db.select().from(interventions)
    .where(and(eq(interventions.artisanId, artisanId), eq(interventions.statut, 'terminee')));
  return { totalClients: clientsList.length, totalInterventions: interventionsList.length };
}

export async function getAvisById(id: number): Promise<AvisClient | undefined> {
  const db = await getDb();
  const result = await db.select().from(avisClients).where(eq(avisClients.id, id)).limit(1);
  return result[0];
}

export async function getAvisStats(artisanId: number): Promise<{ moyenne: number; total: number; distribution: Record<number, number> }> {
  const db = await getDb();
  const allAvis = await db.select().from(avisClients)
    .where(eq(avisClients.artisanId, artisanId));

  const total = allAvis.length;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  allAvis.forEach(a => {
    sum += a.note;
    distribution[a.note] = (distribution[a.note] || 0) + 1;
  });

  return { moyenne: total > 0 ? sum / total : 0, total, distribution };
}

export async function createAvis(data: InsertAvisClient): Promise<AvisClient> {
  const db = await getDb();
  await db.insert(avisClients).values(data);
  const result = await db.select().from(avisClients)
    .where(eq(avisClients.artisanId, data.artisanId))
    .orderBy(desc(avisClients.id))
    .limit(1);
  return result[0];
}

export async function updateAvis(id: number, data: Partial<InsertAvisClient>): Promise<AvisClient | undefined> {
  const db = await getDb();
  await db.update(avisClients).set(data).where(eq(avisClients.id, id));
  return getAvisById(id);
}

// ============================================================================
// DEMANDES AVIS
// ============================================================================

export async function getDemandeAvisByToken(token: string): Promise<DemandeAvis | undefined> {
  const db = await getDb();
  const result = await db.select().from(demandesAvis)
    .where(eq(demandesAvis.tokenDemande, token))
    .limit(1);
  return result[0];
}

export async function createDemandeAvis(data: InsertDemandeAvis): Promise<DemandeAvis> {
  const db = await getDb();
  await db.insert(demandesAvis).values(data);
  const result = await db.select().from(demandesAvis)
    .where(eq(demandesAvis.tokenDemande, data.tokenDemande))
    .limit(1);
  return result[0];
}

export async function updateDemandeAvis(id: number, data: Partial<InsertDemandeAvis>): Promise<DemandeAvis | undefined> {
  const db = await getDb();
  await db.update(demandesAvis).set(data).where(eq(demandesAvis.id, id));
  const result = await db.select().from(demandesAvis).where(eq(demandesAvis.id, id)).limit(1);
  return result[0];
}

// ============================================================================
// CLIENT PORTAL ACCESS
// ============================================================================

export async function createClientPortalAccess(data: InsertClientPortalAccess): Promise<ClientPortalAccess> {
  const db = await getDb();
  // Deactivate any existing active portal access for this client
  await db.update(clientPortalAccess)
    .set({ isActive: false })
    .where(and(
      eq(clientPortalAccess.clientId, data.clientId),
      eq(clientPortalAccess.artisanId, data.artisanId),
      eq(clientPortalAccess.isActive, true)
    ));
  const [result] = await db.insert(clientPortalAccess).values(data);
  const [created] = await db.select().from(clientPortalAccess)
    .where(eq(clientPortalAccess.id, result.insertId));
  return created;
}

export async function getClientPortalAccessByToken(token: string): Promise<ClientPortalAccess | null> {
  const db = await getDb();
  const [result] = await db.select().from(clientPortalAccess)
    .where(and(
      eq(clientPortalAccess.token, token),
      eq(clientPortalAccess.isActive, true),
      gte(clientPortalAccess.expiresAt, new Date())
    ));
  return result || null;
}

export async function updateClientPortalAccessLastAccess(id: number): Promise<void> {
  const db = await getDb();
  await db.update(clientPortalAccess)
    .set({ lastAccessAt: new Date() })
    .where(eq(clientPortalAccess.id, id));
}

export async function getPortalAccessByClientId(clientId: number, artisanId: number): Promise<ClientPortalAccess | null> {
  const db = await getDb();
  const [result] = await db.select().from(clientPortalAccess)
    .where(and(
      eq(clientPortalAccess.clientId, clientId),
      eq(clientPortalAccess.artisanId, artisanId),
      eq(clientPortalAccess.isActive, true)
    ))
    .orderBy(desc(clientPortalAccess.createdAt))
    .limit(1);
  return result || null;
}

export async function deactivatePortalAccess(clientId: number, artisanId: number): Promise<void> {
  const db = await getDb();
  await db.update(clientPortalAccess)
    .set({ isActive: false })
    .where(and(
      eq(clientPortalAccess.clientId, clientId),
      eq(clientPortalAccess.artisanId, artisanId),
      eq(clientPortalAccess.isActive, true)
    ));
}

// ============================================================================
// TECHNICIENS — CRUD
// ============================================================================

export async function getTechniciensByArtisanId(artisanId: number): Promise<Technicien[]> {
  const db = await getDb();
  return await db.select().from(techniciens)
    .where(eq(techniciens.artisanId, artisanId))
    .orderBy(asc(techniciens.nom));
}

export async function getTechnicienById(id: number): Promise<Technicien | undefined> {
  const db = await getDb();
  const [result] = await db.select().from(techniciens).where(eq(techniciens.id, id));
  return result;
}

export async function createTechnicien(data: InsertTechnicien): Promise<Technicien> {
  const db = await getDb();
  const [result] = await db.insert(techniciens).values(data);
  const [created] = await db.select().from(techniciens).where(eq(techniciens.id, result.insertId));
  return created;
}

export async function updateTechnicien(id: number, data: Partial<InsertTechnicien>): Promise<Technicien> {
  const db = await getDb();
  await db.update(techniciens).set({ ...data, updatedAt: new Date() }).where(eq(techniciens.id, id));
  const [updated] = await db.select().from(techniciens).where(eq(techniciens.id, id));
  return updated;
}

export async function deleteTechnicien(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(techniciens).where(eq(techniciens.id, id));
}

export async function getTechniciensDisponibles(artisanId: number, date: Date): Promise<Technicien[]> {
  const db = await getDb();
  // Get active technicians
  const actifs = await db.select().from(techniciens)
    .where(and(eq(techniciens.artisanId, artisanId), eq(techniciens.statut, "actif")));

  // Check availability schedule for this day of the week
  const jourSemaine = date.getDay(); // 0=Sunday, 1=Monday, etc.
  const disponibles: Technicien[] = [];

  for (const tech of actifs) {
    const dispos = await db.select().from(disponibilitesTechniciens)
      .where(and(
        eq(disponibilitesTechniciens.technicienId, tech.id),
        eq(disponibilitesTechniciens.jourSemaine, jourSemaine)
      ));
    // If no schedule defined, consider available; if schedule exists, check if disponible=true
    if (dispos.length === 0 || dispos.some(d => d.disponible)) {
      disponibles.push(tech);
    }
  }

  return disponibles;
}

// ============================================================================
// TECHNICIENS — DISPONIBILITES
// ============================================================================

export async function getDisponibilitesByTechnicienId(technicienId: number): Promise<DisponibiliteTechnicien[]> {
  const db = await getDb();
  return await db.select().from(disponibilitesTechniciens)
    .where(eq(disponibilitesTechniciens.technicienId, technicienId))
    .orderBy(asc(disponibilitesTechniciens.jourSemaine));
}

export async function setDisponibilite(data: {
  technicienId: number;
  jourSemaine: number;
  heureDebut: string;
  heureFin: string;
  disponible: boolean;
}): Promise<DisponibiliteTechnicien> {
  const db = await getDb();
  // Upsert: check if entry exists for this technicien + jourSemaine
  const [existing] = await db.select().from(disponibilitesTechniciens)
    .where(and(
      eq(disponibilitesTechniciens.technicienId, data.technicienId),
      eq(disponibilitesTechniciens.jourSemaine, data.jourSemaine)
    ));

  if (existing) {
    await db.update(disponibilitesTechniciens).set({
      heureDebut: data.heureDebut,
      heureFin: data.heureFin,
      disponible: data.disponible,
    }).where(eq(disponibilitesTechniciens.id, existing.id));
    const [updated] = await db.select().from(disponibilitesTechniciens)
      .where(eq(disponibilitesTechniciens.id, existing.id));
    return updated;
  } else {
    const [result] = await db.insert(disponibilitesTechniciens).values(data);
    const [created] = await db.select().from(disponibilitesTechniciens)
      .where(eq(disponibilitesTechniciens.id, result.insertId));
    return created;
  }
}

// ============================================================================
// TECHNICIENS — POSITIONS / GEOLOCALISATION
// ============================================================================

export async function updatePositionTechnicien(data: {
  technicienId: number;
  latitude: string;
  longitude: string;
  precision?: number;
  vitesse?: string;
  cap?: number;
  batterie?: number;
  enDeplacement?: boolean;
  interventionEnCoursId?: number;
}): Promise<PositionTechnicien> {
  const db = await getDb();
  const [result] = await db.insert(positionsTechniciens).values({
    technicienId: data.technicienId,
    latitude: data.latitude,
    longitude: data.longitude,
    precision: data.precision,
    vitesse: data.vitesse,
    cap: data.cap,
    batterie: data.batterie,
    enDeplacement: data.enDeplacement,
    interventionEnCoursId: data.interventionEnCoursId,
  });
  const [created] = await db.select().from(positionsTechniciens)
    .where(eq(positionsTechniciens.id, result.insertId));
  return created;
}

export async function getAllTechniciensPositions(artisanId: number): Promise<any[]> {
  const db = await getDb();
  const allTechs = await db.select().from(techniciens)
    .where(eq(techniciens.artisanId, artisanId));

  const results = [];
  for (const tech of allTechs) {
    const [lastPosition] = await db.select().from(positionsTechniciens)
      .where(eq(positionsTechniciens.technicienId, tech.id))
      .orderBy(desc(positionsTechniciens.timestamp))
      .limit(1);
    results.push({ ...tech, position: lastPosition || null });
  }
  return results;
}

export async function getLastPositionByTechnicienId(technicienId: number): Promise<PositionTechnicien | null> {
  const db = await getDb();
  const [result] = await db.select().from(positionsTechniciens)
    .where(eq(positionsTechniciens.technicienId, technicienId))
    .orderBy(desc(positionsTechniciens.timestamp))
    .limit(1);
  return result || null;
}

export async function getPositionsHistorique(
  technicienId: number,
  dateDebut: Date,
  dateFin: Date
): Promise<PositionTechnicien[]> {
  const db = await getDb();
  return await db.select().from(positionsTechniciens)
    .where(and(
      eq(positionsTechniciens.technicienId, technicienId),
      gte(positionsTechniciens.timestamp, dateDebut),
      lte(positionsTechniciens.timestamp, dateFin)
    ))
    .orderBy(asc(positionsTechniciens.timestamp));
}

export async function getStatistiquesDeplacements(
  artisanId: number,
  dateDebut: Date,
  dateFin: Date
): Promise<{ totalKm: number; totalMinutes: number; nombreDeplacements: number }> {
  const db = await getDb();
  const allTechs = await db.select({ id: techniciens.id }).from(techniciens)
    .where(eq(techniciens.artisanId, artisanId));
  const techIds = allTechs.map(t => t.id);
  if (techIds.length === 0) return { totalKm: 0, totalMinutes: 0, nombreDeplacements: 0 };

  const deplacements = await db.select().from(historiqueDeplacements)
    .where(and(
      inArray(historiqueDeplacements.technicienId, techIds),
      gte(historiqueDeplacements.dateDebut, dateDebut),
      lte(historiqueDeplacements.dateDebut, dateFin)
    ));

  const totalKm = deplacements.reduce((sum, d) => sum + Number(d.distanceKm || 0), 0);
  const totalMinutes = deplacements.reduce((sum, d) => sum + (d.dureeMinutes || 0), 0);
  return { totalKm: Math.round(totalKm * 100) / 100, totalMinutes, nombreDeplacements: deplacements.length };
}

export async function createHistoriqueDeplacement(data: any): Promise<any> {
  const db = await getDb();
  const [result] = await db.insert(historiqueDeplacements).values(data);
  const [created] = await db.select().from(historiqueDeplacements)
    .where(eq(historiqueDeplacements.id, result.insertId));
  return created;
}

export async function getHistoriqueDeplacementsByTechnicienId(technicienId: number): Promise<any[]> {
  const db = await getDb();
  return await db.select().from(historiqueDeplacements)
    .where(eq(historiqueDeplacements.technicienId, technicienId))
    .orderBy(desc(historiqueDeplacements.dateDebut));
}

// ============================================================================
// TECHNICIENS — SUGGESTIONS PLANIFICATION
// ============================================================================

export async function getSuggestionsTechniciens(
  artisanId: number,
  latitude: number,
  longitude: number,
  dateIntervention: Date
): Promise<any[]> {
  const db = await getDb();

  // Get all active technicians for this artisan
  const allTechniciens = await db.select().from(techniciens)
    .where(and(eq(techniciens.artisanId, artisanId), eq(techniciens.statut, "actif")));

  if (allTechniciens.length === 0) return [];

  // Get interventions on the same day to check availability
  const dayStart = new Date(dateIntervention);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dateIntervention);
  dayEnd.setHours(23, 59, 59, 999);

  const dayInterventions = await db.select().from(interventions)
    .where(and(
      eq(interventions.artisanId, artisanId),
      gte(interventions.dateDebut, dayStart),
      lte(interventions.dateDebut, dayEnd),
      ne(interventions.statut, "annulee")
    ));

  // Build suggestions
  const suggestions = await Promise.all(allTechniciens.map(async (tech) => {
    // Check if technician has a conflicting intervention (within 2h window)
    const targetHour = dateIntervention.getHours();
    const busy = dayInterventions.some(i => {
      if (i.technicienId !== tech.id) return false;
      const iHour = new Date(i.dateDebut).getHours();
      return Math.abs(iHour - targetHour) < 2;
    });

    // Get last known position
    const positions = await db.select().from(positionsTechniciens)
      .where(eq(positionsTechniciens.technicienId, tech.id))
      .orderBy(desc(positionsTechniciens.timestamp))
      .limit(1);
    const position = positions[0] || null;

    // Calculate approximate distance (Haversine simplified)
    let distance = 0;
    let tempsTrajet = 0;
    if (position) {
      const lat1 = parseFloat(position.latitude.toString());
      const lon1 = parseFloat(position.longitude.toString());
      const R = 6371;
      const dLat = (latitude - lat1) * Math.PI / 180;
      const dLon = (longitude - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      tempsTrajet = Math.round((distance / 40) * 60); // ~40km/h average in city
    }

    const score = (busy ? 0 : 50) + Math.max(0, 50 - distance);

    return {
      technicien: {
        id: tech.id,
        nom: `${tech.prenom || ""} ${tech.nom}`.trim(),
        couleur: tech.couleur,
        specialite: tech.specialite,
      },
      distance: Math.round(distance * 10) / 10,
      tempsTrajet,
      disponible: !busy,
      position: position ? {
        latitude: position.latitude.toString(),
        longitude: position.longitude.toString(),
      } : null,
      score,
    };
  }));

  return suggestions.sort((a, b) => b.score - a.score);
}

export async function getTechnicienPlusProche(
  artisanId: number,
  latitude: number,
  longitude: number,
  dateIntervention: Date
): Promise<any | null> {
  const suggestions = await getSuggestionsTechniciens(artisanId, latitude, longitude, dateIntervention);
  const available = suggestions.filter(s => s.disponible);
  return available.length > 0 ? available[0] : null;
}

// One-time fix for duplicate devis/factures numbers (runs before unique index is applied)
export async function fixDuplicateNumbers(): Promise<void> {
  const db = await getDb();

  // Fix duplicate devis numbers per artisan
  const allDevis = await db.select({ id: devis.id, artisanId: devis.artisanId, numero: devis.numero })
    .from(devis).orderBy(asc(devis.id));
  const seenDevis = new Map<string, boolean>();
  for (const d of allDevis) {
    const key = `${d.artisanId}:${d.numero}`;
    if (seenDevis.has(key)) {
      // Duplicate — assign next available number
      const newNumero = await getNextDevisNumber(d.artisanId);
      await db.update(devis).set({ numero: newNumero }).where(eq(devis.id, d.id));
      console.log(`[FixDuplicates] Devis id=${d.id}: ${d.numero} → ${newNumero}`);
    } else {
      seenDevis.set(key, true);
    }
  }

  // Fix duplicate facture numbers per artisan
  const allFactures = await db.select({ id: factures.id, artisanId: factures.artisanId, numero: factures.numero })
    .from(factures).orderBy(asc(factures.id));
  const seenFactures = new Map<string, boolean>();
  for (const f of allFactures) {
    const key = `${f.artisanId}:${f.numero}`;
    if (seenFactures.has(key)) {
      const newNumero = await getNextFactureNumber(f.artisanId);
      await db.update(factures).set({ numero: newNumero }).where(eq(factures.id, f.id));
      console.log(`[FixDuplicates] Facture id=${f.id}: ${f.numero} → ${newNumero}`);
    } else {
      seenFactures.set(key, true);
    }
  }

  console.log('[FixDuplicates] Done checking for duplicate numbers.');
}

// ============================================================================
// CHANTIERS
// ============================================================================

export async function getChantiersByArtisan(artisanId: number): Promise<Chantier[]> {
  const db = await getDb();
  return await db.select().from(chantiers).where(eq(chantiers.artisanId, artisanId)).orderBy(desc(chantiers.createdAt));
}

export async function getChantierById(id: number): Promise<Chantier | undefined> {
  const db = await getDb();
  const result = await db.select().from(chantiers).where(eq(chantiers.id, id)).limit(1);
  return result[0];
}

export async function createChantier(data: any): Promise<Chantier> {
  const db = await getDb();
  await db.insert(chantiers).values(data);
  const result = await db.select().from(chantiers)
    .where(and(eq(chantiers.artisanId, data.artisanId), eq(chantiers.reference, data.reference)))
    .orderBy(desc(chantiers.id))
    .limit(1);
  return result[0];
}

export async function updateChantier(id: number, data: any): Promise<Chantier | undefined> {
  const db = await getDb();
  await db.update(chantiers).set(data).where(eq(chantiers.id, id));
  return getChantierById(id);
}

export async function deleteChantier(id: number): Promise<void> {
  const db = await getDb();
  // Delete related data first
  await db.delete(documentsChantier).where(eq(documentsChantier.chantierId, id));
  await db.delete(interventionsChantier).where(eq(interventionsChantier.chantierId, id));
  await db.delete(phasesChantier).where(eq(phasesChantier.chantierId, id));
  await db.delete(chantiers).where(eq(chantiers.id, id));
}

// Phases
export async function getPhasesByChantier(chantierId: number): Promise<PhaseChantier[]> {
  const db = await getDb();
  return await db.select().from(phasesChantier).where(eq(phasesChantier.chantierId, chantierId)).orderBy(asc(phasesChantier.ordre));
}

export async function createPhaseChantier(data: any): Promise<PhaseChantier> {
  const db = await getDb();
  await db.insert(phasesChantier).values(data);
  const result = await db.select().from(phasesChantier)
    .where(eq(phasesChantier.chantierId, data.chantierId))
    .orderBy(desc(phasesChantier.id))
    .limit(1);
  return result[0];
}

export async function updatePhaseChantier(id: number, data: any): Promise<PhaseChantier | undefined> {
  const db = await getDb();
  await db.update(phasesChantier).set(data).where(eq(phasesChantier.id, id));
  const result = await db.select().from(phasesChantier).where(eq(phasesChantier.id, id)).limit(1);
  return result[0];
}

export async function deletePhaseChantier(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(phasesChantier).where(eq(phasesChantier.id, id));
}

// Interventions chantier
export async function getInterventionsByChantier(chantierId: number): Promise<InterventionChantier[]> {
  const db = await getDb();
  return await db.select().from(interventionsChantier).where(eq(interventionsChantier.chantierId, chantierId)).orderBy(asc(interventionsChantier.ordre));
}

export async function getAllInterventionsChantier(artisanId: number): Promise<InterventionChantier[]> {
  const db = await getDb();
  const chantierIds = await db.select({ id: chantiers.id }).from(chantiers).where(eq(chantiers.artisanId, artisanId));
  if (chantierIds.length === 0) return [];
  return await db.select().from(interventionsChantier).where(inArray(interventionsChantier.chantierId, chantierIds.map(c => c.id)));
}

export async function associerInterventionChantier(data: any): Promise<InterventionChantier> {
  const db = await getDb();
  await db.insert(interventionsChantier).values(data);
  const result = await db.select().from(interventionsChantier)
    .where(and(eq(interventionsChantier.chantierId, data.chantierId), eq(interventionsChantier.interventionId, data.interventionId)))
    .orderBy(desc(interventionsChantier.id))
    .limit(1);
  return result[0];
}

export async function dissocierInterventionChantier(chantierId: number, interventionId: number): Promise<void> {
  const db = await getDb();
  await db.delete(interventionsChantier).where(and(eq(interventionsChantier.chantierId, chantierId), eq(interventionsChantier.interventionId, interventionId)));
}

// Documents chantier
export async function getDocumentsByChantier(chantierId: number): Promise<DocumentChantier[]> {
  const db = await getDb();
  return await db.select().from(documentsChantier).where(eq(documentsChantier.chantierId, chantierId)).orderBy(desc(documentsChantier.uploadedAt));
}

export async function addDocumentChantier(data: any): Promise<DocumentChantier> {
  const db = await getDb();
  await db.insert(documentsChantier).values(data);
  const result = await db.select().from(documentsChantier)
    .where(eq(documentsChantier.chantierId, data.chantierId))
    .orderBy(desc(documentsChantier.id))
    .limit(1);
  return result[0];
}

export async function deleteDocumentChantier(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(documentsChantier).where(eq(documentsChantier.id, id));
}

// Statistiques chantier
export async function getStatistiquesChantier(chantierId: number): Promise<any> {
  const db = await getDb();
  const chantier = await getChantierById(chantierId);
  if (!chantier) return null;
  const phases = await getPhasesByChantier(chantierId);
  const interventionsList = await getInterventionsByChantier(chantierId);
  const documents = await getDocumentsByChantier(chantierId);

  const phasesTerminees = phases.filter(p => p.statut === 'termine').length;
  const budgetConsomme = parseFloat(String(chantier.budgetRealise || '0'));
  const budgetTotal = parseFloat(String(chantier.budgetPrevisionnel || '0'));

  return {
    nombrePhases: phases.length,
    phasesTerminees,
    nombreInterventions: interventionsList.length,
    nombreDocuments: documents.length,
    budgetConsomme,
    budgetTotal,
    pourcentageBudget: budgetTotal > 0 ? Math.round((budgetConsomme / budgetTotal) * 100) : 0,
    avancement: chantier.avancement || 0,
  };
}

export async function calculerAvancementChantier(chantierId: number): Promise<any> {
  const db = await getDb();
  const phases = await getPhasesByChantier(chantierId);
  if (phases.length === 0) return { avancement: 0 };

  const totalAvancement = phases.reduce((sum, p) => sum + (p.avancement || 0), 0);
  const avancement = Math.round(totalAvancement / phases.length);

  await db.update(chantiers).set({ avancement }).where(eq(chantiers.id, chantierId));
  return { avancement };
}

// ============================================================================
// SUIVI CHANTIER TEMPS REEL
// ============================================================================

export async function getSuiviByChantier(chantierId: number): Promise<SuiviChantier[]> {
  const db = await getDb();
  return await db.select().from(suiviChantier).where(eq(suiviChantier.chantierId, chantierId)).orderBy(asc(suiviChantier.ordre));
}

export async function getSuiviVisibleClient(chantierId: number): Promise<SuiviChantier[]> {
  const db = await getDb();
  return await db.select().from(suiviChantier).where(and(eq(suiviChantier.chantierId, chantierId), eq(suiviChantier.visibleClient, true))).orderBy(asc(suiviChantier.ordre));
}

export async function createSuiviChantier(data: any): Promise<SuiviChantier> {
  const db = await getDb();
  await db.insert(suiviChantier).values(data);
  const result = await db.select().from(suiviChantier).where(eq(suiviChantier.chantierId, data.chantierId)).orderBy(desc(suiviChantier.id)).limit(1);
  return result[0];
}

export async function updateSuiviChantier(id: number, data: any): Promise<SuiviChantier | undefined> {
  const db = await getDb();
  await db.update(suiviChantier).set(data).where(eq(suiviChantier.id, id));
  const result = await db.select().from(suiviChantier).where(eq(suiviChantier.id, id)).limit(1);
  return result[0];
}

export async function deleteSuiviChantier(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(suiviChantier).where(eq(suiviChantier.id, id));
}

// ============================================================================
// RAPPORTS PERSONNALISES
// ============================================================================

export async function getRapportsPersonnalisesByArtisanId(artisanId: number): Promise<RapportPersonnalise[]> {
  const db = await getDb();
  return await db.select().from(rapportsPersonnalises).where(eq(rapportsPersonnalises.artisanId, artisanId)).orderBy(desc(rapportsPersonnalises.updatedAt));
}

export async function getRapportPersonnaliseById(id: number): Promise<RapportPersonnalise | undefined> {
  const db = await getDb();
  const result = await db.select().from(rapportsPersonnalises).where(eq(rapportsPersonnalises.id, id)).limit(1);
  return result[0];
}

export async function createRapportPersonnalise(data: any): Promise<RapportPersonnalise> {
  const db = await getDb();
  await db.insert(rapportsPersonnalises).values(data);
  const result = await db.select().from(rapportsPersonnalises)
    .where(eq(rapportsPersonnalises.artisanId, data.artisanId))
    .orderBy(desc(rapportsPersonnalises.id))
    .limit(1);
  return result[0];
}

export async function updateRapportPersonnalise(id: number, data: any): Promise<RapportPersonnalise | undefined> {
  const db = await getDb();
  await db.update(rapportsPersonnalises).set(data).where(eq(rapportsPersonnalises.id, id));
  return getRapportPersonnaliseById(id);
}

export async function deleteRapportPersonnalise(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(executionsRapports).where(eq(executionsRapports.rapportId, id));
  await db.delete(rapportsPersonnalises).where(eq(rapportsPersonnalises.id, id));
}

export async function toggleRapportFavori(id: number): Promise<RapportPersonnalise | undefined> {
  const db = await getDb();
  const rapport = await getRapportPersonnaliseById(id);
  if (!rapport) return undefined;
  await db.update(rapportsPersonnalises).set({ favori: !rapport.favori }).where(eq(rapportsPersonnalises.id, id));
  return getRapportPersonnaliseById(id);
}

export async function executerRapport(rapportId: number, parametres?: Record<string, unknown>): Promise<any> {
  const db = await getDb();
  const startTime = Date.now();
  const rapport = await getRapportPersonnaliseById(rapportId);
  if (!rapport) throw new Error("Rapport non trouvé");

  let resultats: any[] = [];

  // Execute based on report type
  switch (rapport.type) {
    case 'ventes': {
      const facturesList = await db.select().from(factures).where(eq(factures.artisanId, rapport.artisanId)).orderBy(desc(factures.dateFacture));
      resultats = facturesList;
      break;
    }
    case 'clients': {
      resultats = await db.select().from(clients).where(eq(clients.artisanId, rapport.artisanId)).orderBy(desc(clients.createdAt));
      break;
    }
    case 'interventions': {
      resultats = await db.select().from(interventions).where(eq(interventions.artisanId, rapport.artisanId)).orderBy(desc(interventions.dateDebut));
      break;
    }
    case 'stocks': {
      resultats = await db.select().from(stocks).where(eq(stocks.artisanId, rapport.artisanId));
      break;
    }
    case 'fournisseurs': {
      resultats = await db.select().from(fournisseurs).where(eq(fournisseurs.artisanId, rapport.artisanId));
      break;
    }
    case 'financier': {
      const facturesList = await db.select().from(factures).where(eq(factures.artisanId, rapport.artisanId));
      const totalCA = facturesList.filter(f => f.statut === 'payee').reduce((sum, f) => sum + parseFloat(String(f.totalTTC || '0')), 0);
      resultats = [{ totalCA, nombreFactures: facturesList.length, facturesPayees: facturesList.filter(f => f.statut === 'payee').length }];
      break;
    }
    default:
      resultats = [];
  }

  const tempsExecution = Date.now() - startTime;

  // Save execution history
  await db.insert(executionsRapports).values({
    rapportId,
    artisanId: rapport.artisanId,
    parametres: parametres || {},
    resultats,
    nombreLignes: resultats.length,
    tempsExecution,
  });

  return { resultats, nombreLignes: resultats.length, tempsExecution };
}

export async function getHistoriqueExecutions(rapportId: number, limit: number = 10): Promise<ExecutionRapport[]> {
  const db = await getDb();
  return await db.select().from(executionsRapports)
    .where(eq(executionsRapports.rapportId, rapportId))
    .orderBy(desc(executionsRapports.dateExecution))
    .limit(limit);
}

// ============================================================================
// COMPTABILITE
// ============================================================================

export async function getEcrituresComptables(artisanId: number, dateDebut?: Date, dateFin?: Date): Promise<EcritureComptable[]> {
  const db = await getDb();
  const conditions: any[] = [eq(ecrituresComptables.artisanId, artisanId)];
  if (dateDebut) conditions.push(gte(ecrituresComptables.dateEcriture, dateDebut));
  if (dateFin) conditions.push(lte(ecrituresComptables.dateEcriture, dateFin));
  return await db.select().from(ecrituresComptables).where(and(...conditions)).orderBy(desc(ecrituresComptables.dateEcriture));
}

export async function getGrandLivre(artisanId: number, dateDebut: Date, dateFin: Date): Promise<any[]> {
  const db = await getDb();
  const ecritures = await db.select().from(ecrituresComptables)
    .where(and(
      eq(ecrituresComptables.artisanId, artisanId),
      gte(ecrituresComptables.dateEcriture, dateDebut),
      lte(ecrituresComptables.dateEcriture, dateFin)
    ))
    .orderBy(asc(ecrituresComptables.numeroCompte), asc(ecrituresComptables.dateEcriture));

  // Group by account number
  const comptes = new Map<string, { numeroCompte: string; libelleCompte: string; ecritures: any[]; totalDebit: number; totalCredit: number; solde: number }>();
  for (const e of ecritures) {
    if (!comptes.has(e.numeroCompte)) {
      comptes.set(e.numeroCompte, { numeroCompte: e.numeroCompte, libelleCompte: e.libelleCompte || '', ecritures: [], totalDebit: 0, totalCredit: 0, solde: 0 });
    }
    const compte = comptes.get(e.numeroCompte)!;
    compte.ecritures.push(e);
    compte.totalDebit += parseFloat(String(e.debit || '0'));
    compte.totalCredit += parseFloat(String(e.credit || '0'));
    compte.solde = compte.totalDebit - compte.totalCredit;
  }
  return Array.from(comptes.values());
}

export async function getBalance(artisanId: number, dateDebut: Date, dateFin: Date): Promise<any[]> {
  const db = await getDb();
  const ecritures = await db.select().from(ecrituresComptables)
    .where(and(
      eq(ecrituresComptables.artisanId, artisanId),
      gte(ecrituresComptables.dateEcriture, dateDebut),
      lte(ecrituresComptables.dateEcriture, dateFin)
    ));

  const comptes = new Map<string, { numeroCompte: string; libelleCompte: string; debit: number; credit: number; soldeDebiteur: number; soldeCrediteur: number }>();
  for (const e of ecritures) {
    if (!comptes.has(e.numeroCompte)) {
      comptes.set(e.numeroCompte, { numeroCompte: e.numeroCompte, libelleCompte: e.libelleCompte || '', debit: 0, credit: 0, soldeDebiteur: 0, soldeCrediteur: 0 });
    }
    const c = comptes.get(e.numeroCompte)!;
    c.debit += parseFloat(String(e.debit || '0'));
    c.credit += parseFloat(String(e.credit || '0'));
    const solde = c.debit - c.credit;
    c.soldeDebiteur = solde > 0 ? solde : 0;
    c.soldeCrediteur = solde < 0 ? Math.abs(solde) : 0;
  }
  return Array.from(comptes.values()).sort((a, b) => a.numeroCompte.localeCompare(b.numeroCompte));
}

export async function getJournalVentes(artisanId: number, dateDebut: Date, dateFin: Date): Promise<any[]> {
  const db = await getDb();
  return await db.select().from(ecrituresComptables)
    .where(and(
      eq(ecrituresComptables.artisanId, artisanId),
      eq(ecrituresComptables.journal, 'VE'),
      gte(ecrituresComptables.dateEcriture, dateDebut),
      lte(ecrituresComptables.dateEcriture, dateFin)
    ))
    .orderBy(asc(ecrituresComptables.dateEcriture));
}

export async function getRapportTVA(artisanId: number, dateDebut: Date, dateFin: Date): Promise<{ tvaCollectee: number; tvaDeductible: number; tvaNette: number }> {
  const db = await getDb();
  const ecritures = await db.select().from(ecrituresComptables)
    .where(and(
      eq(ecrituresComptables.artisanId, artisanId),
      gte(ecrituresComptables.dateEcriture, dateDebut),
      lte(ecrituresComptables.dateEcriture, dateFin)
    ));

  let tvaCollectee = 0;
  let tvaDeductible = 0;
  for (const e of ecritures) {
    // Comptes 44571x = TVA collectée, 44566x = TVA déductible
    if (e.numeroCompte.startsWith('44571')) {
      tvaCollectee += parseFloat(String(e.credit || '0'));
    } else if (e.numeroCompte.startsWith('44566')) {
      tvaDeductible += parseFloat(String(e.debit || '0'));
    }
  }
  return { tvaCollectee, tvaDeductible, tvaNette: tvaCollectee - tvaDeductible };
}

export async function genererEcrituresFacture(factureId: number): Promise<any> {
  const db = await getDb();
  const [facture] = await db.select().from(factures).where(eq(factures.id, factureId)).limit(1);
  if (!facture) throw new Error("Facture non trouvée");

  const dateEcriture = facture.dateFacture || new Date();
  const totalHT = parseFloat(String(facture.totalHT || '0'));
  const totalTVA = parseFloat(String(facture.totalTVA || '0'));
  const totalTTC = parseFloat(String(facture.totalTTC || '0'));
  const pieceRef = facture.numero || `F-${factureId}`;

  // Delete existing entries for this invoice
  await db.delete(ecrituresComptables).where(eq(ecrituresComptables.factureId, factureId));

  const entries = [
    // Débit 411 - Client
    { artisanId: facture.artisanId, dateEcriture, journal: 'VE' as const, numeroCompte: '411000', libelleCompte: 'Clients', libelle: `Facture ${pieceRef}`, pieceRef, debit: String(totalTTC), credit: '0.00', factureId },
    // Crédit 706 - Ventes
    { artisanId: facture.artisanId, dateEcriture, journal: 'VE' as const, numeroCompte: '706000', libelleCompte: 'Prestations de services', libelle: `Facture ${pieceRef}`, pieceRef, debit: '0.00', credit: String(totalHT), factureId },
  ];

  if (totalTVA > 0) {
    // Crédit 44571 - TVA collectée
    entries.push({ artisanId: facture.artisanId, dateEcriture, journal: 'VE' as const, numeroCompte: '445710', libelleCompte: 'TVA collectée', libelle: `Facture ${pieceRef}`, pieceRef, debit: '0.00', credit: String(totalTVA), factureId });
  }

  for (const entry of entries) {
    await db.insert(ecrituresComptables).values(entry);
  }

  return { success: true, nombreEcritures: entries.length };
}

export async function getPlanComptable(artisanId: number): Promise<CompteComptable[]> {
  const db = await getDb();
  return await db.select().from(planComptable).where(eq(planComptable.artisanId, artisanId)).orderBy(asc(planComptable.numeroCompte));
}

export async function initPlanComptable(artisanId: number): Promise<void> {
  const db = await getDb();
  // Check if already initialized
  const existing = await db.select().from(planComptable).where(eq(planComptable.artisanId, artisanId)).limit(1);
  if (existing.length > 0) return;

  const comptesParDefaut = [
    { numeroCompte: '411000', libelle: 'Clients', classe: 4, type: 'actif' as const },
    { numeroCompte: '445660', libelle: 'TVA déductible', classe: 4, type: 'actif' as const },
    { numeroCompte: '445710', libelle: 'TVA collectée', classe: 4, type: 'passif' as const },
    { numeroCompte: '512000', libelle: 'Banque', classe: 5, type: 'actif' as const },
    { numeroCompte: '530000', libelle: 'Caisse', classe: 5, type: 'actif' as const },
    { numeroCompte: '607000', libelle: 'Achats de marchandises', classe: 6, type: 'charge' as const },
    { numeroCompte: '615000', libelle: 'Entretien et réparations', classe: 6, type: 'charge' as const },
    { numeroCompte: '625000', libelle: 'Déplacements', classe: 6, type: 'charge' as const },
    { numeroCompte: '706000', libelle: 'Prestations de services', classe: 7, type: 'produit' as const },
    { numeroCompte: '707000', libelle: 'Ventes de marchandises', classe: 7, type: 'produit' as const },
  ];

  for (const compte of comptesParDefaut) {
    await db.insert(planComptable).values({ artisanId, ...compte });
  }
}

// ============================================================================
// PREVISIONS CA
// ============================================================================

export async function getHistoriqueCA(artisanId: number, nombreMois: number = 24): Promise<HistoriqueCA[]> {
  const db = await getDb();
  return await db.select().from(historiqueCA)
    .where(eq(historiqueCA.artisanId, artisanId))
    .orderBy(desc(historiqueCA.annee), desc(historiqueCA.mois))
    .limit(nombreMois);
}

export async function calculerHistoriqueCAMensuel(artisanId: number): Promise<void> {
  const db = await getDb();
  // Get all paid invoices for this artisan
  const facturesList = await db.select().from(factures)
    .where(and(eq(factures.artisanId, artisanId), eq(factures.statut, 'payee')));

  // Group by month/year
  const monthlyData = new Map<string, { ca: number; nbFactures: number; clientIds: Set<number> }>();

  for (const f of facturesList) {
    const date = f.dateFacture ? new Date(f.dateFacture) : new Date(f.createdAt);
    const mois = date.getMonth() + 1;
    const annee = date.getFullYear();
    const key = `${annee}-${mois}`;

    if (!monthlyData.has(key)) {
      monthlyData.set(key, { ca: 0, nbFactures: 0, clientIds: new Set() });
    }
    const d = monthlyData.get(key)!;
    d.ca += parseFloat(String(f.totalTTC || '0'));
    d.nbFactures++;
    d.clientIds.add(f.clientId);
  }

  // Upsert into historiqueCA
  for (const [key, data] of monthlyData) {
    const [anneeStr, moisStr] = key.split('-');
    const annee = parseInt(anneeStr);
    const mois = parseInt(moisStr);
    const panierMoyen = data.nbFactures > 0 ? data.ca / data.nbFactures : 0;

    // Delete existing entry
    await db.delete(historiqueCA).where(and(
      eq(historiqueCA.artisanId, artisanId),
      eq(historiqueCA.mois, mois),
      eq(historiqueCA.annee, annee)
    ));

    await db.insert(historiqueCA).values({
      artisanId,
      mois,
      annee,
      caTotal: String(data.ca),
      nombreFactures: data.nbFactures,
      nombreClients: data.clientIds.size,
      panierMoyen: String(panierMoyen),
    });
  }
}

export async function getPrevisionsCA(artisanId: number, annee: number): Promise<PrevisionCA[]> {
  const db = await getDb();
  return await db.select().from(previsionsCA)
    .where(and(eq(previsionsCA.artisanId, artisanId), eq(previsionsCA.annee, annee)))
    .orderBy(asc(previsionsCA.mois));
}

export async function calculerPrevisionsCA(artisanId: number, methode: string): Promise<any> {
  const db = await getDb();
  const historique = await getHistoriqueCA(artisanId, 24);

  if (historique.length === 0) {
    return { message: "Pas assez de données historiques pour calculer les prévisions" };
  }

  const currentYear = new Date().getFullYear();
  const predictions: { mois: number; caPrevisionnel: number; confiance: number }[] = [];

  // Calculate average monthly CA from history
  const monthlyAvg = new Map<number, { total: number; count: number }>();
  for (const h of historique) {
    if (!monthlyAvg.has(h.mois)) {
      monthlyAvg.set(h.mois, { total: 0, count: 0 });
    }
    const m = monthlyAvg.get(h.mois)!;
    m.total += parseFloat(String(h.caTotal || '0'));
    m.count++;
  }

  const overallAvg = historique.reduce((sum, h) => sum + parseFloat(String(h.caTotal || '0')), 0) / historique.length;

  for (let mois = 1; mois <= 12; mois++) {
    let caPrevisionnel: number;
    let confiance: number;

    switch (methode) {
      case 'saisonnalite': {
        const monthData = monthlyAvg.get(mois);
        caPrevisionnel = monthData ? monthData.total / monthData.count : overallAvg;
        confiance = monthData ? Math.min(90, 50 + monthData.count * 15) : 30;
        break;
      }
      case 'regression_lineaire': {
        // Simple linear trend based on overall average with slight growth
        caPrevisionnel = overallAvg * (1 + 0.02 * (mois / 12));
        confiance = Math.min(75, 40 + historique.length * 2);
        break;
      }
      default: { // moyenne_mobile
        caPrevisionnel = overallAvg;
        confiance = Math.min(80, 30 + historique.length * 3);
      }
    }

    predictions.push({ mois, caPrevisionnel: Math.round(caPrevisionnel * 100) / 100, confiance: Math.round(confiance) });
  }

  // Save predictions
  for (const pred of predictions) {
    // Delete existing
    await db.delete(previsionsCA).where(and(
      eq(previsionsCA.artisanId, artisanId),
      eq(previsionsCA.mois, pred.mois),
      eq(previsionsCA.annee, currentYear)
    ));

    await db.insert(previsionsCA).values({
      artisanId,
      mois: pred.mois,
      annee: currentYear,
      caPrevisionnel: String(pred.caPrevisionnel),
      methodeCalcul: methode as any,
      confiance: String(pred.confiance),
    });
  }

  return { predictions, methode, annee: currentYear };
}

export async function getComparaisonPrevisionsRealise(artisanId: number, annee: number): Promise<any[]> {
  const db = await getDb();
  const previsions = await getPrevisionsCA(artisanId, annee);
  const historique = await db.select().from(historiqueCA)
    .where(and(eq(historiqueCA.artisanId, artisanId), eq(historiqueCA.annee, annee)));

  const historiqueMap = new Map(historique.map(h => [h.mois, h]));

  return previsions.map(p => {
    const h = historiqueMap.get(p.mois);
    const caRealise = h ? parseFloat(String(h.caTotal || '0')) : 0;
    const caPrevisionnel = parseFloat(String(p.caPrevisionnel || '0'));
    const ecart = caRealise - caPrevisionnel;
    const ecartPourcentage = caPrevisionnel > 0 ? (ecart / caPrevisionnel) * 100 : 0;
    return {
      mois: p.mois,
      caPrevisionnel,
      caRealise,
      ecart: Math.round(ecart * 100) / 100,
      ecartPourcentage: Math.round(ecartPourcentage * 10) / 10,
    };
  });
}

export async function savePrevisionCA(data: { artisanId: number; mois: number; annee: number; caPrevisionnel: string; methodeCalcul: string }): Promise<PrevisionCA> {
  const db = await getDb();
  // Delete existing
  await db.delete(previsionsCA).where(and(
    eq(previsionsCA.artisanId, data.artisanId),
    eq(previsionsCA.mois, data.mois),
    eq(previsionsCA.annee, data.annee)
  ));

  await db.insert(previsionsCA).values({
    artisanId: data.artisanId,
    mois: data.mois,
    annee: data.annee,
    caPrevisionnel: data.caPrevisionnel,
    methodeCalcul: data.methodeCalcul as any,
  });

  const result = await db.select().from(previsionsCA)
    .where(and(
      eq(previsionsCA.artisanId, data.artisanId),
      eq(previsionsCA.mois, data.mois),
      eq(previsionsCA.annee, data.annee)
    ))
    .limit(1);
  return result[0];
}

export async function seedHistoriqueCA(artisanId: number, data: { mois: number; annee: number; caTotal: string; nombreFactures?: number; nombreClients?: number; panierMoyen?: string }): Promise<HistoriqueCA> {
  const db = await getDb();
  await db.delete(historiqueCA).where(and(
    eq(historiqueCA.artisanId, artisanId),
    eq(historiqueCA.mois, data.mois),
    eq(historiqueCA.annee, data.annee)
  ));
  await db.insert(historiqueCA).values({
    artisanId, mois: data.mois, annee: data.annee, caTotal: data.caTotal,
    nombreFactures: data.nombreFactures || 0, nombreClients: data.nombreClients || 0, panierMoyen: data.panierMoyen || "0",
  });
  const result = await db.select().from(historiqueCA)
    .where(and(eq(historiqueCA.artisanId, artisanId), eq(historiqueCA.mois, data.mois), eq(historiqueCA.annee, data.annee)))
    .limit(1);
  return result[0];
}

// ============================================================================
// CONTRATS MAINTENANCE
// ============================================================================
export async function getContratsByArtisanId(artisanId: number): Promise<ContratMaintenance[]> {
  const db = await getDb();
  return db.select().from(contratsMaintenance)
    .where(eq(contratsMaintenance.artisanId, artisanId))
    .orderBy(desc(contratsMaintenance.createdAt));
}

export async function getContratsByClientId(clientId: number, artisanId: number): Promise<ContratMaintenance[]> {
  const db = await getDb();
  return db.select().from(contratsMaintenance)
    .where(and(eq(contratsMaintenance.clientId, clientId), eq(contratsMaintenance.artisanId, artisanId)))
    .orderBy(desc(contratsMaintenance.createdAt));
}

export async function getContratById(id: number): Promise<ContratMaintenance | undefined> {
  const db = await getDb();
  const result = await db.select().from(contratsMaintenance)
    .where(eq(contratsMaintenance.id, id))
    .limit(1);
  return result[0];
}

export async function getNextContratNumber(artisanId: number): Promise<string> {
  const db = await getDb();
  const result = await db.select({ count: sql<number>`COUNT(*)` })
    .from(contratsMaintenance)
    .where(eq(contratsMaintenance.artisanId, artisanId));
  const count = result[0]?.count || 0;
  return `CTR-${String(count + 1).padStart(5, "0")}`;
}

export async function createContrat(data: InsertContratMaintenance): Promise<ContratMaintenance> {
  const db = await getDb();
  const result = await db.insert(contratsMaintenance).values(data);
  const insertId = result[0].insertId;
  const created = await db.select().from(contratsMaintenance).where(eq(contratsMaintenance.id, insertId)).limit(1);
  return created[0];
}

export async function updateContrat(id: number, data: Partial<InsertContratMaintenance>): Promise<ContratMaintenance> {
  const db = await getDb();
  await db.update(contratsMaintenance).set({ ...data, updatedAt: new Date() }).where(eq(contratsMaintenance.id, id));
  const updated = await db.select().from(contratsMaintenance).where(eq(contratsMaintenance.id, id)).limit(1);
  return updated[0];
}

export async function deleteContrat(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(contratsMaintenance).where(eq(contratsMaintenance.id, id));
}

// ============================================================================
// FACTURES RECURRENTES
// ============================================================================
export async function getFacturesRecurrentesByContratId(contratId: number): Promise<FactureRecurrente[]> {
  const db = await getDb();
  return db.select().from(facturesRecurrentes)
    .where(eq(facturesRecurrentes.contratId, contratId))
    .orderBy(desc(facturesRecurrentes.createdAt));
}

export async function createFactureRecurrente(data: InsertFactureRecurrente): Promise<FactureRecurrente> {
  const db = await getDb();
  const result = await db.insert(facturesRecurrentes).values(data);
  const insertId = result[0].insertId;
  const created = await db.select().from(facturesRecurrentes).where(eq(facturesRecurrentes.id, insertId)).limit(1);
  return created[0];
}

// ============================================================================
// INTERVENTIONS CONTRAT
// ============================================================================
export async function getInterventionsContratByContratId(contratId: number): Promise<InterventionContrat[]> {
  const db = await getDb();
  return db.select().from(interventionsContrat)
    .where(eq(interventionsContrat.contratId, contratId))
    .orderBy(desc(interventionsContrat.dateIntervention));
}

export async function createInterventionContrat(data: InsertInterventionContrat): Promise<InterventionContrat> {
  const db = await getDb();
  const result = await db.insert(interventionsContrat).values(data);
  const insertId = result[0].insertId;
  const created = await db.select().from(interventionsContrat).where(eq(interventionsContrat.id, insertId)).limit(1);
  return created[0];
}

export async function updateInterventionContrat(id: number, data: Partial<InsertInterventionContrat>): Promise<InterventionContrat> {
  const db = await getDb();
  await db.update(interventionsContrat).set({ ...data, updatedAt: new Date() }).where(eq(interventionsContrat.id, id));
  const updated = await db.select().from(interventionsContrat).where(eq(interventionsContrat.id, id)).limit(1);
  return updated[0];
}

// ============================================================================
// CONVERSATIONS & MESSAGES (Chat)
// ============================================================================
export async function getConversationsByArtisanId(artisanId: number): Promise<Conversation[]> {
  const db = await getDb();
  return db.select().from(conversations)
    .where(eq(conversations.artisanId, artisanId))
    .orderBy(desc(conversations.dernierMessageDate), desc(conversations.updatedAt));
}

export async function getConversationsByClientId(clientId: number, artisanId: number): Promise<Conversation[]> {
  const db = await getDb();
  return db.select().from(conversations)
    .where(and(eq(conversations.clientId, clientId), eq(conversations.artisanId, artisanId)))
    .orderBy(desc(conversations.dernierMessageDate));
}

export async function getConversationById(id: number): Promise<Conversation | undefined> {
  const db = await getDb();
  const result = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return result[0];
}

export async function getOrCreateConversation(artisanId: number, clientId: number, sujet?: string): Promise<Conversation> {
  const db = await getDb();
  // Check for existing open conversation with same client
  const existing = await db.select().from(conversations)
    .where(and(
      eq(conversations.artisanId, artisanId),
      eq(conversations.clientId, clientId),
      eq(conversations.statut, "ouverte")
    ))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);
  if (existing[0] && !sujet) return existing[0];

  // Create new conversation
  const result = await db.insert(conversations).values({
    artisanId, clientId, sujet: sujet || null, statut: "ouverte",
  });
  const created = await db.select().from(conversations).where(eq(conversations.id, result[0].insertId)).limit(1);
  return created[0];
}

export async function updateConversation(id: number, data: Partial<InsertConversation>): Promise<Conversation> {
  const db = await getDb();
  await db.update(conversations).set({ ...data, updatedAt: new Date() }).where(eq(conversations.id, id));
  const updated = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return updated[0];
}

export async function getMessagesByConversationId(conversationId: number): Promise<Message[]> {
  const db = await getDb();
  return db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

export async function createMessage(data: InsertMessage): Promise<Message> {
  const db = await getDb();
  const result = await db.insert(messages).values(data);
  const insertId = result[0].insertId;

  // Update conversation
  const apercu = data.contenu.substring(0, 100);
  const updateData: any = {
    dernierMessage: apercu,
    dernierMessageDate: new Date(),
    updatedAt: new Date(),
  };
  if (data.auteur === "artisan") {
    await db.update(conversations).set({
      ...updateData,
      nonLuClient: sql`nonLuClient + 1`,
    }).where(eq(conversations.id, data.conversationId));
  } else {
    await db.update(conversations).set({
      ...updateData,
      nonLuArtisan: sql`nonLuArtisan + 1`,
    }).where(eq(conversations.id, data.conversationId));
  }

  const created = await db.select().from(messages).where(eq(messages.id, insertId)).limit(1);
  return created[0];
}

export async function markMessagesAsRead(conversationId: number, lecteur: "artisan" | "client"): Promise<void> {
  const db = await getDb();
  const auteurDesMessages = lecteur === "artisan" ? "client" : "artisan";
  await db.update(messages).set({ lu: true })
    .where(and(
      eq(messages.conversationId, conversationId),
      eq(messages.auteur, auteurDesMessages),
      eq(messages.lu, false)
    ));
  // Reset unread counter
  if (lecteur === "artisan") {
    await db.update(conversations).set({ nonLuArtisan: 0 }).where(eq(conversations.id, conversationId));
  } else {
    await db.update(conversations).set({ nonLuClient: 0 }).where(eq(conversations.id, conversationId));
  }
}

export async function getUnreadMessagesCount(artisanId: number): Promise<number> {
  const db = await getDb();
  const result = await db.select({ total: sql<number>`COALESCE(SUM(nonLuArtisan), 0)` })
    .from(conversations)
    .where(and(eq(conversations.artisanId, artisanId), ne(conversations.statut, "archivee")));
  return result[0]?.total || 0;
}

// One-time seed for test data (runs on server startup)
export async function seedTestData(): Promise<void> {
  const db = await getDb();

  // Get the first artisan
  const [artisan] = await db.select().from(artisans).limit(1);
  if (!artisan) {
    console.log('[Seed] No artisan found, skipping test data');
    return;
  }

  // Check if test data already exists (by checking stocks)
  const existingStocks = await db.select().from(stocks).where(eq(stocks.artisanId, artisan.id)).limit(1);
  if (existingStocks.length > 0) {
    console.log('[Seed] Test data already exists, skipping');
    return;
  }

  console.log(`[Seed] Inserting test data for artisan ${artisan.id}...`);

  // Get clients for avis
  const allClients = await db.select().from(clients).where(eq(clients.artisanId, artisan.id));
  const clientMartin = allClients.find(c => c.nom === 'Martin');
  const clientDurand = allClients.find(c => c.nom === 'Durand');
  const clientBernard = allClients.find(c => c.nom === 'Bernard');

  // 3 Avis clients
  const avisData = [
    { client: clientMartin, note: 5, commentaire: 'Excellent travail, très professionnel. Je recommande vivement !' },
    { client: clientDurand, note: 4, commentaire: 'Bon travail, ponctuel et soigneux. Petit bémol sur le délai initial.' },
    { client: clientBernard, note: 5, commentaire: 'Parfait ! Intervention rapide et efficace. Artisan de confiance.' },
  ];
  for (const avis of avisData) {
    if (!avis.client) continue;
    await db.insert(avisClients).values({
      artisanId: artisan.id,
      clientId: avis.client.id,
      note: avis.note,
      commentaire: avis.commentaire,
      statut: 'publie',
    });
    console.log(`[Seed] Avis: ${avis.client.nom} - ${avis.note}/5`);
  }

  // 3 Stock items
  const stockItems = [
    { reference: 'JNT-TOR-001', designation: 'Joint torique DN20', quantiteEnStock: '50.00', seuilAlerte: '10.00', unite: 'pièce', prixAchat: '0.85', emplacement: 'Étagère A2', fournisseur: 'Cedeo' },
    { reference: 'TUB-CUI-014', designation: 'Tube cuivre 14mm (barre 2m)', quantiteEnStock: '25.00', seuilAlerte: '5.00', unite: 'barre', prixAchat: '12.50', emplacement: 'Rack B1', fournisseur: 'Cedeo' },
    { reference: 'DIS-20A-003', designation: 'Disjoncteur 20A', quantiteEnStock: '15.00', seuilAlerte: '3.00', unite: 'pièce', prixAchat: '8.90', emplacement: 'Armoire C3', fournisseur: 'Rexel' },
  ];
  for (const item of stockItems) {
    await db.insert(stocks).values({ artisanId: artisan.id, ...item });
    console.log(`[Seed] Stock: ${item.designation} (qty: ${item.quantiteEnStock})`);
  }

  // 2 Fournisseurs
  const fournisseursData = [
    { nom: 'Cedeo Lyon', contact: 'Jean-Pierre Moreau', email: 'contact@cedeo-lyon.fr', telephone: '04 72 33 44 55', adresse: '15 rue de l\'Industrie', codePostal: '69003', ville: 'Lyon' },
    { nom: 'Rexel Villeurbanne', contact: 'Sophie Lambert', email: 'villeurbanne@rexel.fr', telephone: '04 78 85 66 77', adresse: 'ZI des Bruyères, 8 allée des Platanes', codePostal: '69100', ville: 'Villeurbanne' },
  ];
  for (const f of fournisseursData) {
    await db.insert(fournisseurs).values({ artisanId: artisan.id, ...f });
    console.log(`[Seed] Fournisseur: ${f.nom}`);
  }

  console.log('[Seed] Test data inserted successfully!');
}

// ============================================================================
// RDV EN LIGNE
// ============================================================================

export async function createRdvEnLigne(data: InsertRdvEnLigne): Promise<RdvEnLigne> {
  const db = await getDb();
  const result = await db.insert(rdvEnLigne).values(data);
  const insertId = result[0].insertId;
  const created = await db.select().from(rdvEnLigne).where(eq(rdvEnLigne.id, insertId)).limit(1);
  return created[0];
}

export async function getRdvByArtisanId(artisanId: number): Promise<RdvEnLigne[]> {
  const db = await getDb();
  return await db.select().from(rdvEnLigne)
    .where(eq(rdvEnLigne.artisanId, artisanId))
    .orderBy(desc(rdvEnLigne.createdAt));
}

export async function getRdvByClientId(clientId: number, artisanId: number): Promise<RdvEnLigne[]> {
  const db = await getDb();
  return await db.select().from(rdvEnLigne)
    .where(and(
      eq(rdvEnLigne.clientId, clientId),
      eq(rdvEnLigne.artisanId, artisanId)
    ))
    .orderBy(desc(rdvEnLigne.createdAt));
}

export async function getRdvById(id: number): Promise<RdvEnLigne | undefined> {
  const db = await getDb();
  const result = await db.select().from(rdvEnLigne).where(eq(rdvEnLigne.id, id)).limit(1);
  return result[0];
}

export async function updateRdvStatut(
  id: number,
  statut: "en_attente" | "confirme" | "refuse" | "annule",
  extra?: { motifRefus?: string; interventionId?: number }
): Promise<RdvEnLigne> {
  const db = await getDb();
  await db.update(rdvEnLigne).set({
    statut,
    ...extra,
  }).where(eq(rdvEnLigne.id, id));
  const result = await db.select().from(rdvEnLigne).where(eq(rdvEnLigne.id, id)).limit(1);
  return result[0];
}

export async function getRdvPendingCount(artisanId: number): Promise<number> {
  const db = await getDb();
  const result = await db.select().from(rdvEnLigne)
    .where(and(
      eq(rdvEnLigne.artisanId, artisanId),
      eq(rdvEnLigne.statut, "en_attente")
    ));
  return result.length;
}

export async function getCreneauxOccupes(artisanId: number, debut: Date, fin: Date): Promise<{ dateDebut: Date; dateFin: Date | null }[]> {
  const db = await getDb();
  const interventionsList = await db.select({
    dateDebut: interventions.dateDebut,
    dateFin: interventions.dateFin,
  }).from(interventions)
    .where(and(
      eq(interventions.artisanId, artisanId),
      ne(interventions.statut, "annulee"),
      gte(interventions.dateDebut, debut),
      lte(interventions.dateDebut, fin)
    ));

  const rdvList = await db.select({
    dateProposee: rdvEnLigne.dateProposee,
    dureeEstimee: rdvEnLigne.dureeEstimee,
  }).from(rdvEnLigne)
    .where(and(
      eq(rdvEnLigne.artisanId, artisanId),
      inArray(rdvEnLigne.statut, ["en_attente", "confirme"]),
      gte(rdvEnLigne.dateProposee, debut),
      lte(rdvEnLigne.dateProposee, fin)
    ));

  const occupied: { dateDebut: Date; dateFin: Date | null }[] = [];
  for (const i of interventionsList) {
    occupied.push({ dateDebut: i.dateDebut, dateFin: i.dateFin });
  }
  for (const r of rdvList) {
    const end = new Date(r.dateProposee.getTime() + (r.dureeEstimee || 60) * 60000);
    occupied.push({ dateDebut: r.dateProposee, dateFin: end });
  }
  return occupied;
}

// ============================================================================
// MULTI-USER MANAGEMENT
// ============================================================================

export async function getUsersByArtisanId(artisanId: number): Promise<User[]> {
  const db = await getDb();
  // Get the owner (artisans.userId) + all users with users.artisanId = artisanId
  const artisan = await db.select().from(artisans).where(eq(artisans.id, artisanId)).limit(1);
  if (!artisan[0]) return [];
  const result = await db.select().from(users).where(
    or(eq(users.id, artisan[0].userId), eq(users.artisanId, artisanId))
  );
  return result;
}

export async function createCollaborator(data: {
  email: string;
  name: string;
  prenom?: string;
  role: "artisan" | "secretaire" | "technicien";
  artisanId: number;
  passwordHash: string;
}): Promise<User> {
  const db = await getDb();
  await db.insert(users).values({
    email: data.email,
    name: data.name,
    prenom: data.prenom || null,
    role: data.role,
    artisanId: data.artisanId,
    password: data.passwordHash,
    loginMethod: "password",
    actif: true,
  });
  const result = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  return result[0];
}

export async function updateUserRole(userId: number, role: string, artisanId: number): Promise<User | undefined> {
  const db = await getDb();
  // Verify user belongs to this enterprise
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user[0] || user[0].artisanId !== artisanId) return undefined;
  await db.update(users).set({ role: role as any }).where(eq(users.id, userId));
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

export async function toggleUserActif(userId: number, actif: boolean, artisanId: number): Promise<User | undefined> {
  const db = await getDb();
  // Verify user belongs to this enterprise
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user[0] || user[0].artisanId !== artisanId) return undefined;
  await db.update(users).set({ actif }).where(eq(users.id, userId));
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}
