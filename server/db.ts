import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
// OPE-184 P0.7 — bascule PG-first : pool/driver Postgres optionnel (DB_DIALECT=postgresql).
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import { eq, and, or, like, desc, asc, sql, inArray, gte, lte, lt, isNull, isNotNull, between, ne, getTableColumns, notExists } from "drizzle-orm";
import { 
  users, User, InsertUser,
  artisans, Artisan, InsertArtisan,
  clients, Client, InsertClient,
  bibliothequeArticles, BibliothequeArticle, InsertBibliothequeArticle,
  articlesArtisan, ArticleArtisan, InsertArticleArtisan,
  activites, Activite, InsertActivite,
  devis, Devis, InsertDevis,
  devisLignes, DevisLigne, InsertDevisLigne,
  factures, Facture, InsertFacture,
  facturesLignes, FactureLigne, InsertFactureLigne,
  interventions, Intervention, InsertIntervention,
  interventionsTechniciens, InterventionTechnicien, InsertInterventionTechnicien,
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
  demandesContact, DemandeContact, InsertDemandeContact,
  demandesAvis, DemandeAvis, InsertDemandeAvis,
  techniciens, Technicien, InsertTechnicien,
  habilitationsTechniciens, HabilitationTechnicien, InsertHabilitationTechnicien,
  positionsTechniciens, PositionTechnicien, InsertPositionTechnicien,
  disponibilitesTechniciens, DisponibiliteTechnicien,
  historiqueDeplacements,
  chantiers, Chantier, InsertChantier,
  phasesChantier, PhaseChantier, InsertPhaseChantier,
  pointagesChantier, PointageChantier, InsertPointageChantier,
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
  permissionsUtilisateur, PermissionUtilisateur, InsertPermissionUtilisateur,
  auditLog, AuditLog, InsertAuditLog,
  vehicules, Vehicule, InsertVehicule,
  historiqueKilometrage, HistoriqueKilometrage, InsertHistoriqueKilometrage,
  entretiensVehicules, EntretienVehicule, InsertEntretienVehicule,
  assurancesVehicules, AssuranceVehicule, InsertAssuranceVehicule,
  conges, Conge, InsertConge,
  soldesConges, SoldeConge, InsertSoldeConge,
  badges, Badge, InsertBadge,
  badgesTechniciens, BadgeTechnicien, InsertBadgeTechnicien,
  objectifsTechniciens, ObjectifTechnicien, InsertObjectifTechnicien,
  classementTechniciens, ClassementTechnicien, InsertClassementTechnicien,
  devisOptions, DevisOption, InsertDevisOption,
  devisOptionsLignes, DevisOptionLigne, InsertDevisOptionLigne,
  analysesPhotosChantier, AnalysePhotoChantier, InsertAnalysePhotoChantier,
  photosAnalyse, PhotoAnalyse, InsertPhotoAnalyse,
  resultatsAnalyseIA, ResultatAnalyseIA, InsertResultatAnalyseIA,
  suggestionsArticlesIA, SuggestionArticleIA, InsertSuggestionArticleIA,
  devisGenereIA, DevisGenereIA, InsertDevisGenereIA,
  configurationsComptables, ConfigurationComptable, InsertConfigurationComptable,
  exportsComptables, ExportComptable, InsertExportComptable,
  pushSubscriptions, PushSubscription, InsertPushSubscription,
  historiqueNotificationsPush, HistoriqueNotificationPush, InsertHistoriqueNotificationPush,
  preferencesNotifications, PreferenceNotification, InsertPreferenceNotification,
  configAlertesPrevisions, ConfigAlertePrevision, InsertConfigAlertePrevision,
  historiqueAlertesPrevisions, HistoriqueAlertePrevision, InsertHistoriqueAlertePrevision,
  emailsLog, EmailLog, InsertEmailLog,
  aiThreads, aiMessages,
  interventionsMobile, photosInterventions,
  depenses, budgetsCategories, categoriesDepenses, notesFraisDepenses, notesDeFrais,
  relevesBancaires, transactionsBancaires, reglesCategorisation,
  couleursInterventions, modules, artisanModules, subscriptions, devices,
} from "../drizzle/schema.active";
import { ALL_PERMISSIONS } from "../shared/permissions";

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

    // OPE-184 P0.7 — chemin Postgres (PG-first). node-postgres accepte la
    // connectionString directement ; les objets-tables proviennent de schema.active
    // (sélectionnés par DB_DIALECT). Le chemin mysql ci-dessous reste inchangé.
    if (process.env.DB_DIALECT === "postgresql") {
      const pgPool = new PgPool({ connectionString: databaseUrl, max: 10 });
      pgPool.on("error", (err: any) => {
        console.error("[PG pool] error (non-fatal):", err?.code, err?.message);
      });
      const conn = await pgPool.connect();
      await conn.query("select 1");
      conn.release();
      _db = drizzlePg(pgPool) as any;
      console.log("[Database] Connected successfully (postgres)");
      return _db;
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

    // OPE-82 — Le Pool mysql2 est un EventEmitter : un evenement 'error' sans
    // listener (coupure DB, PROTOCOL_CONNECTION_LOST, failover) est relancé par
    // Node → uncaughtException → crash. On l'ecoute pour le rendre non-fatal
    // (mysql2 reconnecte les connexions du pool a la demande).
    (_pool as any).on("error", (err: any) => {
      console.error("[MySQL pool] error (non-fatal):", err?.code, err?.message);
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

// OPE-184 P0.7a — insert dialect-aware renvoyant l'id généré.
// Postgres : `.returning({id})` (drizzle-mysql2 ne supporte PAS returning).
// MySQL : forme historique mysql2 (ResultSetHeader.insertId). Remplace le pattern
// `const [result] = await db.insert(X).values(Y); ... result.insertId`.
async function insertReturningId(table: any, values: any): Promise<number> {
  const db: any = await getDb();
  if (process.env.DB_DIALECT === "postgresql") {
    const [row]: any = await db.insert(table).values(values).returning({ id: table.id });
    return row.id;
  }
  const [result]: any = await db.insert(table).values(values);
  return result.insertId;
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

// OPE-8 : recupere l'utilisateur dont le token de reset (hash SHA-256) est
// valide et non expire. Retourne undefined si aucun match / expire.
export async function getUserByValidResetToken(tokenHash: string): Promise<User | undefined> {
  const db = await getDb();
  const result = await db.select().from(users)
    .where(and(
      eq(users.resetToken, tokenHash),
      gte(users.resetTokenExpiry, new Date()),
    ))
    .limit(1);
  return result[0];
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

// OPE-156 — flux iCal : résolution de l'artisan par son jeton secret de calendrier.
export async function getArtisanByIcalToken(token: string): Promise<Artisan | undefined> {
  const db = await getDb();
  if (!token) return undefined;
  const result = await db.select().from(artisans).where(eq(artisans.icalToken, token)).limit(1);
  return result[0];
}

// OPE-172 — demandes de contact (vitrine) : persistance + suivi.
export async function createDemandeContact(data: InsertDemandeContact): Promise<void> {
  const db = await getDb();
  await db.insert(demandesContact).values(data);
}

export async function getDemandesContactByArtisanId(artisanId: number): Promise<DemandeContact[]> {
  const db = await getDb();
  return await db.select().from(demandesContact)
    .where(eq(demandesContact.artisanId, artisanId))
    .orderBy(desc(demandesContact.createdAt));
}

// Met à jour le statut d'une demande, SCOPÉ par artisanId (pas d'IDOR).
export async function updateDemandeContactStatut(id: number, artisanId: number, statut: "nouveau" | "contacte" | "converti" | "perdu", clientId?: number): Promise<void> {
  const db = await getDb();
  const data: any = { statut };
  if (clientId !== undefined) data.clientId = clientId;
  await db.update(demandesContact).set(data)
    .where(and(eq(demandesContact.id, id), eq(demandesContact.artisanId, artisanId)));
}

export async function getDemandeContactById(id: number, artisanId: number): Promise<DemandeContact | undefined> {
  const db = await getDb();
  const result = await db.select().from(demandesContact)
    .where(and(eq(demandesContact.id, id), eq(demandesContact.artisanId, artisanId))).limit(1);
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

// Garantit l'unicite : 1 ligne artisans par userId. A utiliser PARTOUT a la
// place du couple getArtisanByUserId + createArtisan a la volee, qui pouvait
// creer plusieurs lignes pour le meme userId (race condition entre requetes
// concurrentes au premier login). La contrainte UNIQUE(userId) ajoutee par
// fix-duplicates protege en derniere ligne : ER_DUP_ENTRY -> on relit.
export async function getOrCreateArtisan(
  userId: number,
  data?: Partial<Omit<InsertArtisan, "userId">>,
): Promise<Artisan> {
  const existing = await getArtisanByUserId(userId);
  if (existing) return existing;
  try {
    return await createArtisan({ userId, ...(data ?? {}) } as InsertArtisan);
  } catch (e: any) {
    const isDup =
      e?.code === "ER_DUP_ENTRY" ||
      /Duplicate entry/i.test(String(e?.message ?? "")) ||
      e?.errno === 1062;
    if (isDup) {
      const refetched = await getArtisanByUserId(userId);
      if (refetched) return refetched;
    }
    throw e;
  }
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
  // `bibliotheque_articles` n'a PAS de colonne `reference` : l'ancienne relecture
  // `eq(bibliothequeArticles.reference, data.reference)` portait sur une colonne
  // inexistante (-> undefined -> throw) et cassait cet endpoint admin. On relit par
  // `nom` (réel, NOT NULL) en prenant la ligne la plus récente (= celle qu'on vient
  // d'insérer), idiome déjà utilisé par createBadge/createNotification.
  const result = await db.select().from(bibliothequeArticles)
    .where(eq(bibliothequeArticles.nom, data.nom))
    .orderBy(desc(bibliothequeArticles.id))
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

// ── Activités / rappels planifiés — CRM next-action (OPE-121) ─────────────────
// Toujours scopé par artisanId (multi-tenant). Tri par échéance croissante pour
// que le widget « À faire » regroupe naturellement en retard / aujourd'hui / à venir.
export async function getActivitesByArtisanId(artisanId: number): Promise<Activite[]> {
  const db = await getDb();
  return await db.select().from(activites)
    .where(eq(activites.artisanId, artisanId))
    .orderBy(asc(activites.fait), asc(activites.echeance));
}

export async function createActivite(data: InsertActivite): Promise<Activite> {
  const db = await getDb();
  const newId = await insertReturningId(activites, data);
  const [created] = await db.select().from(activites).where(eq(activites.id, newId));
  return created;
}

// Bascule fait/à-faire, scopée artisan : positionne faitAt à la complétion, le
// remet à null si on rouvre l'activité.
export async function setActiviteFait(id: number, artisanId: number, fait: boolean): Promise<void> {
  const db = await getDb();
  await db.update(activites)
    .set({ fait, faitAt: fait ? new Date() : null })
    .where(and(eq(activites.id, id), eq(activites.artisanId, artisanId)));
}

export async function deleteActivite(id: number, artisanId: number): Promise<void> {
  const db = await getDb();
  await db.delete(activites).where(and(eq(activites.id, id), eq(activites.artisanId, artisanId)));
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

export async function getDevisByClientId(clientId: number, artisanId?: number): Promise<Devis[]> {
  const db = await getDb();
  // artisanId optionnel : scope tenant defense-in-depth (portail public notamment).
  const conds = [eq(devis.clientId, clientId)];
  if (artisanId !== undefined) conds.push(eq(devis.artisanId, artisanId));
  return await db.select().from(devis).where(and(...conds)).orderBy(desc(devis.createdAt));
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

// OPE-152 — marque le devis comme « vu » à la PREMIÈRE consultation client (read-receipt).
// Idempotent : `WHERE dateVue IS NULL` → ne réécrit jamais la 1ʳᵉ date de vue.
export async function markDevisVu(id: number): Promise<void> {
  const db = await getDb();
  await db.update(devis).set({ dateVue: new Date() }).where(and(eq(devis.id, id), isNull(devis.dateVue)));
}

export async function deleteDevis(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(devisLignes).where(eq(devisLignes.devisId, id));
  // Cascade des enfants PUREMENT opérationnels du devis (aucun document légal) qui
  // n'étaient pas nettoyés → lignes orphelines (pas de contrainte FK en base) :
  //  - relances_devis : rappels de relance du devis
  //  - devis_options (+ devis_options_lignes) : variantes/options proposées
  // (signatures_devis = valeur probante, hors périmètre — cf. OPE-50 sur la
  //  suppressibilité d'un devis signé.)
  const opts = await db.select({ id: devisOptions.id }).from(devisOptions).where(eq(devisOptions.devisId, id));
  if (opts.length > 0) {
    await db.delete(devisOptionsLignes).where(inArray(devisOptionsLignes.optionId, opts.map((o) => o.id)));
  }
  await db.delete(devisOptions).where(eq(devisOptions.devisId, id));
  await db.delete(relancesDevis).where(eq(relancesDevis.devisId, id));
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

export async function getFacturesByClientId(clientId: number, artisanId?: number): Promise<Facture[]> {
  const db = await getDb();
  // artisanId optionnel : scope tenant defense-in-depth (portail public notamment).
  const conds = [eq(factures.clientId, clientId)];
  if (artisanId !== undefined) conds.push(eq(factures.artisanId, artisanId));
  return await db.select().from(factures).where(and(...conds)).orderBy(desc(factures.createdAt));
}

// OPE-144 — encours client (lecture seule, sans migration). Somme du reste dû
// (totalTTC − montantPaye) des factures émises non soldées, avec la part échue.
// Scopé par `artisanId` (sécurité multi-tenant) en plus du `clientId`. Seules les
// factures `envoyee`/`en_retard` comptent (pas brouillon/validee = pas encore une
// créance ; pas payee/annulee).
//
// La part « échue » est dérivée de `dateEcheance < NOW()` (aligné Odoo
// `account.move.invoice_date_due` : le retard se calcule depuis la date, sans
// dépendre d'un statut stocké). En effet le statut `en_retard` n'est jamais
// positionné automatiquement (cf. OPE-61 : `runScheduler` ne bascule aucune
// facture) → s'appuyer dessus donnerait un échu toujours nul. On garde malgré
// tout `statut === 'en_retard'` comme échu (cas d'une bascule manuelle).
export async function getEncoursClient(clientId: number, artisanId: number): Promise<{ encoursTotal: string; echu: string; nbFacturesImpayees: number }> {
  const db = await getDb();
  const rows = await db.select({
    statut: factures.statut,
    totalTTC: factures.totalTTC,
    montantPaye: factures.montantPaye,
    dateEcheance: factures.dateEcheance,
    typeDocument: factures.typeDocument,
  }).from(factures)
    .where(and(eq(factures.clientId, clientId), eq(factures.artisanId, artisanId)));

  const now = Date.now();
  let encoursTotal = 0;
  let echu = 0;
  let nb = 0;
  // OPE-247 — les avoirs validés (notes de crédit) RÉDUISENT ce que le client doit.
  // Ils sont stockés `typeDocument='avoir'`, `totalTTC` négatif → on accumule leur
  // valeur absolue comme crédit à déduire de l'encours (nette globale, sans lettrage fin).
  let creditAvoirs = 0;
  for (const f of rows) {
    if ((f.typeDocument || "facture") === "avoir") {
      if (f.statut !== "annulee" && f.statut !== "brouillon") {
        creditAvoirs += Math.abs(parseFloat(String(f.totalTTC ?? "0")) || 0);
      }
      continue;
    }
    if (f.statut !== "envoyee" && f.statut !== "en_retard") continue;
    const reste = (parseFloat(String(f.totalTTC ?? "0")) || 0) - (parseFloat(String(f.montantPaye ?? "0")) || 0);
    if (reste <= 0) continue;
    encoursTotal += reste;
    nb += 1;
    const echeance = f.dateEcheance ? new Date(f.dateEcheance).getTime() : NaN;
    const estEchue = f.statut === "en_retard" || (!isNaN(echeance) && echeance < now);
    if (estEchue) echu += reste;
  }
  // Déduit le crédit des avoirs (planché à 0), et borne l'échu au net total dû.
  encoursTotal = Math.max(0, encoursTotal - creditAvoirs);
  echu = Math.min(echu, encoursTotal);
  return { encoursTotal: encoursTotal.toFixed(2), echu: echu.toFixed(2), nbFacturesImpayees: nb };
}

// OPE-144 — encours impayé de TOUS les clients en UNE requête (badge « à risque » de la liste
// clients). Même logique que getEncoursClient (reste des factures envoyee/en_retard, avoirs
// validés déduits par client, échu borné au net), agrégée par clientId. Scopé tenant.
export async function getEncoursByClient(
  artisanId: number,
): Promise<Record<number, { encoursTotal: string; echu: string; nbFacturesImpayees: number }>> {
  const db = await getDb();
  const rows = await db.select({
    clientId: factures.clientId,
    statut: factures.statut,
    totalTTC: factures.totalTTC,
    montantPaye: factures.montantPaye,
    dateEcheance: factures.dateEcheance,
    typeDocument: factures.typeDocument,
  }).from(factures).where(eq(factures.artisanId, artisanId));

  const now = Date.now();
  const enc: Record<number, number> = {};
  const ech: Record<number, number> = {};
  const credit: Record<number, number> = {};
  const nb: Record<number, number> = {};
  for (const f of rows) {
    const cid = f.clientId;
    if ((f.typeDocument || "facture") === "avoir") {
      if (f.statut !== "annulee" && f.statut !== "brouillon") {
        credit[cid] = (credit[cid] || 0) + Math.abs(parseFloat(String(f.totalTTC ?? "0")) || 0);
      }
      continue;
    }
    if (f.statut !== "envoyee" && f.statut !== "en_retard") continue;
    const reste = (parseFloat(String(f.totalTTC ?? "0")) || 0) - (parseFloat(String(f.montantPaye ?? "0")) || 0);
    if (reste <= 0) continue;
    enc[cid] = (enc[cid] || 0) + reste;
    nb[cid] = (nb[cid] || 0) + 1;
    const echeance = f.dateEcheance ? new Date(f.dateEcheance).getTime() : NaN;
    const estEchue = f.statut === "en_retard" || (!isNaN(echeance) && echeance < now);
    if (estEchue) ech[cid] = (ech[cid] || 0) + reste;
  }
  const out: Record<number, { encoursTotal: string; echu: string; nbFacturesImpayees: number }> = {};
  const clientIds = new Set<number>([...Object.keys(enc), ...Object.keys(credit)].map(Number));
  for (const cid of clientIds) {
    const total = Math.max(0, (enc[cid] || 0) - (credit[cid] || 0));
    if (total <= 0) continue; // seuls les clients réellement débiteurs sont retournés
    out[cid] = {
      encoursTotal: total.toFixed(2),
      echu: Math.min(ech[cid] || 0, total).toFixed(2),
      nbFacturesImpayees: nb[cid] || 0,
    };
  }
  return out;
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

// OPE-249 — ajoute N mois en CLAMPANT la fin de mois (équivalent de
// `dateutil.relativedelta(months=N)` d'Odoo). `Date.setMonth(getMonth()+N)` brut
// déborde (31 jan + 1 mois → 3 mars) ; ce helper clampe au dernier jour du mois
// cible si le jour d'origine n'existe pas (→ 28/29 fév). Fonction pure (testable).
// N peut être négatif. Behavior-preserving pour les jours 1–28 (inchangés).
export function addMonthsClamped(base: Date, n: number): Date {
  const day = base.getDate();
  const r = new Date(base);
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const lastDayOfTargetMonth = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDayOfTargetMonth));
  return r;
}

// OPE-94 — calcule la date d'échéance d'une facture depuis un délai de paiement
// structuré (≈ Odoo account.payment.term). `net` = base + N jours ; `fin_de_mois`
// = base + N jours, puis dernier jour de ce mois. Fonction pure (testable).
export function computeDateEcheance(base: Date, jours: number, type: "net" | "fin_de_mois" = "net"): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + (jours || 0));
  if (type === "fin_de_mois") {
    d.setMonth(d.getMonth() + 1, 0); // jour 0 du mois suivant = dernier jour du mois courant
  }
  return d;
}

// OPE-94 — échéance par défaut dérivée des paramètres de l'artisan, si configurée.
// Renvoie `undefined` si aucun délai n'est paramétré (→ comportement inchangé).
export async function defaultDateEcheance(artisanId: number, base: Date): Promise<Date | undefined> {
  const params = await getParametresArtisan(artisanId);
  if (params?.delaiPaiementJours == null) return undefined;
  return computeDateEcheance(base, params.delaiPaiementJours, (params.delaiPaiementType as any) || "net");
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
  // OPE-94 — échéance dérivée du délai de paiement par défaut de l'artisan (si configuré).
  const dateEcheance = await defaultDateEcheance(devisData.artisanId, new Date());

  // Create facture
  await db.insert(factures).values({
    artisanId: devisData.artisanId,
    clientId: devisData.clientId,
    devisId: devisData.id,
    numero,
    objet: devisData.objet,
    // OPE-158 — report de la référence client (n° de commande) du devis vers la facture.
    referenceClient: devisData.referenceClient,
    conditionsPaiement: devisData.conditionsPaiement,
    notes: devisData.notes,
    dateEcheance,
    totalHT: devisData.totalHT,
    totalTVA: devisData.totalTVA,
    totalTTC: devisData.totalTTC,
  });
  
  // OPE-176 — relire la facture qu'on vient d'insérer EN SCOPANT sur l'artisan.
  // La numérotation est par artisan (FAC-0000N pour tous) et `factures.numero` n'a
  // pas de contrainte UNIQUE : un lookup par `numero` seul pouvait renvoyer la facture
  // d'un AUTRE artisan (collision) -> lignes rattachées + facture renvoyée cross-tenant.
  // On scope par artisanId et on prend la plus récente (= celle qu'on vient de créer).
  const factureResult = await db.select().from(factures)
    .where(and(eq(factures.artisanId, devisData.artisanId), eq(factures.numero, numero)))
    .orderBy(desc(factures.id))
    .limit(1);
  const facture = factureResult[0];
  
  // Copy lignes
  for (const ligne of lignesDevis) {
    // OPE-168 (volet 2) — la structure du devis (sections/notes) est désormais
    // REPORTÉE sur la facture (les lignes de facture portent aussi `type`). Les
    // section/note ont des montants à 0 → n'impactent pas les totaux de la facture.
    await db.insert(facturesLignes).values({
      factureId: facture.id,
      type: (ligne as any).type ?? "produit",
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

export async function getNextAvoirNumber(artisanId: number): Promise<string> {
  const db = await getDb();
  const params = await db.select().from(parametresArtisan).where(eq(parametresArtisan.artisanId, artisanId)).limit(1);
  const prefix = params[0]?.prefixeAvoir || 'AV';
  const compteurParam = (params[0]?.compteurAvoir || 0) + 1;

  const maxResult = await db.select({ maxNum: sql<string>`MAX(numero)` }).from(factures)
    .where(and(eq(factures.artisanId, artisanId), eq(factures.typeDocument, 'avoir')));
  let maxFromDb = 0;
  if (maxResult[0]?.maxNum) {
    const match = maxResult[0].maxNum.match(/-(\d+)$/);
    if (match) maxFromDb = parseInt(match[1], 10) + 1;
  }

  const compteur = Math.max(compteurParam, maxFromDb);

  if (params[0]) {
    await db.update(parametresArtisan).set({ compteurAvoir: compteur }).where(eq(parametresArtisan.artisanId, artisanId));
  } else {
    await db.insert(parametresArtisan).values({ artisanId, compteurAvoir: compteur });
  }

  return `${prefix}-${String(compteur).padStart(5, '0')}`;
}

export async function createAuditLog(data: { artisanId: number; userId: number; entityType: string; entityId: number; action: string; details?: string }): Promise<void> {
  const db = await getDb();
  await db.insert(auditLog).values(data);
}

export async function getAuditLogsByEntity(entityType: string, entityId: number): Promise<any[]> {
  const db = await getDb();
  return await db.select().from(auditLog)
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    .orderBy(desc(auditLog.createdAt));
}

// OPE-114 — journal des envois d'emails (traçabilité + socle webhooks délivrabilité)
export async function createEmailLog(data: InsertEmailLog): Promise<void> {
  const db = await getDb();
  await db.insert(emailsLog).values(data);
}

// Liste scopée tenant ; filtre optionnel par entité (devis/facture…).
export async function getEmailsLog(
  artisanId: number,
  opts?: { entiteType?: string; entiteId?: number; limit?: number },
): Promise<EmailLog[]> {
  const db = await getDb();
  const conds = [eq(emailsLog.artisanId, artisanId)];
  if (opts?.entiteType) conds.push(eq(emailsLog.entiteType, opts.entiteType));
  if (opts?.entiteId !== undefined) conds.push(eq(emailsLog.entiteId, opts.entiteId));
  return await db.select().from(emailsLog)
    .where(and(...conds))
    .orderBy(desc(emailsLog.createdAt))
    .limit(Math.min(Math.max(opts?.limit ?? 100, 1), 500));
}

export async function getAvoirsByFactureId(factureOrigineId: number): Promise<Facture[]> {
  const db = await getDb();
  return await db.select().from(factures)
    .where(and(eq(factures.factureOrigineId, factureOrigineId), eq(factures.typeDocument, 'avoir')))
    .orderBy(desc(factures.createdAt));
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

// OPE-110 — détection (non bloquante) des conflits d'affectation d'un technicien sur
// une fenêtre [dateDebut, dateFin] : (1) interventions actives qui chevauchent,
// (2) congés APPROUVÉS qui couvrent la période. Toujours scopé `artisanId`.
export async function getConflitsTechnicien(
  artisanId: number,
  technicienId: number,
  dateDebut: Date,
  dateFin: Date,
  excludeInterventionId?: number,
): Promise<{
  interventions: { id: number; titre: string; dateDebut: Date; dateFin: Date | null }[];
  conges: { id: number; type: string; dateDebut: any; dateFin: any }[];
}> {
  const db = await getDb();
  // Chevauchement : existante.dateDebut < nouvelleFin ET COALESCE(fin, debut) > nouvelleDebut.
  const conds: any[] = [
    eq(interventions.artisanId, artisanId),
    eq(interventions.technicienId, technicienId),
    inArray(interventions.statut, ["planifiee", "en_cours"] as any),
    lt(interventions.dateDebut, dateFin),
    sql`COALESCE(${interventions.dateFin}, ${interventions.dateDebut}) > ${dateDebut}`,
  ];
  if (excludeInterventionId) conds.push(ne(interventions.id, excludeInterventionId));
  const inter = await db.select({
    id: interventions.id, titre: interventions.titre,
    dateDebut: interventions.dateDebut, dateFin: interventions.dateFin,
  }).from(interventions).where(and(...conds)).limit(20);

  // Congés approuvés du technicien recouvrant la période (colonnes `date`, comparaison YMD).
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const congesList = await db.select({
    id: conges.id, type: conges.type, dateDebut: conges.dateDebut, dateFin: conges.dateFin,
  }).from(conges).where(and(
    // Defense-in-depth : scope tenant explicite (cohérent avec le pattern systémique).
    // technicienId est déjà propre à un artisan, mais on ne dépend pas de cet invariant.
    eq(conges.artisanId, artisanId),
    eq(conges.technicienId, technicienId),
    eq(conges.statut, "approuve" as any),
    lte(conges.dateDebut, ymd(dateFin)),
    gte(conges.dateFin, ymd(dateDebut)),
  )).limit(20);

  return { interventions: inter as any, conges: congesList as any };
}

export async function getInterventionsByClientId(clientId: number, artisanId?: number): Promise<Intervention[]> {
  const db = await getDb();
  // artisanId optionnel : scope tenant defense-in-depth (portail public notamment).
  const conds = [eq(interventions.clientId, clientId)];
  if (artisanId !== undefined) conds.push(eq(interventions.artisanId, artisanId));
  return await db.select().from(interventions).where(and(...conds)).orderBy(desc(interventions.dateDebut));
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
  // OPE-111 — nettoie les liaisons d'équipe (enfant purement opérationnel) pour
  // éviter des lignes orphelines (pas de FK dure en base).
  await db.delete(interventionsTechniciens).where(eq(interventionsTechniciens.interventionId, id));
  await db.delete(interventions).where(eq(interventions.id, id));
}

// OPE-111 — Équipe d'intervention (Many2many additif). Le technicien « responsable »
// reste `interventions.technicienId` ; ces helpers gèrent le RESTE de l'équipe.

// Liste l'équipe d'une intervention, jointe aux fiches techniciens (nom/prénom).
export async function getEquipeIntervention(
  interventionId: number,
  artisanId: number,
): Promise<Array<{ id: number; technicienId: number; role: string | null; nom: string | null; prenom: string | null }>> {
  const db = await getDb();
  const rows = await db
    .select({
      id: interventionsTechniciens.id,
      technicienId: interventionsTechniciens.technicienId,
      role: interventionsTechniciens.role,
      nom: techniciens.nom,
      prenom: techniciens.prenom,
    })
    .from(interventionsTechniciens)
    .leftJoin(techniciens, eq(interventionsTechniciens.technicienId, techniciens.id))
    .where(and(
      eq(interventionsTechniciens.interventionId, interventionId),
      eq(interventionsTechniciens.artisanId, artisanId),
    ))
    .orderBy(asc(interventionsTechniciens.id));
  return rows;
}

// OPE-111 — toutes les liaisons d'équipe de l'artisan (1 requête), pour afficher
// l'équipe sur la liste/planning sans N+1. Scopé tenant.
export async function getEquipesByArtisan(
  artisanId: number,
): Promise<Array<{ interventionId: number; technicienId: number; role: string | null; nom: string | null; prenom: string | null }>> {
  const db = await getDb();
  const rows = await db
    .select({
      interventionId: interventionsTechniciens.interventionId,
      technicienId: interventionsTechniciens.technicienId,
      role: interventionsTechniciens.role,
      nom: techniciens.nom,
      prenom: techniciens.prenom,
    })
    .from(interventionsTechniciens)
    .leftJoin(techniciens, eq(interventionsTechniciens.technicienId, techniciens.id))
    .where(eq(interventionsTechniciens.artisanId, artisanId))
    .orderBy(asc(interventionsTechniciens.id));
  return rows;
}

// Ajoute un membre à l'équipe (idempotent : ignore un doublon intervention+technicien).
export async function addMembreEquipe(data: {
  artisanId: number;
  interventionId: number;
  technicienId: number;
  role?: string | null;
}): Promise<InterventionTechnicien | null> {
  const db = await getDb();
  const existing = await db.select().from(interventionsTechniciens).where(and(
    eq(interventionsTechniciens.interventionId, data.interventionId),
    eq(interventionsTechniciens.technicienId, data.technicienId),
  )).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(interventionsTechniciens).values({
    artisanId: data.artisanId,
    interventionId: data.interventionId,
    technicienId: data.technicienId,
    role: data.role ?? null,
  });
  const result = await db.select().from(interventionsTechniciens).where(and(
    eq(interventionsTechniciens.interventionId, data.interventionId),
    eq(interventionsTechniciens.technicienId, data.technicienId),
  )).limit(1);
  return result[0] ?? null;
}

// Retire un membre de l'équipe (par id de liaison), scopé tenant.
export async function removeMembreEquipe(id: number, artisanId: number): Promise<void> {
  const db = await getDb();
  await db.delete(interventionsTechniciens).where(and(
    eq(interventionsTechniciens.id, id),
    eq(interventionsTechniciens.artisanId, artisanId),
  ));
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export async function getNotificationsByArtisanId(
  artisanId: number,
  includeArchived = false,
  opts?: { nonLuesUniquement?: boolean; limit?: number; offset?: number },
): Promise<Notification[]> {
  const db = await getDb();
  const conds = [eq(notifications.artisanId, artisanId)];
  // includeArchived=false (défaut) : on exclut les archivées (comportement historique).
  // includeArchived=true : la vue « archivées » du front fonctionne enfin.
  if (!includeArchived) conds.push(eq(notifications.archived, false));
  // Filtre + pagination poussés en SQL (au lieu de tout ramener en mémoire puis
  // filtrer/slicer côté Node) — cet endpoint est listé fréquemment.
  if (opts?.nonLuesUniquement) conds.push(eq(notifications.lu, false));
  const query = db.select().from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt));
  if (opts?.limit != null) {
    return await query.limit(opts.limit).offset(opts.offset ?? 0);
  }
  return await query;
}

export async function getUnreadNotificationsCount(artisanId: number): Promise<number> {
  const db = await getDb();
  // Perf : COUNT(*) cote SQL au lieu de ramener toutes les lignes non-lues en
  // memoire Node puis .length (cet endpoint est pollé toutes les 30s).
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(notifications)
    .where(and(
      eq(notifications.artisanId, artisanId),
      eq(notifications.lu, false),
      eq(notifications.archived, false)
    ));
  return Number(result[0]?.count ?? 0);
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

// Hardened : on FORCE l'artisanId dans le WHERE pour interdire la
// modification cross-tenant d'une notification appartenant a un autre.
// L'arg artisanId est OPTIONNEL pour la retro-compatibilite, mais tous
// les nouveaux appelants DOIVENT le passer.
export async function markNotificationAsRead(id: number, artisanId?: number): Promise<void> {
  const db = await getDb();
  const where = artisanId
    ? and(eq(notifications.id, id), eq(notifications.artisanId, artisanId))
    : eq(notifications.id, id);
  await db.update(notifications).set({ lu: true }).where(where);
}

export async function markAllNotificationsAsRead(artisanId: number): Promise<void> {
  const db = await getDb();
  await db.update(notifications).set({ lu: true }).where(eq(notifications.artisanId, artisanId));
}

export async function archiveNotification(id: number, artisanId?: number): Promise<void> {
  const db = await getDb();
  const where = artisanId
    ? and(eq(notifications.id, id), eq(notifications.artisanId, artisanId))
    : eq(notifications.id, id);
  await db.update(notifications).set({ archived: true }).where(where);
}

// Helper pour verifier l'ownership d'un article artisan (manquait dans db.ts).
export async function getArticleArtisanById(id: number): Promise<ArticleArtisan | undefined> {
  const db = await getDb();
  const result = await db.select().from(articlesArtisan).where(eq(articlesArtisan.id, id)).limit(1);
  return result[0];
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
  // Cascade : supprimer l'historique de mouvements (opérationnel, sans valeur
  // légale/comptable) avant l'article -> évite des `mouvements_stock` orphelins
  // pointant vers un stockId supprimé. Même pattern que deleteChantier/deleteFacture.
  await db.delete(mouvementsStock).where(eq(mouvementsStock.stockId, id));
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

// OPE-105 — quantité ENTRANTE par fiche stock = reste à recevoir (`quantite − quantiteRecue`,
// planché à 0) des lignes de commandes fournisseurs ENCORE en cours (envoyée / confirmée /
// partiellement livrée), liées à la fiche stock via `stockId`. Lecture seule, scopée tenant
// (jointure sur `commandes_fournisseurs.artisanId`), une requête (pas de N+1, pas de migration).
// Sert à afficher le « stock prévisionnel » = physique + entrant SANS modifier l'alerte de seuil.
export async function getStockEntrantByArtisan(
  artisanId: number,
): Promise<Array<{ stockId: number; entrant: number }>> {
  const db = await getDb();
  const entrantExpr = sql<string>`COALESCE(SUM(GREATEST(${lignesCommandesFournisseurs.quantite} - ${lignesCommandesFournisseurs.quantiteRecue}, 0)), 0)`;
  try {
    const rows = await db.select({
      stockId: lignesCommandesFournisseurs.stockId,
      entrant: entrantExpr,
    })
      .from(lignesCommandesFournisseurs)
      .innerJoin(commandesFournisseurs, eq(commandesFournisseurs.id, lignesCommandesFournisseurs.commandeId))
      .where(and(
        eq(commandesFournisseurs.artisanId, artisanId),
        inArray(commandesFournisseurs.statut, ["envoyee", "confirmee", "partiellement_livree"]),
        isNotNull(lignesCommandesFournisseurs.stockId),
      ))
      .groupBy(lignesCommandesFournisseurs.stockId)
      .having(sql`${entrantExpr} > 0`);
    return rows.map((r) => ({ stockId: Number(r.stockId), entrant: Number(r.entrant) || 0 }));
  } catch (e: any) {
    console.warn("[getStockEntrantByArtisan]", e?.message || e);
    return [];
  }
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
  // Cascade des données OPÉRATIONNELLES du fournisseur (pas de document légal/comptable :
  // les commandes fournisseurs sont des bons de commande, pas des écritures ; la compta
  // passe par `depenses`). Évite des orphelins : liens article-fournisseur + commandes +
  // leurs lignes. Même pattern que deleteChantier/deleteVehicule (qui cascadent déjà leurs
  // enfants opérationnels — documents, entretiens, assurances…).
  await db.delete(articlesFournisseurs).where(eq(articlesFournisseurs.fournisseurId, id));
  const cmds = await db.select({ id: commandesFournisseurs.id })
    .from(commandesFournisseurs).where(eq(commandesFournisseurs.fournisseurId, id));
  for (const c of cmds) {
    await db.delete(lignesCommandesFournisseurs).where(eq(lignesCommandesFournisseurs.commandeId, c.id));
  }
  await db.delete(commandesFournisseurs).where(eq(commandesFournisseurs.fournisseurId, id));
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

export async function getArticleFournisseurById(id: number): Promise<ArticleFournisseur | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(articlesFournisseurs).where(eq(articlesFournisseurs.id, id)).limit(1);
  return result[0];
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

// OPE-135 — indicateurs de performance fournisseur CALCULÉS depuis les commandes
// (auparavant données factices 0 / 100 %). Forme alignée sur ce qu'attend la page
// PerformancesFournisseurs.tsx. Scopé par `artisanId` (la requête commandes filtre
// sur artisanId → pas de fuite cross-tenant). Aucune migration.
export async function getPerformancesFournisseurs(artisanId: number): Promise<any[]> {
  const db = await getDb();
  const fournisseursList = await getFournisseursByArtisanId(artisanId);
  const cmds = await db.select().from(commandesFournisseurs)
    .where(eq(commandesFournisseurs.artisanId, artisanId));

  const byFournisseur = new Map<number, any[]>();
  for (const c of cmds) {
    const arr = byFournisseur.get(c.fournisseurId) || [];
    arr.push(c);
    byFournisseur.set(c.fournisseurId, arr);
  }
  const now = Date.now();
  const jour = 86_400_000;

  return fournisseursList.map((f) => {
    // Commandes « réelles » (hors brouillon).
    const list = (byFournisseur.get(f.id) || []).filter((c) => c.statut !== "brouillon");
    const totalCommandes = list.length;
    const livrees = list.filter((c) => c.statut === "livree");
    const commandesLivrees = livrees.length;

    // En retard : livrée après l'échéance, OU non livrée/annulée dont l'échéance est dépassée.
    const commandesEnRetard = list.filter((c) => {
      const prevu = c.dateLivraisonPrevue ? new Date(c.dateLivraisonPrevue).getTime() : null;
      if (prevu == null) return false;
      if (c.statut === "livree") {
        return c.dateLivraisonReelle ? new Date(c.dateLivraisonReelle).getTime() > prevu : false;
      }
      if (c.statut === "annulee") return false;
      return prevu < now; // en cours et échéance dépassée
    }).length;

    // Délai moyen de livraison (jours) sur les commandes livrées datées.
    const livreesDatees = livrees.filter((c) => c.dateLivraisonReelle && c.createdAt);
    let delaiMoyenLivraison: number | null = null;
    if (livreesDatees.length > 0) {
      const somme = livreesDatees.reduce((s, c) => {
        const d = (new Date(c.dateLivraisonReelle).getTime() - new Date(c.createdAt).getTime()) / jour;
        return s + Math.max(0, d);
      }, 0);
      delaiMoyenLivraison = Math.round(somme / livreesDatees.length);
    }

    // Taux de fiabilité : % de commandes livrées « à temps » (avec date d'échéance).
    const livreesAvecPrevu = livrees.filter((c) => c.dateLivraisonPrevue && c.dateLivraisonReelle);
    let tauxFiabilite = 100;
    if (livreesAvecPrevu.length > 0) {
      const aTemps = livreesAvecPrevu.filter(
        (c) => new Date(c.dateLivraisonReelle).getTime() <= new Date(c.dateLivraisonPrevue).getTime()
      ).length;
      tauxFiabilite = Math.round((aTemps / livreesAvecPrevu.length) * 100);
    }

    const montantTotal = list.reduce(
      (s, c) => s + (parseFloat(String(c.totalTTC ?? c.montantTotal ?? "0")) || 0),
      0
    );

    return {
      fournisseur: { id: f.id, nom: f.nom, contact: f.contact, email: f.email, telephone: f.telephone },
      totalCommandes,
      commandesLivrees,
      commandesEnRetard,
      delaiMoyenLivraison,
      tauxFiabilite,
      montantTotal,
    };
  });
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

// OPE-150 — commandes fournisseurs en retard de livraison (lecture seule, scopé tenant).
// Une commande est « en retard » si elle est encore attendue (envoyée/confirmée/partielle),
// que sa date de livraison prévue est dépassée, et qu'aucune livraison réelle n'est saisie.
// (Le filtre `< NOW()` exclut naturellement les `dateLivraisonPrevue` NULL.)
export async function getCommandesFournisseursEnRetard(artisanId: number): Promise<CommandeFournisseur[]> {
  const db = await getDb();
  return await db.select().from(commandesFournisseurs)
    .where(and(
      eq(commandesFournisseurs.artisanId, artisanId),
      inArray(commandesFournisseurs.statut, ["envoyee", "confirmee", "partiellement_livree"]),
      isNull(commandesFournisseurs.dateLivraisonReelle),
      lt(commandesFournisseurs.dateLivraisonPrevue, new Date()),
    ))
    .orderBy(asc(commandesFournisseurs.dateLivraisonPrevue));
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

export async function deleteLignesCommandeFournisseur(commandeId: number): Promise<void> {
  const db = await getDb();
  await db.delete(lignesCommandesFournisseurs).where(eq(lignesCommandesFournisseurs.commandeId, commandeId));
}

// OPE-100 — enregistre la quantité reçue d'une ligne. Scopé par `commandeId` (la propriété
// tenant est vérifiée au niveau routeur sur la commande) pour éviter d'écrire une ligne
// d'une autre commande.
export async function updateLigneCommandeRecue(ligneId: number, commandeId: number, quantiteRecue: number): Promise<void> {
  const db = await getDb();
  await db.update(lignesCommandesFournisseurs)
    .set({ quantiteRecue: quantiteRecue.toFixed(2) })
    .where(and(eq(lignesCommandesFournisseurs.id, ligneId), eq(lignesCommandesFournisseurs.commandeId, commandeId)));
}

export async function getNextCommandeNumero(artisanId: number): Promise<string> {
  const db = await getDb();
  const result = await db.select({ numero: commandesFournisseurs.numero })
    .from(commandesFournisseurs)
    .where(eq(commandesFournisseurs.artisanId, artisanId))
    .orderBy(desc(commandesFournisseurs.id));
  let maxNum = 0;
  for (const row of result) {
    const match = row.numero?.match(/CMD-(\d+)/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `CMD-${String(maxNum + 1).padStart(5, '0')}`;
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

export async function getPaiementByToken(token: string): Promise<PaiementStripe | null> {
  const db = await getDb();
  const [result] = await db.select().from(paiementsStripe).where(eq(paiementsStripe.tokenPaiement, token)).limit(1);
  return result || null;
}

export async function updatePaiementStripe(id: number, data: Partial<InsertPaiementStripe>): Promise<void> {
  const db = await getDb();
  await db.update(paiementsStripe).set(data).where(eq(paiementsStripe.id, id));
}

// ============================================================================
// DASHBOARD STATS
// ============================================================================

export async function getDashboardStats(artisanId: number): Promise<any> {
  // Ancienne implementation : 4 SELECT complets ramenes en memoire Node, puis
  // filter/reduce en JavaScript → O(N) memoire pour 1000+ factures.
  // Nouvelle implementation : 8 agregations SQL → O(1) memoire Node + plus
  // rapide cote MySQL grace aux index idx_*_artisanId ajoutes par fix-duplicates.
  //
  // Note : colonnes en camelCase (artisanId, totalTTC, datePaiement,
  // dateDebut, createdAt), confirmees via drizzle/schema.ts.
  const pool = await ensurePool();

  // Toutes les queries lancees en parallele pour minimiser la latence totale.
  const [
    [caMonthRow],
    [caYearRow],
    [devisEnCoursRow],
    [facturesImpayeesRow],
    [totalClientsRow],
    [interventionsAVenirRow],
    [totalDevisRow],
    [totalFacturesRow],
    [totalInterventionsRow],
  ] = await Promise.all([
    pool.execute(
      `SELECT COALESCE(SUM(totalTTC), 0) AS total
       FROM factures
       WHERE artisanId = ?
         AND statut = 'payee'
         AND MONTH(COALESCE(datePaiement, createdAt)) = MONTH(CURRENT_DATE())
         AND YEAR(COALESCE(datePaiement, createdAt))  = YEAR(CURRENT_DATE())`,
      [artisanId]
    ),
    pool.execute(
      `SELECT COALESCE(SUM(totalTTC), 0) AS total
       FROM factures
       WHERE artisanId = ?
         AND statut = 'payee'
         AND YEAR(COALESCE(datePaiement, createdAt)) = YEAR(CURRENT_DATE())`,
      [artisanId]
    ),
    pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM devis
       WHERE artisanId = ?
         AND statut IN ('brouillon', 'envoye')`,
      [artisanId]
    ),
    pool.execute(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(totalTTC), 0) AS total
       FROM factures
       WHERE artisanId = ?
         AND statut NOT IN ('payee', 'annulee', 'brouillon')`,
      [artisanId]
    ),
    pool.execute(
      `SELECT COUNT(*) AS cnt FROM clients WHERE artisanId = ?`,
      [artisanId]
    ),
    pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM interventions
       WHERE artisanId = ?
         AND statut = 'planifiee'
         AND dateDebut >= NOW()`,
      [artisanId]
    ),
    pool.execute(
      `SELECT COUNT(*) AS cnt FROM devis WHERE artisanId = ?`,
      [artisanId]
    ),
    pool.execute(
      `SELECT COUNT(*) AS cnt FROM factures WHERE artisanId = ?`,
      [artisanId]
    ),
    pool.execute(
      `SELECT COUNT(*) AS cnt FROM interventions WHERE artisanId = ?`,
      [artisanId]
    ),
  ]) as any;

  const caMonth = Number(caMonthRow?.[0]?.total ?? 0);
  const caYear = Number(caYearRow?.[0]?.total ?? 0);
  const devisEnCours = Number(devisEnCoursRow?.[0]?.cnt ?? 0);
  const facturesImpayees = {
    count: Number(facturesImpayeesRow?.[0]?.cnt ?? 0),
    total: Number(facturesImpayeesRow?.[0]?.total ?? 0),
  };
  const totalClients = Number(totalClientsRow?.[0]?.cnt ?? 0);
  const interventionsAVenir = Number(interventionsAVenirRow?.[0]?.cnt ?? 0);
  const totalDevis = Number(totalDevisRow?.[0]?.cnt ?? 0);
  const totalFactures = Number(totalFacturesRow?.[0]?.cnt ?? 0);
  const totalInterventions = Number(totalInterventionsRow?.[0]?.cnt ?? 0);

  // Cles inchangees pour preserver la compatibilite avec le frontend
  // (Dashboard.tsx, dashboard router → alias chiffreAffaires/devisEnAttente).
  return {
    caMonth,
    caYear,
    devisEnCours,
    facturesImpayees,
    totalClients,
    interventionsAVenir,
    totalDevis,
    totalFactures,
    totalInterventions,
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

export type { User, InsertUser } from "../drizzle/schema";
export type { Artisan, InsertArtisan } from "../drizzle/schema";
export type { Client, InsertClient } from "../drizzle/schema";
export type { BibliothequeArticle, InsertBibliothequeArticle } from "../drizzle/schema";
export type { ArticleArtisan, InsertArticleArtisan } from "../drizzle/schema";
export type { Devis, InsertDevis } from "../drizzle/schema";
export type { DevisLigne, InsertDevisLigne } from "../drizzle/schema";
export type { Facture, InsertFacture } from "../drizzle/schema";
export type { FactureLigne, InsertFactureLigne } from "../drizzle/schema";
export type { Intervention, InsertIntervention } from "../drizzle/schema";
export type { Notification, InsertNotification } from "../drizzle/schema";
export type { ParametresArtisan, InsertParametresArtisan } from "../drizzle/schema";
export type { SignatureDevis, InsertSignatureDevis } from "../drizzle/schema";
export type { Stock, InsertStock } from "../drizzle/schema";
export type { MouvementStock, InsertMouvementStock } from "../drizzle/schema";
export type { Fournisseur, InsertFournisseur } from "../drizzle/schema";
export type { ArticleFournisseur, InsertArticleFournisseur } from "../drizzle/schema";
export type { SmsVerification, InsertSmsVerification } from "../drizzle/schema";
export type { RelanceDevis, InsertRelanceDevis } from "../drizzle/schema";
export type { ModeleEmail, InsertModeleEmail } from "../drizzle/schema";
export type { CommandeFournisseur, InsertCommandeFournisseur } from "../drizzle/schema";
export type { LigneCommandeFournisseur, InsertLigneCommandeFournisseur } from "../drizzle/schema";
export type { PaiementStripe, InsertPaiementStripe } from "../drizzle/schema";
export type { ModeleDevis, InsertModeleDevis } from "../drizzle/schema";
export type { ModeleDevisLigne, InsertModeleDevisLigne } from "../drizzle/schema";
export type { AvisClient, InsertAvisClient } from "../drizzle/schema";
export type { DemandeAvis, InsertDemandeAvis } from "../drizzle/schema";
export type { Technicien } from "../drizzle/schema";
export type { PositionTechnicien } from "../drizzle/schema";

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
  const newId = await insertReturningId(clientPortalAccess, data);
  const [created] = await db.select().from(clientPortalAccess)
    .where(eq(clientPortalAccess.id, newId));
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

// OPE-124 — fiche technicien liée à un compte utilisateur (scopée tenant). Base du filtrage
// « mes interventions » : résout l'utilisateur connecté vers SA ressource de planning.
export async function getTechnicienByUserId(userId: number, artisanId: number): Promise<Technicien | undefined> {
  const db = await getDb();
  const [result] = await db.select().from(techniciens)
    .where(and(eq(techniciens.userId, userId), eq(techniciens.artisanId, artisanId)))
    .limit(1);
  return result;
}

export async function createTechnicien(data: InsertTechnicien): Promise<Technicien> {
  const db = await getDb();
  const newId = await insertReturningId(techniciens, data);
  const [created] = await db.select().from(techniciens).where(eq(techniciens.id, newId));
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
  // OPE-162 — les habilitations/certifications sont des enfants PUREMENT opérationnels
  // du technicien (suivi de ses certifs, aucune valeur légale/historique propre) : sans
  // ce nettoyage, supprimer un technicien laisse des lignes habilitations_techniciens
  // orphelines. (Le reste des références — interventions/congés — relève d'une décision
  // de rétention distincte, cf. audit 2026-06-08-technicien-hard-delete-orphelins.)
  await db.delete(habilitationsTechniciens).where(eq(habilitationsTechniciens.technicienId, id));
  await db.delete(techniciens).where(eq(techniciens.id, id));
}

// ── Habilitations / certifications des techniciens (OPE-162) ──────────────────
// Suivi des habilitations BTP avec échéance (habilitation électrique, CACES,
// travail en hauteur, amiante SS4…). Toujours scopé par technicien (ownership
// vérifié en amont dans le routeur via assertTechnicienOwner).
export async function getHabilitationsByTechnicienId(technicienId: number): Promise<HabilitationTechnicien[]> {
  const db = await getDb();
  return await db.select().from(habilitationsTechniciens)
    .where(eq(habilitationsTechniciens.technicienId, technicienId))
    .orderBy(desc(habilitationsTechniciens.dateExpiration));
}

export async function createHabilitationTechnicien(data: InsertHabilitationTechnicien): Promise<HabilitationTechnicien> {
  const db = await getDb();
  const newId = await insertReturningId(habilitationsTechniciens, data);
  const [created] = await db.select().from(habilitationsTechniciens)
    .where(eq(habilitationsTechniciens.id, newId));
  return created;
}

// Suppression scopée : exige que l'habilitation appartienne bien au technicien
// fourni (lui-même déjà vérifié comme appartenant à l'artisan dans le routeur).
export async function deleteHabilitationTechnicien(id: number, technicienId: number): Promise<void> {
  const db = await getDb();
  await db.delete(habilitationsTechniciens).where(and(
    eq(habilitationsTechniciens.id, id),
    eq(habilitationsTechniciens.technicienId, technicienId),
  ));
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
    const newId = await insertReturningId(disponibilitesTechniciens, data);
    const [created] = await db.select().from(disponibilitesTechniciens)
      .where(eq(disponibilitesTechniciens.id, newId));
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
  const newId = await insertReturningId(positionsTechniciens, {
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
    .where(eq(positionsTechniciens.id, newId));
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
  const newId = await insertReturningId(historiqueDeplacements, data);
  const [created] = await db.select().from(historiqueDeplacements)
    .where(eq(historiqueDeplacements.id, newId));
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
  // Delete related data first — children PUREMENT opérationnels du chantier
  // (aucun document légal/fiscal). suivi_chantier (avancement/jalons) référence
  // chantierId mais n'était pas cascadé → lignes orphelines à la suppression.
  await db.delete(documentsChantier).where(eq(documentsChantier.chantierId, id));
  await db.delete(interventionsChantier).where(eq(interventionsChantier.chantierId, id));
  await db.delete(phasesChantier).where(eq(phasesChantier.chantierId, id));
  await db.delete(suiviChantier).where(eq(suiviChantier.chantierId, id));
  // OPE-106 — pointages de main-d'œuvre du chantier (heures, opérationnel) : sinon
  // lignes orphelines de pointages_chantier à la suppression du chantier.
  await db.delete(pointagesChantier).where(eq(pointagesChantier.chantierId, id));
  await db.delete(chantiers).where(eq(chantiers.id, id));
}

// Phases
export async function getPhasesByChantier(chantierId: number): Promise<PhaseChantier[]> {
  const db = await getDb();
  return await db.select().from(phasesChantier).where(eq(phasesChantier.chantierId, chantierId)).orderBy(asc(phasesChantier.ordre));
}

// ── Pointages de main-d'œuvre sur chantier (OPE-106) ─────────────────────────
// Toujours scopé `artisanId` ; l'ownership du chantier est vérifié en amont dans
// le routeur (assertChantierOwner). Tri par date décroissante (récents en tête).
export async function getPointagesByChantier(chantierId: number, artisanId: number): Promise<PointageChantier[]> {
  const db = await getDb();
  return await db.select().from(pointagesChantier)
    .where(and(eq(pointagesChantier.chantierId, chantierId), eq(pointagesChantier.artisanId, artisanId)))
    .orderBy(desc(pointagesChantier.date), desc(pointagesChantier.id));
}

export async function createPointageChantier(data: InsertPointageChantier): Promise<PointageChantier> {
  const db = await getDb();
  const newId = await insertReturningId(pointagesChantier, data);
  const [created] = await db.select().from(pointagesChantier).where(eq(pointagesChantier.id, newId));
  return created;
}

// Suppression scopée (chantier + artisan) — défense en profondeur en plus de l'ownership routeur.
export async function deletePointageChantier(id: number, chantierId: number, artisanId: number): Promise<void> {
  const db = await getDb();
  await db.delete(pointagesChantier).where(and(
    eq(pointagesChantier.id, id),
    eq(pointagesChantier.chantierId, chantierId),
    eq(pointagesChantier.artisanId, artisanId),
  ));
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

// Helpers ajoutes pour les checks ownership (chantier parent) — utilises
// par chantiersRouter pour interdire les modifs cross-tenant sur les
// sous-ressources (phases, documents, suivi).
export async function getPhaseChantierById(id: number): Promise<PhaseChantier | undefined> {
  const db = await getDb();
  const result = await db.select().from(phasesChantier).where(eq(phasesChantier.id, id)).limit(1);
  return result[0];
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

export async function getDocumentChantierById(id: number): Promise<DocumentChantier | undefined> {
  const db = await getDb();
  const result = await db.select().from(documentsChantier).where(eq(documentsChantier.id, id)).limit(1);
  return result[0];
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
  const budgetTotal = parseFloat(String(chantier.budgetPrevisionnel || '0'));

  // OPE-107 — coût réel AGRÉGÉ depuis les dépenses rattachées au chantier
  // (`depenses.chantier_id`) au lieu du champ `budgetRealise` statique (jamais
  // calculé, toujours 0). Scopé par `artisan_id` du chantier (multi-tenant).
  let coutReel = 0;
  try {
    const [agg] = await db.select({ total: sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)` })
      .from(depenses)
      .where(and(eq(depenses.chantier_id, chantierId), eq(depenses.artisan_id, chantier.artisanId)));
    coutReel = parseFloat(String(agg?.total ?? '0')) || 0;
  } catch (e: any) { console.warn('[getStatistiquesChantier] coutReel:', String(e?.message || e)); }
  // Repli sur le champ manuel `budgetRealise` s'il a été saisi et qu'aucune dépense
  // n'est rattachée (rétro-compat).
  const budgetRealiseManuel = parseFloat(String(chantier.budgetRealise || '0'));
  const budgetConsomme = coutReel > 0 ? coutReel : budgetRealiseManuel;
  const marge = budgetTotal > 0 ? budgetTotal - budgetConsomme : null;

  return {
    nombrePhases: phases.length,
    phasesTerminees,
    nombreInterventions: interventionsList.length,
    nombreDocuments: documents.length,
    budgetConsomme,
    budgetTotal,
    coutReel,
    marge,
    margePct: budgetTotal > 0 ? Math.round(((budgetTotal - budgetConsomme) / budgetTotal) * 100) : null,
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

export async function getSuiviChantierById(id: number): Promise<SuiviChantier | undefined> {
  const db = await getDb();
  const result = await db.select().from(suiviChantier).where(eq(suiviChantier.id, id)).limit(1);
  return result[0];
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

// Déclaration TVA détaillée (type CA3) : base HT et TVA collectée ventilées par
// taux (depuis les lignes de factures non brouillon/annulées), + TVA déductible.
export async function getDeclarationTVADetail(
  artisanId: number, dateDebut: Date, dateFin: Date,
): Promise<{ parTaux: { taux: number; baseHT: number; tvaCollectee: number }[]; tvaCollectee: number; tvaDeductible: number; tvaNette: number }> {
  const dbi = await getDb();
  const dStr = dateDebut.toISOString().slice(0, 10);
  const fStr = dateFin.toISOString().slice(0, 10);
  // Base + TVA collectée par taux, depuis les lignes de factures émises.
  // DATE(dateFacture) conservé en sql brut (timestamp ; neutre dialecte).
  const rows: any[] = await dbi.select({
    taux: facturesLignes.tauxTVA,
    baseHT: sql<string>`SUM(${facturesLignes.montantHT})`,
    tva: sql<string>`SUM(${facturesLignes.montantTVA})`,
  }).from(facturesLignes)
    .innerJoin(factures, eq(factures.id, facturesLignes.factureId))
    .where(and(
      eq(factures.artisanId, artisanId),
      sql`DATE(${factures.dateFacture}) BETWEEN ${dStr} AND ${fStr}`,
      inArray(factures.statut, ["validee", "envoyee", "payee", "en_retard"] as any),
    ))
    .groupBy(facturesLignes.tauxTVA)
    .orderBy(desc(facturesLignes.tauxTVA));
  const parTaux = (rows as any[]).map((r) => ({
    taux: Number(r.taux || 0),
    baseHT: Math.round(Number(r.baseHT || 0) * 100) / 100,
    tvaCollectee: Math.round(Number(r.tva || 0) * 100) / 100,
  }));
  const tvaCollectee = Math.round(parTaux.reduce((s, t) => s + t.tvaCollectee, 0) * 100) / 100;
  // TVA déductible depuis les dépenses déductibles (date_depense = colonne date).
  const [ded] = await dbi.select({
    tva: sql<string>`COALESCE(SUM(${depenses.montant_tva}), 0)`,
  }).from(depenses)
    .where(and(
      eq(depenses.artisan_id, artisanId),
      between(depenses.date_depense, dStr, fStr),
      eq(depenses.tva_deductible, true),
    ));
  const tvaDeductible = Math.round(Number(ded?.tva || 0) * 100) / 100;
  return { parTaux, tvaCollectee, tvaDeductible, tvaNette: Math.round((tvaCollectee - tvaDeductible) * 100) / 100 };
}

export async function genererEcrituresFacture(factureId: number): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Base de données indisponible");
  const [facture] = await db.select().from(factures).where(eq(factures.id, factureId)).limit(1);
  if (!facture) throw new Error("Facture non trouvée");

  const dateEcriture = facture.dateFacture || new Date();
  // OPE-136 — un avoir (note de credit) stocke des montants NEGATIFS ; on enregistre
  // l'ecriture en INVERSANT le sens des comptes, en valeur absolue (jamais de negatif,
  // coherent avec le FEC). Facture : 411 debit / 706 credit / 445 credit.
  // Avoir : 411 credit / 706 debit / 445 debit.
  const isAvoir = facture.typeDocument === 'avoir' || parseFloat(String(facture.totalTTC || '0')) < 0;
  const totalHT = Math.abs(parseFloat(String(facture.totalHT || '0')));
  const totalTVA = Math.abs(parseFloat(String(facture.totalTVA || '0')));
  const totalTTC = Math.abs(parseFloat(String(facture.totalTTC || '0')));
  const pieceRef = facture.numero || `F-${factureId}`;

  // Delete existing entries for this invoice
  await db.delete(ecrituresComptables).where(eq(ecrituresComptables.factureId, factureId));

  const lib = `${isAvoir ? 'Avoir' : 'Facture'} ${pieceRef}`;
  const entries = [
    // 411 - Client (TTC) : debit pour une facture, credit pour un avoir
    { artisanId: facture.artisanId, dateEcriture, journal: 'VE' as const, numeroCompte: '411000', libelleCompte: 'Clients', libelle: lib, pieceRef, debit: isAvoir ? '0.00' : totalTTC.toFixed(2), credit: isAvoir ? totalTTC.toFixed(2) : '0.00', factureId },
    // 706 - Ventes de prestations (HT) : credit pour une facture, debit pour un avoir
    { artisanId: facture.artisanId, dateEcriture, journal: 'VE' as const, numeroCompte: '706000', libelleCompte: 'Prestations de services', libelle: lib, pieceRef, debit: isAvoir ? totalHT.toFixed(2) : '0.00', credit: isAvoir ? '0.00' : totalHT.toFixed(2), factureId },
  ];

  if (totalTVA > 0) {
    // TVA collectée ventilée par taux (445711=20% / 445712=10% / 445713=5,5%),
    // depuis les lignes de facture. Repli sur le total si lignes indisponibles.
    // Les lignes d'avoir sont negatives : on prend la valeur absolue.
    const lignes = await db.select({ tauxTVA: facturesLignes.tauxTVA, montantTVA: facturesLignes.montantTVA })
      .from(facturesLignes).where(eq(facturesLignes.factureId, factureId));
    const parTaux = new Map<string, { compte: string; lib: string; montant: number }>();
    let sommeLignes = 0;
    for (const l of lignes) {
      const m = Math.abs(parseFloat(String(l.montantTVA || '0')));
      if (m <= 0) continue;
      sommeLignes += m;
      const t = compteTvaCollectee(parseFloat(String(l.tauxTVA || '20')));
      const cur = parTaux.get(t.compte) || { compte: t.compte, lib: t.lib, montant: 0 };
      cur.montant += m;
      parTaux.set(t.compte, cur);
    }
    if (parTaux.size > 0 && Math.abs(sommeLignes - totalTVA) < 0.02) {
      for (const t of Array.from(parTaux.values())) {
        entries.push({ artisanId: facture.artisanId, dateEcriture, journal: 'VE' as const, numeroCompte: t.compte, libelleCompte: t.lib, libelle: lib, pieceRef, debit: isAvoir ? t.montant.toFixed(2) : '0.00', credit: isAvoir ? '0.00' : t.montant.toFixed(2), factureId });
      }
    } else {
      entries.push({ artisanId: facture.artisanId, dateEcriture, journal: 'VE' as const, numeroCompte: '445711', libelleCompte: 'TVA collectée', libelle: lib, pieceRef, debit: isAvoir ? totalTVA.toFixed(2) : '0.00', credit: isAvoir ? '0.00' : totalTVA.toFixed(2), factureId });
    }
  }

  for (const entry of entries) {
    await db.insert(ecrituresComptables).values(entry);
  }

  return { success: true, nombreEcritures: entries.length };
}

// Ecritures d'encaissement (journal BANQUE) lors du reglement d'une facture :
// Debit 512 (Banque) / Credit 411 (Clients), lettre avec l'ecriture de vente.
// Idempotent : on purge d'abord les ecritures BQ existantes de la facture.
export async function genererEcrituresEncaissement(factureId: number): Promise<{ success: boolean; nombreEcritures: number }> {
  const db = await getDb();
  if (!db) throw new Error("Base de données indisponible");
  const [facture] = await db.select().from(factures).where(eq(factures.id, factureId)).limit(1);
  if (!facture) throw new Error("Facture non trouvée");

  // Purge des ecritures de banque precedentes de cette facture (idempotence).
  await db.delete(ecrituresComptables).where(and(
    eq(ecrituresComptables.factureId, factureId),
    eq(ecrituresComptables.journal, 'BQ'),
  ));

  if (facture.statut !== 'payee') return { success: true, nombreEcritures: 0 };

  const dateEcriture = facture.datePaiement || facture.dateFacture || new Date();
  const ttc = parseFloat(String(facture.totalTTC || '0'));
  if (ttc <= 0) return { success: true, nombreEcritures: 0 };
  const pieceRef = facture.numero || `F-${factureId}`;
  const lib = `Règlement ${pieceRef}`;
  const lettre = `VL${factureId}`;

  const entries = [
    { artisanId: facture.artisanId, dateEcriture, journal: 'BQ' as const, numeroCompte: '512000', libelleCompte: 'Banque', libelle: lib, pieceRef, debit: ttc.toFixed(2), credit: '0.00', factureId, lettrage: lettre },
    { artisanId: facture.artisanId, dateEcriture, journal: 'BQ' as const, numeroCompte: '411000', libelleCompte: 'Clients', libelle: lib, pieceRef, debit: '0.00', credit: ttc.toFixed(2), factureId, lettrage: lettre },
  ];
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

  // PCG aligné sur TOUS les comptes que le FEC/les écritures émettent réellement
  // (OPE-139) — sinon des comptes apparaissent dans le FEC sans exister dans le plan.
  const comptesParDefaut = [
    // Classe 4 — Tiers
    { numeroCompte: '401000', libelle: 'Fournisseurs', classe: 4, type: 'passif' as const },
    { numeroCompte: '411000', libelle: 'Clients', classe: 4, type: 'actif' as const },
    { numeroCompte: '445660', libelle: 'TVA déductible', classe: 4, type: 'actif' as const },
    { numeroCompte: '445710', libelle: 'TVA collectée', classe: 4, type: 'passif' as const },
    { numeroCompte: '445711', libelle: 'TVA collectée 20%', classe: 4, type: 'passif' as const },
    { numeroCompte: '445712', libelle: 'TVA collectée 10%', classe: 4, type: 'passif' as const },
    { numeroCompte: '445713', libelle: 'TVA collectée 5,5%', classe: 4, type: 'passif' as const },
    // Classe 5 — Financiers
    { numeroCompte: '512000', libelle: 'Banque', classe: 5, type: 'actif' as const },
    { numeroCompte: '530000', libelle: 'Caisse', classe: 5, type: 'actif' as const },
    // Classe 6 — Charges (alignées sur les catégories de dépense)
    { numeroCompte: '601000', libelle: 'Achats de matières premières', classe: 6, type: 'charge' as const },
    { numeroCompte: '604000', libelle: 'Achats de sous-traitance', classe: 6, type: 'charge' as const },
    { numeroCompte: '606100', libelle: 'Carburants', classe: 6, type: 'charge' as const },
    { numeroCompte: '607000', libelle: 'Achats de marchandises', classe: 6, type: 'charge' as const },
    { numeroCompte: '613000', libelle: 'Locations', classe: 6, type: 'charge' as const },
    { numeroCompte: '615000', libelle: 'Entretien et réparations', classe: 6, type: 'charge' as const },
    { numeroCompte: '616000', libelle: 'Primes d\'assurance', classe: 6, type: 'charge' as const },
    { numeroCompte: '623000', libelle: 'Formation', classe: 6, type: 'charge' as const },
    { numeroCompte: '625000', libelle: 'Déplacements', classe: 6, type: 'charge' as const },
    { numeroCompte: '625100', libelle: 'Voyages et déplacements', classe: 6, type: 'charge' as const },
    { numeroCompte: '626000', libelle: 'Frais postaux et télécom', classe: 6, type: 'charge' as const },
    { numeroCompte: '627000', libelle: 'Services bancaires', classe: 6, type: 'charge' as const },
    // Classe 7 — Produits
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

// OPE-155 — trésorerie prévisionnelle : projette par SEMAINE les ENCAISSEMENTS attendus
// (factures à encaisser, reste dû, par date d'échéance) − les DÉCAISSEMENTS attendus
// (dépenses récurrentes, expansées sur la période selon leur fréquence). Lecture seule,
// scopé `artisanId`, réutilise des données existantes (aucune nouvelle table). Le solde
// bancaire initial n'est pas intégré (hors MVP) → le « cumulatif » est un flux net relatif.
export async function getTresoreriePrevisionnelle(
  artisanId: number,
  semaines: number,
): Promise<{
  semaines: { debut: string; entrees: number; sorties: number; net: number; cumulatif: number }[];
  totalEntrees: number;
  totalSorties: number;
  totalNet: number;
}> {
  const db = await getDb();
  const WEEK_MS = 7 * 24 * 3600 * 1000;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const windowEnd = new Date(start.getTime() + semaines * WEEK_MS);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const buckets = Array.from({ length: semaines }, (_, i) => ({
    debut: new Date(start.getTime() + i * WEEK_MS),
    entrees: 0,
    sorties: 0,
  }));
  // Une date passée (en retard / échue) retombe dans la semaine 0 ; hors fenêtre = ignorée.
  const weekIndex = (d: Date): number => {
    const diff = d.getTime() - start.getTime();
    if (diff < 0) return 0;
    const idx = Math.floor(diff / WEEK_MS);
    return idx < semaines ? idx : -1;
  };

  // ── Encaissements attendus : factures à encaisser (reste dû) par date d'échéance ──
  const creances = await db.select({
    dateEcheance: factures.dateEcheance, totalTTC: factures.totalTTC, montantPaye: factures.montantPaye,
  }).from(factures).where(and(
    eq(factures.artisanId, artisanId),
    inArray(factures.statut, ["envoyee", "en_retard"] as any),
  ));
  for (const f of creances) {
    if (!f.dateEcheance) continue;
    const reste = (parseFloat(String(f.totalTTC || "0")) || 0) - (parseFloat(String(f.montantPaye || "0")) || 0);
    if (reste <= 0) continue;
    const ech = new Date(f.dateEcheance);
    if (isNaN(ech.getTime()) || ech >= windowEnd) continue;
    const idx = weekIndex(ech);
    if (idx >= 0) buckets[idx].entrees += reste;
  }

  // OPE-247 — les avoirs validés (crédits client non appliqués) réduisent les encaissements
  // attendus : on les nette globalement contre les entrées les plus PROCHES (semaine par
  // semaine), planché à 0. Sans ça la trésorerie côté créances est sur-optimiste.
  const avoirsRows = await db.select({ totalTTC: factures.totalTTC }).from(factures).where(and(
    eq(factures.artisanId, artisanId),
    eq(factures.typeDocument, "avoir"),
    inArray(factures.statut, ["validee", "envoyee", "en_retard", "payee"] as any),
  ));
  let creditAvoirs = avoirsRows.reduce((s, a) => s + Math.abs(parseFloat(String(a.totalTTC ?? "0")) || 0), 0);
  for (const b of buckets) {
    if (creditAvoirs <= 0) break;
    const use = Math.min(b.entrees, creditAvoirs);
    b.entrees -= use;
    creditAvoirs -= use;
  }

  // ── Décaissements attendus : dépenses récurrentes, expansées selon leur fréquence ──
  {
    const deps = await db.select({
      montant_ttc: depenses.montant_ttc,
      frequence_recurrence: depenses.frequence_recurrence,
      prochaine_occurrence: depenses.prochaine_occurrence,
    }).from(depenses).where(and(
      eq(depenses.artisan_id, artisanId),
      eq(depenses.recurrente, true),
      isNotNull(depenses.prochaine_occurrence),
    ));
    const stepMonths: Record<string, number> = { mensuelle: 1, trimestrielle: 3, annuelle: 12 };
    for (const d of deps as any[]) {
      const montant = parseFloat(String(d.montant_ttc || "0")) || 0;
      if (montant <= 0) continue;
      const step = stepMonths[String(d.frequence_recurrence)] || 0;
      let occ = new Date(d.prochaine_occurrence);
      let guard = 0;
      while (!isNaN(occ.getTime()) && occ < windowEnd && guard++ < 60) {
        const idx = weekIndex(occ);
        if (idx >= 0) buckets[idx].sorties += montant;
        if (step === 0) break; // fréquence inconnue → on ne compte qu'une occurrence
        occ = addMonthsClamped(occ, step); // OPE-249 — clamp fin de mois (pas de débordement)
      }
    }
  }

  let cumul = 0;
  let totalEntrees = 0;
  let totalSorties = 0;
  const out = buckets.map((b) => {
    const net = b.entrees - b.sorties;
    cumul += net;
    totalEntrees += b.entrees;
    totalSorties += b.sorties;
    return { debut: b.debut.toISOString().slice(0, 10), entrees: r2(b.entrees), sorties: r2(b.sorties), net: r2(net), cumulatif: r2(cumul) };
  });
  return { semaines: out, totalEntrees: r2(totalEntrees), totalSorties: r2(totalSorties), totalNet: r2(totalEntrees - totalSorties) };
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

// OPE-140 — contrats actifs dont l'échéance de facturation est atteinte (à facturer).
// Volet INDICATEUR (lecture seule) : aide l'artisan à ne pas oublier de facturer un
// contrat récurrent — la génération automatique n'est volontairement PAS faite ici.
// (Le filtre `<= fin de journée` exclut naturellement les `prochainFacturation` NULL.)
export async function getContratsAFacturer(artisanId: number): Promise<ContratMaintenance[]> {
  const db = await getDb();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return db.select().from(contratsMaintenance)
    .where(and(
      eq(contratsMaintenance.artisanId, artisanId),
      eq(contratsMaintenance.statut, "actif"),
      lte(contratsMaintenance.prochainFacturation, endOfToday),
    ))
    .orderBy(asc(contratsMaintenance.prochainFacturation));
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
  const insertId = await insertReturningId(contratsMaintenance, data);
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
  // OPE-177 — le schéma n'a pas de FK ON DELETE CASCADE : on nettoie manuellement les
  // enfants PUREMENT opérationnels du contrat, sinon ils restent orphelins (pointant un
  // contrat supprimé). On NE touche PAS aux factures elles-mêmes :
  //  - factures_recurrentes = table de LIAISON contrat↔facture (la facture générée reste) ;
  //  - interventions_contrat = visites de maintenance opérationnelles du contrat.
  // (Le routeur a déjà vérifié l'ownership artisan du contrat avant cet appel.)
  await db.delete(facturesRecurrentes).where(eq(facturesRecurrentes.contratId, id));
  await db.delete(interventionsContrat).where(eq(interventionsContrat.contratId, id));
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
  const insertId = await insertReturningId(facturesRecurrentes, data);
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

export async function getInterventionContratById(id: number): Promise<InterventionContrat | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(interventionsContrat).where(eq(interventionsContrat.id, id)).limit(1);
  return result[0];
}

export async function createInterventionContrat(data: InsertInterventionContrat): Promise<InterventionContrat> {
  const db = await getDb();
  const insertId = await insertReturningId(interventionsContrat, data);
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
  const newId = await insertReturningId(conversations, {
    artisanId, clientId, sujet: sujet || null, statut: "ouverte",
  });
  const created = await db.select().from(conversations).where(eq(conversations.id, newId)).limit(1);
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
  const insertId = await insertReturningId(messages, data);

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
      // OPE-184 : colonne interpolée (quotée par dialecte) — `nonLuClient` nu était
      // minusculé par Postgres → "column nonluclient does not exist".
      nonLuClient: sql`${conversations.nonLuClient} + 1`,
    }).where(eq(conversations.id, data.conversationId));
  } else {
    await db.update(conversations).set({
      ...updateData,
      nonLuArtisan: sql`${conversations.nonLuArtisan} + 1`,
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
  const insertId = await insertReturningId(rdvEnLigne, data);
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
  // OPE-251 — élargir la borne BASSE de récupération : une occupation qui COMMENCE
  // avant la fenêtre mais DÉBORDE dedans doit être prise en compte (sinon créneaux
  // faussement disponibles à la frontière). On récupère un sur-ensemble (jusqu'à 48h
  // avant `debut`) puis le test de chevauchement précis (côté getCreneauxDisponibles)
  // filtre exactement. 48h couvre toutes les durées réalistes d'intervention/RDV.
  const lookback = new Date(debut.getTime() - 48 * 60 * 60 * 1000);
  const interventionsList = await db.select({
    dateDebut: interventions.dateDebut,
    dateFin: interventions.dateFin,
  }).from(interventions)
    .where(and(
      eq(interventions.artisanId, artisanId),
      ne(interventions.statut, "annulee"),
      gte(interventions.dateDebut, lookback),
      lte(interventions.dateDebut, fin)
    ));

  const rdvList = await db.select({
    dateProposee: rdvEnLigne.dateProposee,
    dureeEstimee: rdvEnLigne.dureeEstimee,
  }).from(rdvEnLigne)
    .where(and(
      eq(rdvEnLigne.artisanId, artisanId),
      inArray(rdvEnLigne.statut, ["en_attente", "confirme"]),
      gte(rdvEnLigne.dateProposee, lookback),
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

// ============================================================================
// PERMISSIONS PER USER
// ============================================================================

export async function getUserPermissions(userId: number): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ permission: permissionsUtilisateur.permission })
    .from(permissionsUtilisateur)
    .where(and(
      eq(permissionsUtilisateur.userId, userId),
      eq(permissionsUtilisateur.autorise, true)
    ));
  return rows.map(r => r.permission);
}

export async function setUserPermissions(userId: number, permissions: string[], artisanId: number): Promise<void> {
  const db = await getDb();
  // Verify user belongs to this enterprise
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user[0] || user[0].artisanId !== artisanId) {
    throw new Error("Utilisateur non trouvé dans votre entreprise");
  }
  // Delete all existing permissions for this user
  await db.delete(permissionsUtilisateur).where(eq(permissionsUtilisateur.userId, userId));
  // Insert new permissions
  if (permissions.length > 0) {
    await db.insert(permissionsUtilisateur).values(
      permissions.map(p => ({ userId, permission: p, autorise: true }))
    );
  }
}

// ============================================================================
// BOOTSTRAP COMPTE ARTISAN (OPE-7)
// ----------------------------------------------------------------------------
// A l'inscription (auth.signup), le user etait cree seul : ni artisan, ni
// subscription, ni permissions. Resultat : 100% des endpoints metier en
// FORBIDDEN/NOT_FOUND et le checkout d'abonnement (ctx.user.artisanId null)
// impossible. Cette fonction provisionne tout ce qu'un compte proprietaire
// doit avoir, de facon IDEMPOTENTE (ne re-seed que ce qui manque) pour
// pouvoir aussi reparer un compte existant au prochain signin.
// ============================================================================
export async function bootstrapArtisanAccount(
  userId: number,
  opts?: { nomEntreprise?: string | null },
): Promise<Artisan> {
  // 1. Ligne artisans (idempotent via getOrCreateArtisan / UNIQUE(userId)).
  const artisan = await getOrCreateArtisan(
    userId,
    opts?.nomEntreprise ? { nomEntreprise: opts.nomEntreprise } : undefined,
  );

  // 2. Lier le proprietaire a sa propre entreprise. Requis par :
  //    - subscriptionRouter (ctx.user.artisanId) -> sinon checkout impossible
  //    - setUserPermissions (verifie users.artisanId === artisanId)
  const u = await getUserById(userId);
  if (u && u.artisanId !== artisan.id) {
    await updateUser(userId, { artisanId: artisan.id } as any);
  }

  // 3. Subscription d'essai (14 jours), seulement si absente.
  try {
    const existingSub = await getSubscription(artisan.id);
    if (!existingSub) {
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      await updateSubscription(artisan.id, {
        plan: 'trial',
        status: 'trialing',
        trialEndsAt,
        maxUsers: 1,
      });
    }
  } catch (e: any) {
    console.error('[Bootstrap] Subscription seed failed (non-blocking):', e?.message);
  }

  // 4. Permissions du proprietaire = TOUTES (y compris utilisateurs.gerer
  //    pour pouvoir inviter des collaborateurs). Seulement si aucune presente.
  try {
    const existingPerms = await getUserPermissions(userId);
    if (existingPerms.length === 0) {
      await setUserPermissions(userId, [...ALL_PERMISSIONS], artisan.id);
    }
  } catch (e: any) {
    console.error('[Bootstrap] Permission seed failed (non-blocking):', e?.message);
  }

  return artisan;
}

// ============================================================================
// Cache en memoire (TTL) pour les queries lues frequemment.
// Map<string, {data, expiresAt}> avec invalidation manuelle.
// ============================================================================
const memCache = new Map<string, { data: any; expiresAt: number }>();

function getCached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const c = memCache.get(key);
  if (c && c.expiresAt > Date.now()) return Promise.resolve(c.data as T);
  return fetcher().then((data) => {
    memCache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}

export function invalidateCache(prefix: string): void {
  for (const k of Array.from(memCache.keys())) {
    if (k.startsWith(prefix)) memCache.delete(k);
  }
}

// ============================================================================
// MODULES — catalogue + activation par artisan
//
// Implementation 100% raw SQL via mysql2 pool : on n'utilise PAS Drizzle ORM
// pour ces tables, donc PAS BESOIN de les declarer dans drizzle/schema.ts.
// Ca evite que drizzle-kit push (s'il etait reactive un jour) detecte une
// divergence entre schema.ts et la DB, ce qui avait causer le hang Railway.
// ============================================================================

async function ensurePool() {
  // Garantit que _pool est initialise avant tout raw query.
  await getDb();
  const p = getPool();
  if (!p) throw new Error('mysql pool unavailable');
  return p;
}

export interface ModuleRow {
  id: number;
  slug: string;
  label: string;
  description: string | null;
  icon: string;
  categorie: string;
  plan_minimum: string;
  actif_par_defaut: number; // tinyint(1)
  ordre: number;
}

// Mappe une ligne Drizzle `modules` (actif_par_defaut: boolean PG) vers ModuleRow
// (actif_par_defaut: number 1/0) — préserve le contrat consommé par routers.ts (=== 1).
function toModuleRow(r: any): ModuleRow {
  return { ...r, actif_par_defaut: r.actif_par_defaut ? 1 : 0 } as ModuleRow;
}

export async function getModules(): Promise<ModuleRow[]> {
  // Catalogue tres statique → cache 5 min, partage entre tous les artisans.
  return getCached("modules:all", 5 * 60 * 1000, async () => {
    const dbi = await getDb();
    const rows = await dbi.select().from(modules).orderBy(asc(modules.ordre));
    return rows.map(toModuleRow);
  });
}

export async function getModuleBySlug(slug: string): Promise<ModuleRow | undefined> {
  const dbi = await getDb();
  const rows = await dbi.select().from(modules).where(eq(modules.slug, slug)).limit(1);
  return rows[0] ? toModuleRow(rows[0]) : undefined;
}

/**
 * Slugs des modules actifs pour cet artisan.
 * - Si l'artisan n'a aucune entree artisan_modules → fallback sur les modules
 *   actif_par_defaut = 1 (cas d'un artisan jamais initialise).
 * - Sinon → uniquement les modules avec actif = 1.
 */
export async function getArtisanModulesActifs(artisanId: number): Promise<string[]> {
  // TTL 60s : les toggles modules invalident via invalidateCache("modules:actifs:").
  return getCached(`modules:actifs:${artisanId}`, 60 * 1000, async () => {
    const dbi = await getDb();
    const arr = await dbi.select({ module_slug: artisanModules.module_slug, actif: artisanModules.actif })
      .from(artisanModules).where(eq(artisanModules.artisan_id, artisanId));
    if (arr.length === 0) {
      const defaults = await dbi.select({ slug: modules.slug }).from(modules)
        .where(eq(modules.actif_par_defaut, true));
      return defaults.map((r) => r.slug);
    }
    return arr.filter((r) => r.actif === true).map((r) => r.module_slug);
  });
}

export async function setArtisanModule(
  artisanId: number,
  moduleSlug: string,
  actif: boolean
): Promise<void> {
  const dbi = await getDb();
  // Upsert sur la clé unique (artisan_id, module_slug) → onConflictDoUpdate.
  await dbi.insert(artisanModules).values({ artisan_id: artisanId, module_slug: moduleSlug, actif })
    .onConflictDoUpdate({
      target: [artisanModules.artisan_id, artisanModules.module_slug],
      set: { actif },
    });
  // Invalide le cache : la liste de modules actifs vient de changer.
  invalidateCache(`modules:actifs:${artisanId}`);
}

/**
 * Initialise les preferences d'un nouvel artisan : insere une entree pour
 * chaque module actif_par_defaut = TRUE. Idempotent (ON DUPLICATE KEY UPDATE).
 */
export async function initArtisanModules(artisanId: number): Promise<void> {
  const all = await getModules();
  for (const m of all) {
    if (m.actif_par_defaut) {
      await setArtisanModule(artisanId, m.slug, true);
    }
  }
}

export async function updateArtisanOnboarding(
  artisanId: number,
  data: { onboardingCompleted?: boolean; metier?: string; plan?: string }
): Promise<void> {
  // Set partiel dynamique (seuls les champs fournis sont mis à jour).
  const set: Record<string, any> = {};
  if (data.onboardingCompleted !== undefined) set.onboardingCompleted = data.onboardingCompleted;
  if (data.metier !== undefined) set.metier = data.metier;
  if (data.plan !== undefined) set.plan = data.plan;
  if (Object.keys(set).length === 0) return;
  const dbi = await getDb();
  await dbi.update(artisans).set(set).where(eq(artisans.id, artisanId));
}

/**
 * Lit les colonnes onboarding_completed / metier / plan d'un artisan via
 * raw SQL (ces colonnes ne sont pas dans le schema Drizzle). Renvoie null
 * si la table ne les a pas (vieille DB sans migration appliquee).
 */
export async function getArtisanOnboardingStatus(
  artisanId: number
): Promise<{ onboardingCompleted: boolean; metier: string | null; plan: string | null } | null> {
  try {
    const dbi = await getDb();
    const rows = await dbi.select({
      onboardingCompleted: artisans.onboardingCompleted,
      metier: artisans.metier,
      plan: artisans.plan,
    }).from(artisans).where(eq(artisans.id, artisanId)).limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      onboardingCompleted: r.onboardingCompleted === true,
      metier: r.metier ?? null,
      plan: r.plan ?? null,
    };
  } catch {
    // Colonnes absentes (migration pas encore appliquee) → null gracieux.
    return null;
  }
}

// ============================================================================
// T2 — Helpers subscriptions / devices / sessions (raw SQL)
// Les 3 tables n'existent PAS dans drizzle/schema.ts (regle absolue), donc
// tout passe par raw SQL avec snake_case (DB) → camelCase (TS) en sortie.
// ============================================================================

export interface SubscriptionRow {
  id: number;
  artisanId: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  maxUsers: number;
  maxDevicesPerUser: number;
  maxConcurrentSessions: number;
}

function rowToSubscription(r: any): SubscriptionRow | null {
  if (!r) return null;
  return {
    id: Number(r.id),
    artisanId: Number(r.artisan_id),
    stripeCustomerId: r.stripe_customer_id ?? null,
    stripeSubscriptionId: r.stripe_subscription_id ?? null,
    stripePriceId: r.stripe_price_id ?? null,
    plan: String(r.plan || 'trial'),
    status: String(r.status || 'trialing'),
    trialEndsAt: r.trial_ends_at ? new Date(r.trial_ends_at) : null,
    currentPeriodStart: r.current_period_start ? new Date(r.current_period_start) : null,
    currentPeriodEnd: r.current_period_end ? new Date(r.current_period_end) : null,
    cancelAtPeriodEnd: r.cancel_at_period_end === 1 || r.cancel_at_period_end === true,
    maxUsers: Number(r.max_users || 1),
    maxDevicesPerUser: Number(r.max_devices_per_user || 3),
    maxConcurrentSessions: Number(r.max_concurrent_sessions || 2),
  };
}

export async function getSubscription(artisanId: number): Promise<SubscriptionRow | null> {
  try {
    const dbi = await getDb();
    const rows = await dbi.select().from(subscriptions)
      .where(eq(subscriptions.artisan_id, artisanId)).limit(1);
    return rowToSubscription(rows[0]);
  } catch (e) {
    // Table pas encore migree : on renvoie null, l'appelant traitera comme
    // un essai gratuit (= ne bloque personne).
    return null;
  }
}

export interface UpdateSubscriptionInput {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  plan?: string;
  status?: string;
  trialEndsAt?: Date | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  maxUsers?: number;
  maxDevicesPerUser?: number;
  maxConcurrentSessions?: number;
}

// Mapping camelCase TS -> snake_case SQL.
const SUB_COL_MAP: Record<keyof UpdateSubscriptionInput, string> = {
  stripeCustomerId: 'stripe_customer_id',
  stripeSubscriptionId: 'stripe_subscription_id',
  stripePriceId: 'stripe_price_id',
  plan: 'plan',
  status: 'status',
  trialEndsAt: 'trial_ends_at',
  currentPeriodStart: 'current_period_start',
  currentPeriodEnd: 'current_period_end',
  cancelAtPeriodEnd: 'cancel_at_period_end',
  maxUsers: 'max_users',
  maxDevicesPerUser: 'max_devices_per_user',
  maxConcurrentSessions: 'max_concurrent_sessions',
};

export async function updateSubscription(artisanId: number, data: UpdateSubscriptionInput): Promise<void> {
  // Set keyé par les noms de colonnes Drizzle (snake_case, = valeurs de SUB_COL_MAP).
  const setObj: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue;
    const sqlCol = SUB_COL_MAP[key as keyof UpdateSubscriptionInput];
    if (!sqlCol) continue;
    setObj[sqlCol] = val;
  }
  if (Object.keys(setObj).length === 0) return;

  // INSERT-or-UPDATE atomique sur la clé unique artisan_id (remplace l'ancien
  // UPDATE-puis-INSERT IGNORE, sujet à une race). Les colonnes non fournies
  // prennent leur défaut de schéma à l'insert (plan='trial', max_users=1, …).
  const dbi = await getDb();
  await dbi.insert(subscriptions).values({ artisan_id: artisanId, ...setObj } as any)
    .onConflictDoUpdate({ target: subscriptions.artisan_id, set: setObj });
}

export async function getSubscriptionByCustomerId(customerId: string): Promise<SubscriptionRow | null> {
  try {
    const dbi = await getDb();
    const rows = await dbi.select().from(subscriptions)
      .where(eq(subscriptions.stripe_customer_id, customerId)).limit(1);
    return rowToSubscription(rows[0]);
  } catch {
    return null;
  }
}

// ---- Devices ----

export interface DeviceRow {
  id: number;
  userId: number;
  artisanId: number;
  deviceFingerprint: string;
  deviceType: string;
  browser: string | null;
  os: string | null;
  lastIp: string | null;
  lastActiveAt: Date | null;
  createdAt: Date | null;
}

function rowToDevice(r: any): DeviceRow {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    artisanId: Number(r.artisan_id),
    deviceFingerprint: String(r.device_fingerprint),
    deviceType: String(r.device_type || 'desktop'),
    browser: r.browser ?? null,
    os: r.os ?? null,
    lastIp: r.last_ip ?? null,
    lastActiveAt: r.last_active_at ? new Date(r.last_active_at) : null,
    createdAt: r.created_at ? new Date(r.created_at) : null,
  };
}

export async function getDevices(userId: number): Promise<DeviceRow[]> {
  try {
    const dbi = await getDb();
    const rows = await dbi.select().from(devices)
      .where(eq(devices.user_id, userId)).orderBy(desc(devices.last_active_at));
    return rows.map(rowToDevice);
  } catch {
    return [];
  }
}

export async function getDevice(userId: number, fingerprint: string): Promise<DeviceRow | null> {
  try {
    const dbi = await getDb();
    const rows = await dbi.select().from(devices)
      .where(and(eq(devices.user_id, userId), eq(devices.device_fingerprint, fingerprint))).limit(1);
    return rows[0] ? rowToDevice(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function registerDevice(params: {
  userId: number;
  artisanId: number;
  fingerprint: string;
  deviceType: string;
  browser: string;
  os: string;
  ip: string;
}): Promise<void> {
  try {
    const dbi = await getDb();
    // Upsert sur l'unique (user_id, device_fingerprint). last_active_at rafraîchi
    // explicitement à CURRENT_TIMESTAMP en cas de conflit (le device se reconnecte).
    await dbi.insert(devices).values({
      user_id: params.userId, artisan_id: params.artisanId, device_fingerprint: params.fingerprint,
      device_type: params.deviceType, browser: params.browser, os: params.os, last_ip: params.ip,
    }).onConflictDoUpdate({
      target: [devices.user_id, devices.device_fingerprint],
      set: {
        device_type: params.deviceType, browser: params.browser, os: params.os,
        last_ip: params.ip, last_active_at: sql`CURRENT_TIMESTAMP`,
      },
    });
  } catch (e: any) {
    // On ne bloque jamais la requete utilisateur sur un fail d'enregistrement
    // device. On loggue et on continue.
    console.warn('[registerDevice] failed:', e?.message || e);
  }
}

export async function countActiveDevices(userId: number): Promise<number> {
  try {
    const dbi = await getDb();
    const [row] = await dbi.select({ cnt: sql<number>`COUNT(DISTINCT ${devices.device_fingerprint})` })
      .from(devices).where(eq(devices.user_id, userId));
    return Number(row?.cnt || 0);
  } catch {
    return 0;
  }
}

export async function deleteDevice(deviceId: number, userId: number): Promise<void> {
  const dbi = await getDb();
  await dbi.delete(devices).where(and(eq(devices.id, deviceId), eq(devices.user_id, userId)));
}

export async function deleteOtherDevices(userId: number, currentFingerprint: string): Promise<number> {
  try {
    const dbi = await getDb();
    const deleted = await dbi.delete(devices)
      .where(and(eq(devices.user_id, userId), ne(devices.device_fingerprint, currentFingerprint)))
      .returning({ id: devices.id });
    return deleted.length;
  } catch {
    return 0;
  }
}

// ---- Sessions ----

export interface SessionRow {
  id: number;
  userId: number;
  artisanId: number;
  sessionToken: string;
  deviceFingerprint: string | null;
  ip: string | null;
  startedAt: Date | null;
  lastActiveAt: Date | null;
  expiresAt: Date | null;
}

function rowToSession(r: any): SessionRow {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    artisanId: Number(r.artisan_id),
    sessionToken: String(r.session_token),
    deviceFingerprint: r.device_fingerprint ?? null,
    ip: r.ip ?? null,
    startedAt: r.started_at ? new Date(r.started_at) : null,
    lastActiveAt: r.last_active_at ? new Date(r.last_active_at) : null,
    expiresAt: r.expires_at ? new Date(r.expires_at) : null,
  };
}

export async function getActiveSessions(userId: number): Promise<SessionRow[]> {
  try {
    const pool = await ensurePool();
    const [rows] = await pool.execute(
      'SELECT * FROM active_sessions WHERE user_id = ? AND expires_at > NOW() ORDER BY last_active_at DESC',
      [userId]
    ) as any;
    return (rows as any[]).map(rowToSession);
  } catch {
    return [];
  }
}

export async function countActiveSessions(userId: number): Promise<number> {
  try {
    const pool = await ensurePool();
    const [rows] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM active_sessions WHERE user_id = ? AND expires_at > NOW()',
      [userId]
    ) as any;
    return Number((rows as any[])[0]?.cnt || 0);
  } catch {
    return 0;
  }
}

export async function createSession(params: {
  userId: number;
  artisanId: number;
  token: string;
  fingerprint: string | null;
  ip: string | null;
  ttlDays?: number;
}): Promise<void> {
  try {
    const pool = await ensurePool();
    const ttl = params.ttlDays || 7;
    await pool.execute(
      `INSERT INTO active_sessions
         (user_id, artisan_id, session_token, device_fingerprint, ip, expires_at)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))
       ON DUPLICATE KEY UPDATE last_active_at = CURRENT_TIMESTAMP, expires_at = DATE_ADD(NOW(), INTERVAL ? DAY)`,
      [params.userId, params.artisanId, params.token, params.fingerprint, params.ip, ttl, ttl]
    );
  } catch (e: any) {
    console.warn('[createSession] failed:', e?.message || e);
  }
}

export async function deleteOldestSession(userId: number): Promise<void> {
  try {
    const pool = await ensurePool();
    // MySQL ne supporte pas DELETE ... ORDER BY LIMIT dans toutes les
    // configurations. On selectionne d'abord l'id, puis on delete.
    const [rows] = await pool.execute(
      `SELECT id FROM active_sessions WHERE user_id = ? AND expires_at > NOW()
       ORDER BY last_active_at ASC LIMIT 1`,
      [userId]
    ) as any;
    const oldId = (rows as any[])[0]?.id;
    if (oldId) {
      await pool.execute('DELETE FROM active_sessions WHERE id = ?', [oldId]);
    }
  } catch (e: any) {
    console.warn('[deleteOldestSession] failed:', e?.message || e);
  }
}

export async function cleanExpiredSessions(): Promise<number> {
  try {
    const pool = await ensurePool();
    const [r] = await pool.execute(
      'DELETE FROM active_sessions WHERE expires_at < NOW()'
    ) as any;
    return Number(r.affectedRows || 0);
  } catch {
    return 0;
  }
}

// Map plan -> limites par defaut (utilise par webhook + middleware quand on
// veut deriver les bonnes valeurs sans hardcoder dans Stripe metadata).
export const PLAN_LIMITS: Record<string, { maxUsers: number; maxDevices: number; maxSessions: number }> = {
  trial:      { maxUsers: 1,  maxDevices: 3, maxSessions: 2 },
  essentiel:  { maxUsers: 1,  maxDevices: 3, maxSessions: 2 },
  pro:        { maxUsers: 3,  maxDevices: 3, maxSessions: 3 },
  entreprise: { maxUsers: 10, maxDevices: 3, maxSessions: 4 },
  expired:    { maxUsers: 0,  maxDevices: 0, maxSessions: 0 },
};

// ============================================================================
// COULEURS CALENDRIER (table couleurs_interventions, raw SQL)
// Stocke la couleur custom de chaque intervention pour l'affichage calendrier.
// Cle composite (artisanId, interventionId) -> filtre naturel cross-tenant.
// ============================================================================

export async function getCouleursCalendrier(
  artisanId: number
): Promise<Record<number, string>> {
  const dbi = await getDb();
  try {
    const rows = await dbi.select({ interventionId: couleursInterventions.interventionId, couleur: couleursInterventions.couleur })
      .from(couleursInterventions).where(eq(couleursInterventions.artisanId, artisanId));
    const out: Record<number, string> = {};
    for (const r of rows as any[]) {
      out[r.interventionId] = r.couleur;
    }
    return out;
  } catch (e: any) {
    console.warn("[getCouleursCalendrier]", e?.message || e);
    return {};
  }
}

export async function setCouleurIntervention(
  artisanId: number,
  interventionId: number,
  couleur: string
): Promise<void> {
  const dbi = await getDb();
  // Upsert idempotent sur la PK composite (artisanId, interventionId).
  await dbi.insert(couleursInterventions).values({ artisanId, interventionId, couleur })
    .onConflictDoUpdate({
      target: [couleursInterventions.artisanId, couleursInterventions.interventionId],
      set: { couleur },
    });
}

export async function deleteCouleurIntervention(
  artisanId: number,
  interventionId: number
): Promise<void> {
  const dbi = await getDb();
  await dbi.delete(couleursInterventions)
    .where(and(eq(couleursInterventions.artisanId, artisanId), eq(couleursInterventions.interventionId, interventionId)));
}

export async function setCouleursMultiples(
  artisanId: number,
  couleurs: Record<number, string>
): Promise<void> {
  const dbi = await getDb();
  const entries = Object.entries(couleurs);
  if (entries.length === 0) return;
  // Batch : 1 seul INSERT multi-rows + upsert sur la PK composite.
  const rows = entries.map(([k, v]) => ({ artisanId, interventionId: parseInt(k, 10), couleur: v }));
  await dbi.insert(couleursInterventions).values(rows)
    .onConflictDoUpdate({
      target: [couleursInterventions.artisanId, couleursInterventions.interventionId],
      set: { couleur: sql`excluded.couleur` },
    });
}

// ============================================================================
// INTERVENTIONS MOBILE (table interventions_mobile, raw SQL)
// Donnees terrain ajoutees par le technicien : heures arrivee/depart, geoloc,
// notes, signature client. 1 record par intervention (uq interventionId).
// ============================================================================

type InterventionMobileRow = {
  id: number;
  interventionId: number;
  artisanId: number;
  latitude: string | null;
  longitude: string | null;
  heureArrivee: Date | null;
  heureDepart: Date | null;
  notesIntervention: string | null;
  signatureClient: string | null;
  signatureDate: Date | null;
  syncStatus: string | null;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// OPE-173 — récupère en UNE requête les horodatages mobiles (arrivée/départ) de toutes
// les interventions d'un artisan, pour afficher la durée réelle sur site côté desktop sans
// N+1. Scopé tenant. Retourne une map interventionId -> { heureArrivee, heureDepart }.
export async function getInterventionsMobileByArtisanId(
  artisanId: number
): Promise<Array<{ interventionId: number; heureArrivee: any; heureDepart: any }>> {
  const db = await getDb();
  try {
    return await db.select({
      interventionId: interventionsMobile.interventionId,
      heureArrivee: interventionsMobile.heureArrivee,
      heureDepart: interventionsMobile.heureDepart,
    }).from(interventionsMobile).where(eq(interventionsMobile.artisanId, artisanId));
  } catch (e: any) {
    console.warn("[getInterventionsMobileByArtisanId]", e?.message || e);
    return [];
  }
}

export async function getInterventionMobileByInterventionId(
  interventionId: number
): Promise<InterventionMobileRow | null> {
  const db = await getDb();
  try {
    const [r] = await db.select().from(interventionsMobile)
      .where(eq(interventionsMobile.interventionId, interventionId)).limit(1);
    return (r as any) || null;
  } catch (e: any) {
    console.warn("[getInterventionMobileByInterventionId]", e?.message || e);
    return null;
  }
}

type InterventionMobileWritable = Partial<{
  heureArrivee: Date | null;
  heureDepart: Date | null;
  latitude: string | null;
  longitude: string | null;
  notesIntervention: string | null;
  signatureClient: string | null;
  signatureDate: Date | null;
  syncStatus: string | null;
  lastSyncAt: Date | null;
}>;

export async function createInterventionMobile(
  data: { interventionId: number; artisanId: number } & InterventionMobileWritable
): Promise<InterventionMobileRow | null> {
  const db = await getDb();
  const values: any = { interventionId: data.interventionId, artisanId: data.artisanId };
  for (const k of [
    "heureArrivee", "heureDepart", "latitude", "longitude",
    "notesIntervention", "signatureClient", "signatureDate", "syncStatus", "lastSyncAt",
  ] as const) {
    if (data[k] !== undefined) values[k] = data[k];
  }
  const insertId = await insertReturningId(interventionsMobile, values);
  if (!insertId) return null;
  const [row] = await db.select().from(interventionsMobile)
    .where(eq(interventionsMobile.id, insertId)).limit(1);
  return (row as any) || null;
}

export async function updateInterventionMobile(
  mobileId: number,
  data: InterventionMobileWritable
): Promise<InterventionMobileRow | null> {
  const db = await getDb();
  const sets: any = {};
  for (const k of [
    "heureArrivee", "heureDepart", "latitude", "longitude",
    "notesIntervention", "signatureClient", "signatureDate", "syncStatus", "lastSyncAt",
  ] as const) {
    if (data[k] !== undefined) sets[k] = data[k];
  }
  if (Object.keys(sets).length > 0) {
    await db.update(interventionsMobile).set(sets).where(eq(interventionsMobile.id, mobileId));
  }
  const [row] = await db.select().from(interventionsMobile)
    .where(eq(interventionsMobile.id, mobileId)).limit(1);
  return (row as any) || null;
}

// ============================================================================
// PHOTOS INTERVENTIONS (table photos_interventions, raw SQL)
// Photos prises avant / pendant / apres l'intervention par le technicien.
// ============================================================================

export async function createPhotoIntervention(data: {
  interventionMobileId: number;
  url: string;
  description?: string | null;
  type?: "avant" | "pendant" | "apres";
}): Promise<{ id: number; url: string; description: string | null; type: string } | null> {
  const db = await getDb();
  const insertId = await insertReturningId(photosInterventions, {
    interventionMobileId: data.interventionMobileId,
    url: data.url,
    description: data.description ?? null,
    type: data.type ?? "pendant",
  });
  if (!insertId) return null;
  const [row] = await db.select({
    id: photosInterventions.id, url: photosInterventions.url,
    description: photosInterventions.description, type: photosInterventions.type,
    takenAt: photosInterventions.takenAt, createdAt: photosInterventions.createdAt,
  }).from(photosInterventions).where(eq(photosInterventions.id, insertId)).limit(1);
  return (row as any) || null;
}

export async function getPhotosByInterventionMobileId(
  mobileId: number
): Promise<Array<{ id: number; url: string; description: string | null; type: string }>> {
  const db = await getDb();
  return await db.select({
    id: photosInterventions.id, url: photosInterventions.url,
    description: photosInterventions.description, type: photosInterventions.type,
    takenAt: photosInterventions.takenAt, createdAt: photosInterventions.createdAt,
  }).from(photosInterventions)
    .where(eq(photosInterventions.interventionMobileId, mobileId))
    .orderBy(desc(photosInterventions.takenAt));
}

// ============================================================================
// VEHICULES (flotte, kilometrage, entretiens, assurances) - Drizzle ORM
// ============================================================================

export async function getVehiculesByArtisan(artisanId: number): Promise<Vehicule[]> {
  const dbi = await getDb();
  return await dbi.select().from(vehicules).where(eq(vehicules.artisanId, artisanId)).orderBy(desc(vehicules.createdAt));
}

export async function getVehiculeById(id: number): Promise<Vehicule | undefined> {
  const dbi = await getDb();
  const r = await dbi.select().from(vehicules).where(eq(vehicules.id, id)).limit(1);
  return r[0];
}

export async function createVehicule(data: InsertVehicule): Promise<Vehicule | undefined> {
  const dbi = await getDb();
  await dbi.insert(vehicules).values(data);
  const r = await dbi.select().from(vehicules)
    .where(and(eq(vehicules.artisanId, data.artisanId), eq(vehicules.immatriculation, data.immatriculation)))
    .orderBy(desc(vehicules.id)).limit(1);
  return r[0];
}

export async function updateVehicule(id: number, data: Partial<InsertVehicule>): Promise<Vehicule | undefined> {
  const dbi = await getDb();
  await dbi.update(vehicules).set(data).where(eq(vehicules.id, id));
  return getVehiculeById(id);
}

export async function deleteVehicule(id: number): Promise<void> {
  const dbi = await getDb();
  // Cascade : retirer historique / entretiens / assurances avant le vehicule.
  await dbi.delete(historiqueKilometrage).where(eq(historiqueKilometrage.vehiculeId, id));
  await dbi.delete(entretiensVehicules).where(eq(entretiensVehicules.vehiculeId, id));
  await dbi.delete(assurancesVehicules).where(eq(assurancesVehicules.vehiculeId, id));
  await dbi.delete(vehicules).where(eq(vehicules.id, id));
}

export async function addHistoriqueKilometrage(
  data: InsertHistoriqueKilometrage
): Promise<HistoriqueKilometrage | undefined> {
  const dbi = await getDb();
  await dbi.insert(historiqueKilometrage).values(data);
  // Met a jour le kilometrage actuel du vehicule s'il est superieur.
  const veh = await getVehiculeById(data.vehiculeId);
  if (veh && (veh.kilometrageActuel || 0) < data.kilometrage) {
    await dbi.update(vehicules)
      .set({ kilometrageActuel: data.kilometrage })
      .where(eq(vehicules.id, data.vehiculeId));
  }
  const r = await dbi.select().from(historiqueKilometrage)
    .where(eq(historiqueKilometrage.vehiculeId, data.vehiculeId))
    .orderBy(desc(historiqueKilometrage.id)).limit(1);
  return r[0];
}

export async function getHistoriqueKilometrageByVehicule(
  vehiculeId: number
): Promise<HistoriqueKilometrage[]> {
  const dbi = await getDb();
  return await dbi.select().from(historiqueKilometrage)
    .where(eq(historiqueKilometrage.vehiculeId, vehiculeId))
    .orderBy(desc(historiqueKilometrage.dateReleve));
}

export async function createEntretienVehicule(
  data: InsertEntretienVehicule
): Promise<EntretienVehicule | undefined> {
  const dbi = await getDb();
  await dbi.insert(entretiensVehicules).values(data);
  const r = await dbi.select().from(entretiensVehicules)
    .where(eq(entretiensVehicules.vehiculeId, data.vehiculeId))
    .orderBy(desc(entretiensVehicules.id)).limit(1);
  return r[0];
}

export async function getEntretiensByVehicule(
  vehiculeId: number
): Promise<EntretienVehicule[]> {
  const dbi = await getDb();
  return await dbi.select().from(entretiensVehicules)
    .where(eq(entretiensVehicules.vehiculeId, vehiculeId))
    .orderBy(desc(entretiensVehicules.dateEntretien));
}

export async function getEntretiensAVenir(artisanId: number): Promise<any[]> {
  // Entretiens dont la prochaine date est dans les 60 jours, pour les
  // vehicules de l'artisan. Jointure manuelle car prochainEntretienDate
  // peut etre null (on filtre).
  const dbi = await getDb();
  const today = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 60);
  const horizonStr = horizon.toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);
  return await dbi.select({
    id: entretiensVehicules.id,
    vehiculeId: entretiensVehicules.vehiculeId,
    type: entretiensVehicules.type,
    prochainEntretienDate: entretiensVehicules.prochainEntretienDate,
    prochainEntretienKm: entretiensVehicules.prochainEntretienKm,
    immatriculation: vehicules.immatriculation,
    marque: vehicules.marque,
    modele: vehicules.modele,
  })
    .from(entretiensVehicules)
    .innerJoin(vehicules, eq(vehicules.id, entretiensVehicules.vehiculeId))
    .where(and(
      eq(vehicules.artisanId, artisanId),
      gte(entretiensVehicules.prochainEntretienDate, todayStr),
      lte(entretiensVehicules.prochainEntretienDate, horizonStr),
    ))
    .orderBy(asc(entretiensVehicules.prochainEntretienDate));
}

export async function createAssuranceVehicule(
  data: InsertAssuranceVehicule
): Promise<AssuranceVehicule | undefined> {
  const dbi = await getDb();
  await dbi.insert(assurancesVehicules).values(data);
  const r = await dbi.select().from(assurancesVehicules)
    .where(eq(assurancesVehicules.vehiculeId, data.vehiculeId))
    .orderBy(desc(assurancesVehicules.id)).limit(1);
  return r[0];
}

export async function getAssurancesByVehicule(
  vehiculeId: number
): Promise<AssuranceVehicule[]> {
  const dbi = await getDb();
  return await dbi.select().from(assurancesVehicules)
    .where(eq(assurancesVehicules.vehiculeId, vehiculeId))
    .orderBy(desc(assurancesVehicules.dateFin));
}

export async function getAssurancesExpirant(
  artisanId: number,
  daysAhead: number = 30
): Promise<any[]> {
  // Assurances dont dateFin est dans <daysAhead> jours, pour les
  // vehicules de l'artisan.
  const dbi = await getDb();
  const today = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + daysAhead);
  return await dbi.select({
    id: assurancesVehicules.id,
    vehiculeId: assurancesVehicules.vehiculeId,
    compagnie: assurancesVehicules.compagnie,
    numeroContrat: assurancesVehicules.numeroContrat,
    dateFin: assurancesVehicules.dateFin,
    immatriculation: vehicules.immatriculation,
    marque: vehicules.marque,
    modele: vehicules.modele,
  })
    .from(assurancesVehicules)
    .innerJoin(vehicules, eq(vehicules.id, assurancesVehicules.vehiculeId))
    .where(and(
      eq(vehicules.artisanId, artisanId),
      gte(assurancesVehicules.dateFin, today.toISOString().slice(0, 10)),
      lte(assurancesVehicules.dateFin, horizon.toISOString().slice(0, 10)),
    ))
    .orderBy(asc(assurancesVehicules.dateFin));
}

export async function getStatistiquesFlotte(artisanId: number): Promise<{
  nbVehicules: number;
  nbActifs: number;
  nbEnMaintenance: number;
  kmTotalFlotte: number;
  coutEntretienAnneeEnCours: number;
  assurancesAExpirer: number;
}> {
  const dbi = await getDb();
  const vehs = await dbi.select().from(vehicules).where(eq(vehicules.artisanId, artisanId));
  const nbVehicules = vehs.length;
  const nbActifs = vehs.filter((v) => v.statut === "actif").length;
  const nbEnMaintenance = vehs.filter((v) => v.statut === "en_maintenance").length;
  const kmTotalFlotte = vehs.reduce((s, v) => s + (v.kilometrageActuel || 0), 0);

  // Cout entretiens annee courante
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearEnd = `${new Date().getFullYear()}-12-31`;
  const vehiculeIds = vehs.map((v) => v.id);
  let coutEntretienAnneeEnCours = 0;
  if (vehiculeIds.length > 0) {
    const ents = await dbi.select().from(entretiensVehicules)
      .where(and(
        inArray(entretiensVehicules.vehiculeId, vehiculeIds),
        gte(entretiensVehicules.dateEntretien, yearStart),
        lte(entretiensVehicules.dateEntretien, yearEnd),
      ));
    coutEntretienAnneeEnCours = ents.reduce(
      (s, e) => s + Number(e.cout || 0),
      0
    );
  }

  const assurances = await getAssurancesExpirant(artisanId, 60);
  return {
    nbVehicules,
    nbActifs,
    nbEnMaintenance,
    kmTotalFlotte,
    coutEntretienAnneeEnCours,
    assurancesAExpirer: assurances.length,
  };
}

// ============================================================================
// CONGES (demandes + soldes) - Drizzle ORM
// ============================================================================

export async function getCongesByArtisan(
  artisanId: number,
  statut?: string
): Promise<Conge[]> {
  const dbi = await getDb();
  const conditions = [eq(conges.artisanId, artisanId)];
  if (statut) conditions.push(eq(conges.statut, statut as any));
  return await dbi.select().from(conges)
    .where(and(...conditions))
    .orderBy(desc(conges.dateDebut));
}

export async function getCongesEnAttente(artisanId: number): Promise<Conge[]> {
  const dbi = await getDb();
  return await dbi.select().from(conges)
    .where(and(eq(conges.artisanId, artisanId), eq(conges.statut, "en_attente")))
    .orderBy(asc(conges.dateDebut));
}

export async function getCongesByTechnicien(technicienId: number): Promise<Conge[]> {
  const dbi = await getDb();
  return await dbi.select().from(conges)
    .where(eq(conges.technicienId, technicienId))
    .orderBy(desc(conges.dateDebut));
}

export async function getCongesParPeriode(
  artisanId: number,
  dateDebut: string,
  dateFin: string
): Promise<Conge[]> {
  const dbi = await getDb();
  return await dbi.select().from(conges)
    .where(and(
      eq(conges.artisanId, artisanId),
      lte(conges.dateDebut, dateFin),
      gte(conges.dateFin, dateDebut),
    ))
    .orderBy(asc(conges.dateDebut));
}

export async function getCongeById(id: number): Promise<Conge | undefined> {
  const dbi = await getDb();
  const r = await dbi.select().from(conges).where(eq(conges.id, id)).limit(1);
  return r[0];
}

// OPE-97 — congés du même technicien (statut en_attente/approuvé) chevauchant la période
// [dateDebut, dateFin]. Deux intervalles se chevauchent ssi début_existant <= fin_demandée
// ET fin_existant >= début_demandée. Scopé tenant + technicien. `excludeId` permet d'ignorer
// le congé en cours d'édition. Dates au format 'YYYY-MM-DD'.
export async function getCongesChevauchants(
  technicienId: number,
  artisanId: number,
  dateDebut: Date,
  dateFin: Date,
  excludeId?: number,
): Promise<Conge[]> {
  const dbi = await getDb();
  const conds = [
    eq(conges.artisanId, artisanId),
    eq(conges.technicienId, technicienId),
    inArray(conges.statut, ["en_attente", "approuve"]),
    lte(conges.dateDebut, dateFin),
    gte(conges.dateFin, dateDebut),
  ];
  if (excludeId !== undefined) conds.push(ne(conges.id, excludeId));
  return await dbi.select().from(conges).where(and(...conds)).orderBy(asc(conges.dateDebut));
}

export async function createConge(data: InsertConge): Promise<Conge | undefined> {
  const dbi = await getDb();
  await dbi.insert(conges).values(data);
  const r = await dbi.select().from(conges)
    .where(and(
      eq(conges.technicienId, data.technicienId),
      eq(conges.dateDebut, data.dateDebut),
    ))
    .orderBy(desc(conges.id)).limit(1);
  return r[0];
}

export async function deleteConge(id: number): Promise<void> {
  const dbi = await getDb();
  await dbi.delete(conges).where(eq(conges.id, id));
}

export async function updateCongeStatut(
  id: number,
  statut: "en_attente" | "approuve" | "refuse" | "annule",
  validePar?: number,
  commentaire?: string
): Promise<Conge | undefined> {
  const dbi = await getDb();
  await dbi.update(conges).set({
    statut,
    dateValidation: new Date(),
    validePar: validePar || null,
    commentaireValidation: commentaire || null,
  }).where(eq(conges.id, id));
  return getCongeById(id);
}

export async function getSoldesConges(
  technicienId: number,
  annee: number
): Promise<SoldeConge[]> {
  const dbi = await getDb();
  return await dbi.select().from(soldesConges)
    .where(and(eq(soldesConges.technicienId, technicienId), eq(soldesConges.annee, annee)));
}

export async function initSoldeConges(
  data: InsertSoldeConge
): Promise<SoldeConge | undefined> {
  const dbi = await getDb();
  // Upsert idempotent sur (technicien, type, annee) via check-then-act (neutre dialecte).
  // NB OPE-184 : `soldes_conges` n'a PAS de clé unique sur (technicienId,type,annee)
  // (seul `id` est PK, vérifié sur la base live) → l'ancien `ON DUPLICATE KEY UPDATE`
  // ne déclenchait JAMAIS la branche UPDATE en mysql (bug latent : ré-init = doublon).
  // Le check-then-act corrige ce comportement et le rend réellement idempotent,
  // aligné sur `updateSoldeConges` (OPE-178).
  const vals = {
    soldeInitial: data.soldeInitial ?? "0.00",
    soldeRestant: data.soldeRestant ?? "0.00",
    joursAcquis: data.joursAcquis ?? "0.00",
    joursPris: data.joursPris ?? "0.00",
  };
  const existing = await dbi.select({ id: soldesConges.id }).from(soldesConges)
    .where(and(
      eq(soldesConges.technicienId, data.technicienId),
      eq(soldesConges.type, data.type),
      eq(soldesConges.annee, data.annee),
    )).limit(1);
  if (existing[0]) {
    await dbi.update(soldesConges).set(vals).where(eq(soldesConges.id, existing[0].id));
  } else {
    await dbi.insert(soldesConges).values({
      technicienId: data.technicienId, artisanId: data.artisanId,
      type: data.type, annee: data.annee, ...vals,
    });
  }
  const r = await dbi.select().from(soldesConges)
    .where(and(
      eq(soldesConges.technicienId, data.technicienId),
      eq(soldesConges.type, data.type),
      eq(soldesConges.annee, data.annee),
    )).limit(1);
  return r[0];
}

export async function updateSoldeConges(
  technicienId: number,
  artisanId: number,
  type: "conge_paye" | "rtt",
  annee: number,
  joursPrisDelta: number
): Promise<void> {
  // OPE-178 — l'UPDATE seul PERDAIT silencieusement le décompte si la ligne
  // (technicien, type, année) n'existait pas (solde non initialisé / changement
  // d'année). Pas de clé unique sur (technicienId,type,annee) → on ne peut pas
  // s'appuyer sur ON DUPLICATE KEY ; on fait donc un check-then-act :
  //  - ligne présente            -> UPDATE (comportement INCHANGÉ).
  //  - absente + décompte (>0)   -> INSERT (trace le décompte ; solde acquis = 0).
  //  - absente + recrédit (<=0)  -> no-op (rien n'avait été décompté à recréditer).
  const dbi = await getDb();
  const existing = await dbi.select({ id: soldesConges.id }).from(soldesConges)
    .where(and(
      eq(soldesConges.technicienId, technicienId),
      eq(soldesConges.type, type),
      eq(soldesConges.annee, annee),
    )).limit(1);
  if (existing[0]) {
    // GREATEST(0, …) : supporté par PG et mysql ; arithmétique sur colonnes en sql brut.
    await dbi.update(soldesConges).set({
      joursPris: sql`${soldesConges.joursPris} + ${joursPrisDelta}`,
      soldeRestant: sql`GREATEST(0, ${soldesConges.soldeRestant} - ${joursPrisDelta})`,
    }).where(eq(soldesConges.id, existing[0].id));
  } else if (joursPrisDelta > 0) {
    // Absente + décompte (>0) → INSERT (trace le décompte ; soldeRestant planché à 0).
    await dbi.insert(soldesConges).values({
      technicienId, artisanId, type, annee,
      soldeInitial: "0.00", soldeRestant: "0.00", joursAcquis: "0.00",
      joursPris: String(joursPrisDelta),
    });
  }
}

// ============================================================================
// BADGES + CLASSEMENT TECHNICIENS (gamification) - Drizzle ORM
// ============================================================================

export async function getBadgesByArtisan(artisanId: number): Promise<Badge[]> {
  const dbi = await getDb();
  return await dbi.select().from(badges)
    .where(eq(badges.artisanId, artisanId))
    .orderBy(asc(badges.categorie), asc(badges.seuil));
}

export async function createBadge(data: InsertBadge): Promise<Badge | undefined> {
  const dbi = await getDb();
  await dbi.insert(badges).values(data);
  const r = await dbi.select().from(badges)
    .where(and(eq(badges.artisanId, data.artisanId), eq(badges.code, data.code)))
    .orderBy(desc(badges.id)).limit(1);
  return r[0];
}

export async function getBadgeById(id: number): Promise<Badge | undefined> {
  const dbi = await getDb();
  const r = await dbi.select().from(badges).where(eq(badges.id, id)).limit(1);
  return r[0];
}

export async function updateBadge(id: number, data: Partial<InsertBadge>): Promise<Badge | undefined> {
  const dbi = await getDb();
  await dbi.update(badges).set(data).where(eq(badges.id, id));
  const r = await dbi.select().from(badges).where(eq(badges.id, id)).limit(1);
  return r[0];
}

export async function deleteBadge(id: number): Promise<void> {
  const dbi = await getDb();
  await dbi.delete(badgesTechniciens).where(eq(badgesTechniciens.badgeId, id));
  await dbi.delete(badges).where(eq(badges.id, id));
}

export async function getBadgesTechnicien(technicienId: number): Promise<any[]> {
  const dbi = await getDb();
  return await dbi.select({
    id: badgesTechniciens.id,
    badgeId: badgesTechniciens.badgeId,
    dateObtention: badgesTechniciens.dateObtention,
    valeurAtteinte: badgesTechniciens.valeurAtteinte,
    badgeCode: badges.code,
    badgeNom: badges.nom,
    badgeIcone: badges.icone,
    badgeCouleur: badges.couleur,
    badgeCategorie: badges.categorie,
    badgePoints: badges.points,
  })
    .from(badgesTechniciens)
    .innerJoin(badges, eq(badges.id, badgesTechniciens.badgeId))
    .where(eq(badgesTechniciens.technicienId, technicienId))
    .orderBy(desc(badgesTechniciens.dateObtention));
}

export async function attribuerBadge(
  technicienId: number,
  badgeId: number,
  valeurAtteinte?: number
): Promise<BadgeTechnicien | undefined> {
  const dbi = await getDb();
  // Si deja attribue, ne pas dupliquer.
  const existing = await dbi.select().from(badgesTechniciens)
    .where(and(eq(badgesTechniciens.technicienId, technicienId), eq(badgesTechniciens.badgeId, badgeId)))
    .limit(1);
  if (existing[0]) return existing[0];
  await dbi.insert(badgesTechniciens).values({
    technicienId,
    badgeId,
    valeurAtteinte: valeurAtteinte ?? null,
  });
  const r = await dbi.select().from(badgesTechniciens)
    .where(and(eq(badgesTechniciens.technicienId, technicienId), eq(badgesTechniciens.badgeId, badgeId)))
    .limit(1);
  return r[0];
}

export async function verifierEtAttribuerBadges(
  technicienId: number,
  artisanId: number
): Promise<BadgeTechnicien[]> {
  // Verifie les seuils (interventions, avis, ca, anciennete) et attribue
  // les badges atteints. Retourne la liste des badges nouvellement
  // obtenus dans ce passage.
  const dbi = await getDb();

  // Calculs statistiques pour ce technicien chez cet artisan.
  const [intRow] = await dbi.select({ n: sql<number>`COUNT(*)` }).from(interventions)
    .where(and(
      eq(interventions.technicienId, technicienId),
      eq(interventions.artisanId, artisanId),
      eq(interventions.statut, "terminee" as any),
    ));
  const nbInterventions = Number(intRow?.n || 0);

  // Avis positifs (note >= 4) — on tolere l'absence de la table.
  let nbAvisPositifs = 0;
  try {
    const [aRow] = await dbi.select({ n: sql<number>`COUNT(*)` }).from(avisClients)
      .where(and(eq(avisClients.artisanId, artisanId), gte(avisClients.note, 4)));
    nbAvisPositifs = Number(aRow?.n || 0);
  } catch {
    /* table absente */
  }

  // Liste des badges definis chez cet artisan.
  const allBadges = await dbi.select().from(badges)
    .where(and(eq(badges.artisanId, artisanId), eq(badges.actif, true)));

  const obtenus: BadgeTechnicien[] = [];
  for (const b of allBadges) {
    const seuil = b.seuil || 0;
    let valeur = 0;
    if (b.categorie === "interventions") valeur = nbInterventions;
    else if (b.categorie === "avis") valeur = nbAvisPositifs;
    if (valeur >= seuil && seuil > 0) {
      const bt = await attribuerBadge(technicienId, b.id, valeur);
      if (bt && !obtenus.find((x) => x.badgeId === bt.badgeId)) {
        obtenus.push(bt);
      }
    }
  }
  return obtenus;
}

export async function getClassementTechniciens(
  artisanId: number,
  periode: "semaine" | "mois" | "trimestre" | "annee"
): Promise<ClassementTechnicien[]> {
  const dbi = await getDb();
  return await dbi.select().from(classementTechniciens)
    .where(and(eq(classementTechniciens.artisanId, artisanId), eq(classementTechniciens.periode, periode)))
    .orderBy(asc(classementTechniciens.rang));
}

export async function calculerClassement(
  artisanId: number,
  periode: "semaine" | "mois" | "trimestre" | "annee"
): Promise<ClassementTechnicien[]> {
  // Calcule le classement pour la periode courante et l'enregistre.
  const dbi = await getDb();
  const today = new Date();
  let dateDebut: Date;
  const dateFin = today;
  if (periode === "semaine") {
    dateDebut = new Date(today);
    dateDebut.setDate(today.getDate() - 7);
  } else if (periode === "mois") {
    dateDebut = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (periode === "trimestre") {
    const q = Math.floor(today.getMonth() / 3) * 3;
    dateDebut = new Date(today.getFullYear(), q, 1);
  } else {
    dateDebut = new Date(today.getFullYear(), 0, 1);
  }
  const dStr = dateDebut.toISOString().slice(0, 10);
  const fStr = dateFin.toISOString().slice(0, 10);

  // Agreger par technicien : nb interventions terminees + CA factures
  // payees attache aux interventions de ce technicien.
  // LEFT JOIN avec condition `f.statut='payee'` portée dans le ON (pas le WHERE)
  // pour préserver la sémantique LEFT JOIN. dateDebut = timestamp → sql BETWEEN brut.
  const rows: any[] = await dbi.select({
    technicienId: interventions.technicienId,
    interventions: sql<number>`COUNT(*)`,
    ca: sql<string>`COALESCE(SUM(${factures.totalTTC}), 0)`,
  }).from(interventions)
    .leftJoin(factures, and(eq(factures.id, interventions.factureId), eq(factures.statut, "payee" as any)))
    .where(and(
      eq(interventions.artisanId, artisanId),
      eq(interventions.statut, "terminee" as any),
      isNotNull(interventions.technicienId),
      sql`${interventions.dateDebut} BETWEEN ${dStr} AND ${fStr}`,
    ))
    .groupBy(interventions.technicienId)
    .orderBy(sql`COUNT(*) DESC`, sql`COALESCE(SUM(${factures.totalTTC}), 0) DESC`);

  // Insert classements (purge prealable pour ce couple artisan+periode).
  await dbi.delete(classementTechniciens)
    .where(and(
      eq(classementTechniciens.artisanId, artisanId),
      eq(classementTechniciens.periode, periode),
      eq(classementTechniciens.dateDebut, dStr),
    ));
  let rang = 1;
  for (const r of rows) {
    const points = Number(r.interventions) * 10 + Math.floor(Number(r.ca) / 100);
    await dbi.insert(classementTechniciens).values({
      technicienId: r.technicienId, artisanId, periode, dateDebut: dStr, dateFin: fStr,
      rang, pointsTotal: points, interventions: Number(r.interventions), ca: String(r.ca),
    });
    rang++;
  }
  return getClassementTechniciens(artisanId, periode);
}

export async function getObjectifsTechnicien(
  technicienId: number,
  annee: number
): Promise<ObjectifTechnicien[]> {
  const dbi = await getDb();
  return await dbi.select().from(objectifsTechniciens)
    .where(and(eq(objectifsTechniciens.technicienId, technicienId), eq(objectifsTechniciens.annee, annee)))
    .orderBy(asc(objectifsTechniciens.mois));
}

export async function createObjectifTechnicien(
  data: InsertObjectifTechnicien
): Promise<ObjectifTechnicien | undefined> {
  const dbi = await getDb();
  await dbi.insert(objectifsTechniciens).values(data);
  const r = await dbi.select().from(objectifsTechniciens)
    .where(and(
      eq(objectifsTechniciens.technicienId, data.technicienId),
      eq(objectifsTechniciens.mois, data.mois),
      eq(objectifsTechniciens.annee, data.annee),
    )).orderBy(desc(objectifsTechniciens.id)).limit(1);
  return r[0];
}

// ============================================================================
// DEVIS OPTIONS (variantes de devis : Standard / Premium / Eco) - Drizzle ORM
// ============================================================================

export async function getDevisOptionsByDevisId(devisId: number): Promise<DevisOption[]> {
  const dbi = await getDb();
  return await dbi.select().from(devisOptions)
    .where(eq(devisOptions.devisId, devisId))
    .orderBy(asc(devisOptions.ordre));
}

export async function getDevisOptionById(id: number): Promise<DevisOption | undefined> {
  const dbi = await getDb();
  const r = await dbi.select().from(devisOptions).where(eq(devisOptions.id, id)).limit(1);
  return r[0];
}

export async function createDevisOption(data: InsertDevisOption): Promise<DevisOption | undefined> {
  const dbi = await getDb();
  await dbi.insert(devisOptions).values(data);
  const r = await dbi.select().from(devisOptions)
    .where(and(eq(devisOptions.devisId, data.devisId), eq(devisOptions.nom, data.nom)))
    .orderBy(desc(devisOptions.id)).limit(1);
  return r[0];
}

export async function updateDevisOption(
  id: number,
  data: Partial<InsertDevisOption>
): Promise<DevisOption | undefined> {
  const dbi = await getDb();
  await dbi.update(devisOptions).set(data).where(eq(devisOptions.id, id));
  return getDevisOptionById(id);
}

export async function deleteDevisOption(id: number): Promise<void> {
  const dbi = await getDb();
  await dbi.delete(devisOptionsLignes).where(eq(devisOptionsLignes.optionId, id));
  await dbi.delete(devisOptions).where(eq(devisOptions.id, id));
}

export async function selectDevisOption(optionId: number): Promise<DevisOption | undefined> {
  // Une seule option selectionnee par devis : reset les autres puis set
  // celle-ci. Le devisId est recupere depuis l'option.
  const dbi = await getDb();
  const opt = await getDevisOptionById(optionId);
  if (!opt) return undefined;
  await dbi.update(devisOptions)
    .set({ selectionnee: false })
    .where(eq(devisOptions.devisId, opt.devisId));
  await dbi.update(devisOptions)
    .set({ selectionnee: true, dateSelection: new Date() })
    .where(eq(devisOptions.id, optionId));
  return getDevisOptionById(optionId);
}

export async function getDevisOptionLignesByOptionId(
  optionId: number
): Promise<DevisOptionLigne[]> {
  const dbi = await getDb();
  return await dbi.select().from(devisOptionsLignes)
    .where(eq(devisOptionsLignes.optionId, optionId))
    .orderBy(asc(devisOptionsLignes.ordre));
}

export async function createDevisOptionLigne(
  data: InsertDevisOptionLigne
): Promise<DevisOptionLigne | undefined> {
  const dbi = await getDb();
  await dbi.insert(devisOptionsLignes).values(data);
  const r = await dbi.select().from(devisOptionsLignes)
    .where(eq(devisOptionsLignes.optionId, data.optionId))
    .orderBy(desc(devisOptionsLignes.id)).limit(1);
  return r[0];
}

export async function updateDevisOptionLigne(
  id: number,
  data: Partial<InsertDevisOptionLigne>
): Promise<DevisOptionLigne | undefined> {
  const dbi = await getDb();
  await dbi.update(devisOptionsLignes).set(data).where(eq(devisOptionsLignes.id, id));
  const r = await dbi.select().from(devisOptionsLignes).where(eq(devisOptionsLignes.id, id)).limit(1);
  return r[0];
}

export async function deleteDevisOptionLigne(id: number): Promise<void> {
  const dbi = await getDb();
  await dbi.delete(devisOptionsLignes).where(eq(devisOptionsLignes.id, id));
}

export async function recalculerTotauxOption(optionId: number): Promise<void> {
  const dbi = await getDb();
  const lignes = await getDevisOptionLignesByOptionId(optionId);
  let totalHT = 0;
  let totalTVA = 0;
  for (const l of lignes) {
    const qte = Number(l.quantite || 0);
    const pu = Number(l.prixUnitaireHT || 0);
    const remise = Number(l.remise || 0);
    const tva = Number(l.tauxTVA || 0);
    const ht = qte * pu * (1 - remise / 100);
    const tvaMontant = ht * (tva / 100);
    totalHT += ht;
    totalTVA += tvaMontant;
    // Met aussi a jour les montants par ligne (utile pour l'UI).
    await dbi.update(devisOptionsLignes).set({
      montantHT: ht.toFixed(2),
      montantTVA: tvaMontant.toFixed(2),
      montantTTC: (ht + tvaMontant).toFixed(2),
    }).where(eq(devisOptionsLignes.id, l.id));
  }
  const totalTTC = totalHT + totalTVA;
  await dbi.update(devisOptions).set({
    totalHT: totalHT.toFixed(2),
    totalTVA: totalTVA.toFixed(2),
    totalTTC: totalTTC.toFixed(2),
  }).where(eq(devisOptions.id, optionId));
}

export async function convertirOptionEnDevis(optionId: number): Promise<void> {
  // Replace les lignes du devis parent par les lignes de cette option,
  // recalcule les totaux du devis. L'option choisie devient les lignes
  // officielles du devis.
  const dbi = await getDb();
  const opt = await getDevisOptionById(optionId);
  if (!opt) return;
  const lignesOpt = await getDevisOptionLignesByOptionId(optionId);

  // Purge lignes existantes du devis parent.
  await dbi.delete(devisLignes).where(eq(devisLignes.devisId, opt.devisId));
  // Copie les lignes de l'option dans devis_lignes.
  for (const l of lignesOpt) {
    await dbi.insert(devisLignes).values({
      devisId: opt.devisId,
      ordre: l.ordre || 0,
      designation: l.designation,
      description: l.description,
      quantite: l.quantite,
      unite: l.unite,
      prixUnitaireHT: l.prixUnitaireHT,
      tauxTVA: l.tauxTVA,
      montantHT: l.montantHT,
      montantTVA: l.montantTVA,
      montantTTC: l.montantTTC,
    });
  }
  // Met a jour les totaux du devis.
  await dbi.update(devis).set({
    totalHT: opt.totalHT,
    totalTVA: opt.totalTVA,
    totalTTC: opt.totalTTC,
  }).where(eq(devis.id, opt.devisId));
  // Marque l'option comme selectionnee.
  await selectDevisOption(optionId);
}

// ============================================================================
// ANALYSE PHOTOS IA (analyses_photos_chantier + photos + resultats +
// suggestions + devis_genere_ia) - Drizzle ORM
// ============================================================================

export async function getAnalysesPhotosByArtisan(
  artisanId: number
): Promise<AnalysePhotoChantier[]> {
  const dbi = await getDb();
  return await dbi.select().from(analysesPhotosChantier)
    .where(eq(analysesPhotosChantier.artisanId, artisanId))
    .orderBy(desc(analysesPhotosChantier.createdAt));
}

export async function getAnalysePhotoById(
  id: number
): Promise<AnalysePhotoChantier | undefined> {
  const dbi = await getDb();
  const r = await dbi.select().from(analysesPhotosChantier)
    .where(eq(analysesPhotosChantier.id, id)).limit(1);
  return r[0];
}

export async function createAnalysePhoto(
  data: InsertAnalysePhotoChantier
): Promise<AnalysePhotoChantier | undefined> {
  const dbi = await getDb();
  await dbi.insert(analysesPhotosChantier).values(data);
  const r = await dbi.select().from(analysesPhotosChantier)
    .where(eq(analysesPhotosChantier.artisanId, data.artisanId))
    .orderBy(desc(analysesPhotosChantier.id)).limit(1);
  return r[0];
}

export async function updateAnalysePhoto(
  id: number,
  data: Partial<InsertAnalysePhotoChantier>
): Promise<AnalysePhotoChantier | undefined> {
  const dbi = await getDb();
  await dbi.update(analysesPhotosChantier).set(data).where(eq(analysesPhotosChantier.id, id));
  return getAnalysePhotoById(id);
}

export async function addPhotoToAnalyse(
  data: InsertPhotoAnalyse
): Promise<PhotoAnalyse | undefined> {
  const dbi = await getDb();
  await dbi.insert(photosAnalyse).values(data);
  const r = await dbi.select().from(photosAnalyse)
    .where(eq(photosAnalyse.analyseId, data.analyseId))
    .orderBy(desc(photosAnalyse.id)).limit(1);
  return r[0];
}

export async function getPhotosByAnalyse(analyseId: number): Promise<PhotoAnalyse[]> {
  const dbi = await getDb();
  return await dbi.select().from(photosAnalyse)
    .where(eq(photosAnalyse.analyseId, analyseId))
    .orderBy(asc(photosAnalyse.ordre));
}

export async function getResultatsAnalyse(analyseId: number): Promise<ResultatAnalyseIA[]> {
  const dbi = await getDb();
  return await dbi.select().from(resultatsAnalyseIA)
    .where(eq(resultatsAnalyseIA.analyseId, analyseId))
    .orderBy(desc(resultatsAnalyseIA.confiance));
}

export async function saveResultatAnalyseIA(
  data: InsertResultatAnalyseIA
): Promise<ResultatAnalyseIA | undefined> {
  const dbi = await getDb();
  await dbi.insert(resultatsAnalyseIA).values(data);
  const r = await dbi.select().from(resultatsAnalyseIA)
    .where(eq(resultatsAnalyseIA.analyseId, data.analyseId))
    .orderBy(desc(resultatsAnalyseIA.id)).limit(1);
  return r[0];
}

export async function getSuggestionsByResultat(
  resultatId: number
): Promise<SuggestionArticleIA[]> {
  const dbi = await getDb();
  return await dbi.select().from(suggestionsArticlesIA)
    .where(eq(suggestionsArticlesIA.resultatId, resultatId))
    .orderBy(desc(suggestionsArticlesIA.confiance));
}

export async function saveSuggestionArticleIA(
  data: InsertSuggestionArticleIA
): Promise<SuggestionArticleIA | undefined> {
  const dbi = await getDb();
  await dbi.insert(suggestionsArticlesIA).values(data);
  const r = await dbi.select().from(suggestionsArticlesIA)
    .where(eq(suggestionsArticlesIA.resultatId, data.resultatId))
    .orderBy(desc(suggestionsArticlesIA.id)).limit(1);
  return r[0];
}

export async function updateSuggestionArticle(
  id: number,
  data: Partial<InsertSuggestionArticleIA>
): Promise<SuggestionArticleIA | undefined> {
  const dbi = await getDb();
  await dbi.update(suggestionsArticlesIA).set(data).where(eq(suggestionsArticlesIA.id, id));
  const r = await dbi.select().from(suggestionsArticlesIA).where(eq(suggestionsArticlesIA.id, id)).limit(1);
  return r[0];
}

export async function getDevisGenereByAnalyse(
  analyseId: number
): Promise<DevisGenereIA | undefined> {
  const dbi = await getDb();
  const r = await dbi.select().from(devisGenereIA)
    .where(eq(devisGenereIA.analyseId, analyseId)).limit(1);
  return r[0];
}

export async function creerDevisDepuisAnalyseIA(params: {
  analyseId: number;
  artisanId: number;
  clientId: number;
  suggestionIds?: number[];
}): Promise<{ devisId: number; montantEstime: number } | null> {
  // Cree un nouveau devis a partir des suggestions selectionnees
  // de l'analyse, puis enregistre le lien analyse -> devis.
  const dbi = await getDb();
  const analyse = await getAnalysePhotoById(params.analyseId);
  if (!analyse) return null;

  // Recupere les resultats et leurs suggestions selectionnees.
  const resultats = await getResultatsAnalyse(params.analyseId);
  const lignes: Array<{ designation: string; quantite: number; unite: string; prixUnitaireHT: number; tauxTVA: number }> = [];
  for (const r of resultats) {
    const suggestions = await getSuggestionsByResultat(r.id);
    for (const s of suggestions) {
      if (params.suggestionIds && !params.suggestionIds.includes(s.id)) continue;
      if (!s.selectionne) continue;
      lignes.push({
        designation: s.nomArticle,
        quantite: Number(s.quantiteSuggeree || 1),
        unite: s.unite || "u",
        prixUnitaireHT: Number(s.prixEstime || 0),
        tauxTVA: 20,
      });
    }
  }

  if (lignes.length === 0) return null;

  // Calcul totaux.
  let totalHT = 0;
  let totalTVA = 0;
  for (const l of lignes) {
    const ht = l.quantite * l.prixUnitaireHT;
    totalHT += ht;
    totalTVA += ht * (l.tauxTVA / 100);
  }
  const totalTTC = totalHT + totalTVA;

  // Genere numero devis simple via le compteur de l'artisan.
  const numero = `IA-${Date.now().toString().slice(-8)}`;
  await dbi.insert(devis).values({
    artisanId: params.artisanId,
    clientId: params.clientId,
    numero,
    statut: "brouillon",
    objet: analyse.titre || "Devis depuis analyse photos IA",
    totalHT: totalHT.toFixed(2),
    totalTVA: totalTVA.toFixed(2),
    totalTTC: totalTTC.toFixed(2),
  });
  const created = await dbi.select().from(devis)
    .where(and(eq(devis.artisanId, params.artisanId), eq(devis.numero, numero)))
    .limit(1);
  const newDevis = created[0];
  if (!newDevis) return null;

  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const ht = l.quantite * l.prixUnitaireHT;
    await dbi.insert(devisLignes).values({
      devisId: newDevis.id,
      ordre: i,
      designation: l.designation,
      quantite: l.quantite.toFixed(2),
      unite: l.unite,
      prixUnitaireHT: l.prixUnitaireHT.toFixed(2),
      tauxTVA: l.tauxTVA.toFixed(2),
      montantHT: ht.toFixed(2),
      montantTVA: (ht * l.tauxTVA / 100).toFixed(2),
      montantTTC: (ht + ht * l.tauxTVA / 100).toFixed(2),
    });
  }

  // Lien analyse -> devis (upsert-like via DELETE + INSERT).
  await dbi.delete(devisGenereIA).where(eq(devisGenereIA.analyseId, params.analyseId));
  await dbi.insert(devisGenereIA).values({
    analyseId: params.analyseId,
    devisId: newDevis.id,
    montantEstime: totalTTC.toFixed(2),
  });

  return { devisId: newDevis.id, montantEstime: totalTTC };
}

// ============================================================================
// COMPTABILITE (config + historique exports + generation FEC/IIF) - Drizzle ORM
// ============================================================================

export async function getConfigurationComptable(
  artisanId: number
): Promise<ConfigurationComptable | undefined> {
  const dbi = await getDb();
  const r = await dbi.select().from(configurationsComptables)
    .where(eq(configurationsComptables.artisanId, artisanId)).limit(1);
  return r[0];
}

// Colonnes autorisées de configurations_comptables — les noms sont interpolés en
// SQL brut (upsert), donc whitelist explicite (defense-in-depth : la sûreté ne
// dépend plus du stripping Zod de l'appelant). Cf. audit injection SQL 2026-06-13.
const CONFIG_COMPTABLE_COLS = new Set([
  "artisanId", "logiciel", "formatExport", "compteVentes", "compteTVACollectee",
  "compteClients", "compteAchats", "compteTVADeductible", "compteFournisseurs",
  "compteBanque", "compteCaisse", "journalVentes", "journalAchats", "journalBanque",
  "prefixeFacture", "prefixeAvoir", "exerciceDebut", "actif", "syncAutoFactures",
  "syncAutoPaiements", "frequenceSync", "heureSync", "notifierErreurs",
  "notifierSucces", "derniereSync", "prochainSync",
]);

export async function saveConfigurationComptable(
  data: InsertConfigurationComptable
): Promise<ConfigurationComptable | undefined> {
  // Une seule config par artisan (cle unique artisanId) : upsert neutre dialecte
  // (select-puis-insert/update), PG ne supporte pas ON DUPLICATE KEY.
  const dbi = await getDb();
  // Whitelist defense-in-depth conservee (cf. audit injection SQL 2026-06-13) :
  // ne laisse passer que les colonnes autorisees.
  const filtered: Record<string, any> = {};
  for (const k of Object.keys(data)) if (CONFIG_COMPTABLE_COLS.has(k)) filtered[k] = (data as any)[k];
  const existing = await dbi.select({ id: configurationsComptables.id }).from(configurationsComptables)
    .where(eq(configurationsComptables.artisanId, data.artisanId)).limit(1);
  if (existing[0]) {
    const { artisanId: _aid, ...updates } = filtered;
    if (Object.keys(updates).length > 0) {
      await dbi.update(configurationsComptables).set(updates)
        .where(eq(configurationsComptables.artisanId, data.artisanId));
    }
  } else {
    await dbi.insert(configurationsComptables).values(filtered as any);
  }
  return getConfigurationComptable(data.artisanId);
}

export async function saveSyncConfigComptable(
  artisanId: number,
  data: Partial<InsertConfigurationComptable>
): Promise<ConfigurationComptable | undefined> {
  // Variante : ne touche que les champs sync (sync_auto_*, frequence_sync,
  // heure_sync, etc.). Met a jour ou cree la config si absente.
  return saveConfigurationComptable({ artisanId, ...(data as any) });
}

export async function getExportsComptables(
  artisanId: number
): Promise<ExportComptable[]> {
  const dbi = await getDb();
  return await dbi.select().from(exportsComptables)
    .where(eq(exportsComptables.artisanId, artisanId))
    .orderBy(desc(exportsComptables.createdAt));
}

export async function createExportComptable(
  data: InsertExportComptable
): Promise<ExportComptable | undefined> {
  const dbi = await getDb();
  await dbi.insert(exportsComptables).values(data);
  const r = await dbi.select().from(exportsComptables)
    .where(eq(exportsComptables.artisanId, data.artisanId))
    .orderBy(desc(exportsComptables.id)).limit(1);
  return r[0];
}

export async function updateExportComptable(
  id: number,
  data: Partial<InsertExportComptable>
): Promise<ExportComptable | undefined> {
  const dbi = await getDb();
  await dbi.update(exportsComptables).set(data).where(eq(exportsComptables.id, id));
  const r = await dbi.select().from(exportsComptables).where(eq(exportsComptables.id, id)).limit(1);
  return r[0];
}

// Helper interne : formate un nombre en montant FEC (virgule decimale).
function fecAmount(val: string | number | null | undefined): string {
  const n = typeof val === "string" ? parseFloat(val) : Number(val || 0);
  return n.toFixed(2).replace(".", ",");
}

// ============================================================================
// FEC — Fichier des Ecritures Comptables (arrete du 29 juillet 2013, DGFiP)
// Generateur unique, conforme 18 colonnes, equilibre par construction.
// Couvre 3 journaux : VENTES (factures), ACHATS (depenses), BANQUE (encaissements).
// ============================================================================
export interface FecConformite {
  nbEcritures: number;       // nombre d'ecritures (groupes equilibres)
  nbLignes: number;          // nombre de lignes de detail (hors entete)
  totalDebit: number;
  totalCredit: number;
  ecart: number;             // totalDebit - totalCredit (doit etre 0)
  equilibre: boolean;
  erreurs: string[];         // controles de conformite non passes
  comptesUtilises: string[];
}

export interface FecResultat {
  content: string;
  conformite: FecConformite;
}

// Compte de TVA collectee selon le taux (PCG francais).
function compteTvaCollectee(taux: number): { compte: string; lib: string } {
  if (taux >= 19.5) return { compte: "445711", lib: "TVA collectee 20%" };
  if (taux >= 9.5) return { compte: "445712", lib: "TVA collectee 10%" };
  if (taux >= 5) return { compte: "445713", lib: "TVA collectee 5,5%" };
  if (taux >= 2) return { compte: "445714", lib: "TVA collectee 2,1%" };
  return { compte: "445711", lib: "TVA collectee" };
}

// Compte de charge (classe 6) selon la categorie de depense (PCG).
function compteChargeDepense(categorie: string | null | undefined): { compte: string; lib: string } {
  const c = (categorie || "").toLowerCase();
  if (/(materiau|fournitur|consommable)/.test(c)) return { compte: "601000", lib: "Achats de matieres premieres" };
  if (/(sous.?trait)/.test(c)) return { compte: "604000", lib: "Sous-traitance" };
  if (/(carburant|essence|gazole|diesel)/.test(c)) return { compte: "606100", lib: "Carburants" };
  if (/(outil)/.test(c)) return { compte: "615000", lib: "Entretien, reparations, outillage" };
  if (/(loyer|location)/.test(c)) return { compte: "613000", lib: "Locations" };
  if (/(assurance)/.test(c)) return { compte: "616000", lib: "Primes d'assurance" };
  if (/(telephone|internet|telecom)/.test(c)) return { compte: "626000", lib: "Frais postaux et telecom" };
  if (/(formation)/.test(c)) return { compte: "623000", lib: "Formation" };
  if (/(bancaire|banque|commission)/.test(c)) return { compte: "627000", lib: "Services bancaires" };
  if (/(repas|restaurant|deplacement|hotel|peage)/.test(c)) return { compte: "625100", lib: "Voyages et deplacements" };
  return { compte: "607000", lib: "Achats" };
}

export async function genererFEC(
  artisanId: number,
  dateDebut: Date,
  dateFin: Date,
): Promise<FecResultat> {
  const vide: FecConformite = { nbEcritures: 0, nbLignes: 0, totalDebit: 0, totalCredit: 0, ecart: 0, equilibre: true, erreurs: [], comptesUtilises: [] };
  const dbi = await getDb();

  const config = await getConfigurationComptable(artisanId);
  const cVentes = config?.compteVentes || "706000";
  const cClients = config?.compteClients || "411000";
  const cTvaDed = config?.compteTVADeductible || "445660";
  const cFourn = config?.compteFournisseurs || "401000";
  const cBanque = config?.compteBanque || "512000";
  const jVE = (config?.journalVentes || "VE").slice(0, 3);
  const jAC = (config?.journalAchats || "AC").slice(0, 3);
  const jBQ = (config?.journalBanque || "BQ").slice(0, 3);

  const SEP = "\t";
  const clean = (v: any) => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();
  const amt = (v: any) => Number(v || 0).toFixed(2).replace(".", ",");
  const ymd = (d: any) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`;
  };

  const header = [
    "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum",
    "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate",
    "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet",
    "ValidDate", "Montantdevise", "Idevise",
  ];
  const lines: string[] = [header.join(SEP)];
  let totalDebit = 0, totalCredit = 0, nbEcritures = 0;
  const comptes = new Set<string>();

  type Line = {
    journal: string; journalLib: string; num: number; date: any;
    compte: string; compteLib: string; auxNum?: string; auxLib?: string;
    piece: string; pieceDate: any; lib: string; debit?: number; credit?: number;
    lettre?: string; dateLet?: any; valid: any;
  };
  const push = (f: Line) => {
    // 18 colonnes ; Montantdevise/Idevise vides (operations en EUR domestiques).
    const row = [
      clean(f.journal), clean(f.journalLib), String(f.num), ymd(f.date),
      clean(f.compte), clean(f.compteLib), clean(f.auxNum || ""), clean(f.auxLib || ""),
      clean(f.piece), ymd(f.pieceDate), clean(f.lib),
      amt(f.debit), amt(f.credit), clean(f.lettre || ""), f.dateLet ? ymd(f.dateLet) : "",
      ymd(f.valid), "", "",
    ];
    if (row.length !== 18) throw new Error("FEC: ligne non conforme (18 colonnes attendues)");
    lines.push(row.join(SEP));
    totalDebit += Number(f.debit || 0);
    totalCredit += Number(f.credit || 0);
    comptes.add(f.compte);
  };

  const dStr = dateDebut.toISOString().slice(0, 10);
  const fStr = dateFin.toISOString().slice(0, 10);
  let num = 0;

  // ---- 1) JOURNAL DES VENTES (VE) : 1 ecriture equilibree par facture ----
  // DATE(dateFacture) (cast jour) conservé en sql brut : neutre dialecte (PG+mysql
  // supportent DATE() + BETWEEN) → mêmes bornes qu'avant (ignore l'heure).
  const facts: any[] = await dbi.select({
    id: factures.id, numero: factures.numero, dateFacture: factures.dateFacture,
    totalHT: factures.totalHT, totalTVA: factures.totalTVA, totalTTC: factures.totalTTC,
    statut: factures.statut, datePaiement: factures.datePaiement, typeDocument: factures.typeDocument,
    clientId: factures.clientId, clientNom: clients.nom, clientPrenom: clients.prenom,
  }).from(factures).leftJoin(clients, eq(clients.id, factures.clientId))
    .where(and(
      eq(factures.artisanId, artisanId),
      sql`DATE(${factures.dateFacture}) BETWEEN ${dStr} AND ${fStr}`,
      inArray(factures.statut, ["validee", "envoyee", "payee", "en_retard"] as any),
    ))
    .orderBy(asc(factures.dateFacture), asc(factures.id));
  for (const f of facts as any[]) {
    num++;
    const auxNum = `C${String(f.clientId).padStart(5, "0")}`;
    const auxLib = `${f.clientPrenom || ""} ${f.clientNom || ""}`.trim() || `Client ${f.clientId}`;
    // OPE-136 — un avoir (note de credit) stocke des montants NEGATIFS. Le FEC
    // (arrete 29/07/2013) interdit les montants negatifs : une note de credit
    // s'enregistre en INVERSANT le sens des comptes, en valeur absolue. Une facture
    // normale : 411 debit TTC / 706 credit HT / 445 credit TVA. Un avoir : on inverse
    // (411 credit / 706 debit / 445 debit), montants en |valeur absolue|.
    const isAvoir = f.typeDocument === "avoir" || Number(f.totalTTC || 0) < 0;
    const piece = f.numero || `F-${f.id}`;
    const lib = `${isAvoir ? "Avoir" : "Facture"} ${piece}`;
    const ht = Math.abs(Number(f.totalHT || 0)), tva = Math.abs(Number(f.totalTVA || 0)), ttc = Math.abs(Number(f.totalTTC || 0));
    // Lettrage si reglee : meme code sur le 411 (debit VE) et le 411 (credit BQ).
    const paid = f.statut === "payee" && f.datePaiement;
    const lettre = paid ? `VL${f.id}` : "";
    // Sens des comptes selon facture vs avoir (jamais de montant negatif).
    const clientDebit = isAvoir ? 0 : ttc, clientCredit = isAvoir ? ttc : 0;
    const venteDebit = isAvoir ? ht : 0, venteCredit = isAvoir ? 0 : ht;
    push({ journal: jVE, journalLib: "Journal des ventes", num, date: f.dateFacture, compte: cClients, compteLib: "Clients", auxNum, auxLib, piece, pieceDate: f.dateFacture, lib, debit: clientDebit, credit: clientCredit, lettre, dateLet: paid ? f.datePaiement : undefined, valid: f.dateFacture });
    push({ journal: jVE, journalLib: "Journal des ventes", num, date: f.dateFacture, compte: cVentes, compteLib: "Ventes de prestations", piece, pieceDate: f.dateFacture, lib, debit: venteDebit, credit: venteCredit, valid: f.dateFacture });
    if (tva > 0) {
      // TVA ventilee par taux depuis les lignes de facture (445711/712/713...).
      // Les lignes d'avoir ont des montants negatifs : on filtre sur SUM <> 0 et on
      // prend la valeur absolue, en inversant le sens (debit pour un avoir).
      const lignes: any[] = await dbi.select({
        tauxTVA: facturesLignes.tauxTVA,
        tva: sql<string>`SUM(${facturesLignes.montantTVA})`,
      }).from(facturesLignes)
        .where(eq(facturesLignes.factureId, f.id))
        .groupBy(facturesLignes.tauxTVA)
        .having(sql`ABS(SUM(${facturesLignes.montantTVA})) > 0`);
      const rows = (lignes as any[]) || [];
      const sommeLignes = rows.reduce((s, l) => s + Math.abs(Number(l.tva || 0)), 0);
      if (rows.length > 0 && Math.abs(sommeLignes - tva) < 0.02) {
        for (const l of rows) {
          const t = compteTvaCollectee(Number(l.tauxTVA || 20));
          const mtva = Math.abs(Number(l.tva));
          push({ journal: jVE, journalLib: "Journal des ventes", num, date: f.dateFacture, compte: t.compte, compteLib: t.lib, piece, pieceDate: f.dateFacture, lib, debit: isAvoir ? mtva : 0, credit: isAvoir ? 0 : mtva, valid: f.dateFacture });
        }
      } else {
        // Repli : pas de lignes exploitables -> TVA agregee sur le compte configure.
        const t = compteTvaCollectee(20);
        push({ journal: jVE, journalLib: "Journal des ventes", num, date: f.dateFacture, compte: config?.compteTVACollectee || t.compte, compteLib: "TVA collectee", piece, pieceDate: f.dateFacture, lib, debit: isAvoir ? tva : 0, credit: isAvoir ? 0 : tva, valid: f.dateFacture });
      }
    }
    nbEcritures++;
  }

  // ---- 2) JOURNAL DES ACHATS (AC) : depenses deductibles ----
  const deps: any[] = await dbi.select({
    id: depenses.id, numero: depenses.numero, date_depense: depenses.date_depense,
    fournisseur: depenses.fournisseur, categorie: depenses.categorie,
    montant_ht: depenses.montant_ht, montant_tva: depenses.montant_tva, montant_ttc: depenses.montant_ttc,
  }).from(depenses)
    .where(and(
      eq(depenses.artisan_id, artisanId),
      between(depenses.date_depense, dStr, fStr),
    ))
    .orderBy(asc(depenses.date_depense), asc(depenses.id));
  for (const d of deps as any[]) {
    num++;
    const piece = d.numero || `D-${d.id}`;
    const lib = `Achat ${piece}${d.fournisseur ? " - " + d.fournisseur : ""}`;
    const ht = Number(d.montant_ht || 0), tvaD = Number(d.montant_tva || 0), ttc = Number(d.montant_ttc || 0);
    const charge = compteChargeDepense(d.categorie);
    push({ journal: jAC, journalLib: "Journal des achats", num, date: d.date_depense, compte: charge.compte, compteLib: charge.lib, piece, pieceDate: d.date_depense, lib, debit: ht, credit: 0, valid: d.date_depense });
    if (tvaD > 0) push({ journal: jAC, journalLib: "Journal des achats", num, date: d.date_depense, compte: cTvaDed, compteLib: "TVA deductible", piece, pieceDate: d.date_depense, lib, debit: tvaD, credit: 0, valid: d.date_depense });
    push({ journal: jAC, journalLib: "Journal des achats", num, date: d.date_depense, compte: cFourn, compteLib: "Fournisseurs", auxNum: d.fournisseur ? `F${String(d.id).padStart(5, "0")}` : "", auxLib: d.fournisseur || "", piece, pieceDate: d.date_depense, lib, debit: 0, credit: ttc, valid: d.date_depense });
    nbEcritures++;
  }

  // ---- 3) JOURNAL DE BANQUE (BQ) : encaissements (factures reglees) ----
  const pays: any[] = await dbi.select({
    id: factures.id, numero: factures.numero, datePaiement: factures.datePaiement,
    totalTTC: factures.totalTTC, typeDocument: factures.typeDocument,
    clientId: factures.clientId, clientNom: clients.nom, clientPrenom: clients.prenom,
  }).from(factures).leftJoin(clients, eq(clients.id, factures.clientId))
    .where(and(
      eq(factures.artisanId, artisanId),
      eq(factures.statut, "payee" as any),
      isNotNull(factures.datePaiement),
      sql`DATE(${factures.datePaiement}) BETWEEN ${dStr} AND ${fStr}`,
    ))
    .orderBy(asc(factures.datePaiement), asc(factures.id));
  for (const p of pays as any[]) {
    num++;
    const auxNum = `C${String(p.clientId).padStart(5, "0")}`;
    const auxLib = `${p.clientPrenom || ""} ${p.clientNom || ""}`.trim() || `Client ${p.clientId}`;
    const piece = p.numero || `F-${p.id}`;
    // OPE-136 — un avoir rembourse est un decaissement (banque au credit) ; on inverse
    // le sens en valeur absolue, jamais de montant negatif au FEC.
    const isAvoir = p.typeDocument === "avoir" || Number(p.totalTTC || 0) < 0;
    const lib = `${isAvoir ? "Remboursement" : "Reglement"} ${piece}`;
    const ttc = Math.abs(Number(p.totalTTC || 0));
    const lettre = `VL${p.id}`;
    push({ journal: jBQ, journalLib: "Journal de banque", num, date: p.datePaiement, compte: cBanque, compteLib: "Banque", piece, pieceDate: p.datePaiement, lib, debit: isAvoir ? 0 : ttc, credit: isAvoir ? ttc : 0, valid: p.datePaiement });
    push({ journal: jBQ, journalLib: "Journal de banque", num, date: p.datePaiement, compte: cClients, compteLib: "Clients", auxNum, auxLib, piece, pieceDate: p.datePaiement, lib, debit: isAvoir ? ttc : 0, credit: isAvoir ? 0 : ttc, lettre, dateLet: p.datePaiement, valid: p.datePaiement });
    nbEcritures++;
  }

  // ---- Controles de conformite ----
  const erreurs: string[] = [];
  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;
  const ecart = Math.round((totalDebit - totalCredit) * 100) / 100;
  const equilibre = Math.abs(ecart) < 0.01;
  if (!equilibre) erreurs.push(`Desequilibre debit/credit : ${ecart.toFixed(2)} EUR`);
  for (const cpt of Array.from(comptes)) {
    if (!/^[0-9]{3,}$/.test(cpt)) erreurs.push(`Compte PCG invalide : "${cpt}"`);
  }
  if (lines.length <= 1) erreurs.push("Aucune ecriture sur la periode");

  const conformite: FecConformite = {
    nbEcritures, nbLignes: lines.length - 1, totalDebit, totalCredit, ecart, equilibre, erreurs,
    comptesUtilises: Array.from(comptes).sort(),
  };
  return { content: lines.join("\n"), conformite };
}

export async function genererExportFEC(
  artisanId: number,
  dateDebut: Date,
  dateFin: Date
): Promise<string> {
  // FEC (Fichier des Ecritures Comptables, format reglementaire FR) :
  // 1 ligne d'entete + 1 ligne par ecriture comptable.
  // Source : factures payees + factures de la periode.
  const dbi = await getDb();
  const config = await getConfigurationComptable(artisanId);
  const compteVentes = config?.compteVentes || "706000";
  const compteTVA = config?.compteTVACollectee || "445710";
  const compteClients = config?.compteClients || "411000";
  const journal = config?.journalVentes || "VE";

  const dStr = dateDebut.toISOString().slice(0, 10);
  const fStr = dateFin.toISOString().slice(0, 10);
  const facts: any[] = await dbi.select({
    id: factures.id, numero: factures.numero, dateFacture: factures.dateFacture,
    totalHT: factures.totalHT, totalTVA: factures.totalTVA, totalTTC: factures.totalTTC,
    statut: factures.statut, datePaiement: factures.datePaiement,
    clientNom: clients.nom, clientPrenom: clients.prenom,
  }).from(factures).leftJoin(clients, eq(clients.id, factures.clientId))
    .where(and(
      eq(factures.artisanId, artisanId),
      sql`${factures.dateFacture} BETWEEN ${dStr} AND ${fStr}`,
      inArray(factures.statut, ["validee", "envoyee", "payee", "en_retard"] as any),
    ))
    .orderBy(asc(factures.dateFacture), asc(factures.id));

  // Entete FEC (18 colonnes obligatoires).
  const header = [
    "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum",
    "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate",
    "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet",
    "ValidDate", "Montantdevise", "Idevise",
  ].join("\t");

  const rows: string[] = [header];
  let ecritureNum = 1;
  for (const f of facts) {
    const dateF = new Date(f.dateFacture).toISOString().slice(0, 10).replace(/-/g, "");
    const clientLib = `${f.clientPrenom || ""} ${f.clientNom || ""}`.trim() || `Client #${f.id}`;
    const ttc = fecAmount(f.totalTTC);
    const ht = fecAmount(f.totalHT);
    const tva = fecAmount(f.totalTVA);
    // 3 lignes par facture : creance client (debit), vente HT (credit), TVA (credit).
    rows.push([journal, "Ventes", ecritureNum, dateF, compteClients, "Clients", "", "", f.numero || "", dateF, `Facture ${f.numero}`, ttc, "0,00", "", "", "", "", ""].join("\t"));
    rows.push([journal, "Ventes", ecritureNum, dateF, compteVentes, "Ventes de prestations", "", "", f.numero || "", dateF, `Facture ${f.numero}`, "0,00", ht, "", "", "", "", ""].join("\t"));
    rows.push([journal, "Ventes", ecritureNum, dateF, compteTVA, "TVA collectee", "", "", f.numero || "", dateF, `Facture ${f.numero}`, "0,00", tva, "", "", "", "", ""].join("\t"));
    ecritureNum++;
  }
  return rows.join("\n");
}

export async function genererExportIIF(
  artisanId: number,
  dateDebut: Date,
  dateFin: Date
): Promise<string> {
  // IIF (Intuit Interchange Format pour QuickBooks). Format ligne par
  // ligne avec sections !TRNS / !SPL / !ENDTRNS.
  const dbi = await getDb();

  const dStr = dateDebut.toISOString().slice(0, 10);
  const fStr = dateFin.toISOString().slice(0, 10);
  const facts: any[] = await dbi.select({
    id: factures.id, numero: factures.numero, dateFacture: factures.dateFacture,
    totalHT: factures.totalHT, totalTVA: factures.totalTVA, totalTTC: factures.totalTTC,
    clientNom: clients.nom, clientPrenom: clients.prenom,
  }).from(factures).leftJoin(clients, eq(clients.id, factures.clientId))
    .where(and(
      eq(factures.artisanId, artisanId),
      sql`${factures.dateFacture} BETWEEN ${dStr} AND ${fStr}`,
      inArray(factures.statut, ["validee", "envoyee", "payee", "en_retard"] as any),
    ))
    .orderBy(asc(factures.dateFacture));

  const lines: string[] = [];
  lines.push("!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO");
  lines.push("!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO");
  lines.push("!ENDTRNS");
  for (const f of facts) {
    const dateF = new Date(f.dateFacture).toLocaleDateString("en-US");
    const client = `${f.clientPrenom || ""} ${f.clientNom || ""}`.trim() || `Client #${f.id}`;
    const ttc = Number(f.totalTTC).toFixed(2);
    const ht = (-Number(f.totalHT)).toFixed(2);
    const tva = (-Number(f.totalTVA)).toFixed(2);
    lines.push(`TRNS\t\tINVOICE\t${dateF}\tAccounts Receivable\t${client}\t${ttc}\t${f.numero || ""}\tFacture ${f.numero}`);
    lines.push(`SPL\t\tINVOICE\t${dateF}\tSales\t${client}\t${ht}\tHT`);
    lines.push(`SPL\t\tINVOICE\t${dateF}\tSales Tax Payable\t${client}\t${tva}\tTVA`);
    lines.push("ENDTRNS");
  }
  return lines.join("\n");
}

// Items en attente de sync (factures non encore exportees vers le logiciel).
export async function getPendingItemsComptables(artisanId: number): Promise<any[]> {
  const dbi = await getDb();
  // Factures de l'artisan non couvertes par un export 'termine' chevauchant leur date.
  // NOT EXISTS corrélé porté en Drizzle (la corrélation f.dateFacture BETWEEN
  // e.periodeDebut AND e.periodeFin reste en sql brut, neutre dialecte).
  return await dbi.select({
    id: factures.id, numero: factures.numero, dateFacture: factures.dateFacture,
    totalTTC: factures.totalTTC, statut: factures.statut,
  }).from(factures)
    .where(and(
      eq(factures.artisanId, artisanId),
      inArray(factures.statut, ["validee", "envoyee", "payee", "en_retard"] as any),
      notExists(
        dbi.select({ x: sql`1` }).from(exportsComptables).where(and(
          eq(exportsComptables.artisanId, factures.artisanId),
          eq(exportsComptables.statut, "termine" as any),
          sql`${factures.dateFacture} BETWEEN ${exportsComptables.periodeDebut} AND ${exportsComptables.periodeFin}`,
        )),
      ),
    ))
    .orderBy(desc(factures.dateFacture))
    .limit(200);
}

export async function getSyncLogsComptables(artisanId: number): Promise<ExportComptable[]> {
  const dbi = await getDb();
  return await dbi.select().from(exportsComptables)
    .where(eq(exportsComptables.artisanId, artisanId))
    .orderBy(desc(exportsComptables.createdAt))
    .limit(50);
}

export async function lancerSynchronisationComptable(
  artisanId: number
): Promise<{ success: boolean; nbItems: number; message: string }> {
  // Synchronisation manuelle : genere un export FEC pour les items
  // en attente du mois courant.
  const config = await getConfigurationComptable(artisanId);
  if (!config) return { success: false, nbItems: 0, message: "Configuration absente" };
  const today = new Date();
  const debutMois = new Date(today.getFullYear(), today.getMonth(), 1);
  const items = await getPendingItemsComptables(artisanId);
  if (items.length === 0) return { success: true, nbItems: 0, message: "Rien a synchroniser" };
  await createExportComptable({
    artisanId,
    logiciel: config.logiciel || "sage",
    formatExport: config.formatExport || "fec",
    periodeDebut: debutMois.toISOString().slice(0, 10),
    periodeFin: today.toISOString().slice(0, 10),
    nombreEcritures: items.length,
    statut: "termine",
  });
  // Met a jour derniereSync (NOW() -> Date JS).
  const dbi = await getDb();
  await dbi.update(configurationsComptables).set({ derniereSync: new Date() })
    .where(eq(configurationsComptables.artisanId, artisanId));
  return { success: true, nbItems: items.length, message: `${items.length} ecritures synchronisees` };
}

export async function retrySyncItem(exportId: number): Promise<ExportComptable | undefined> {
  // Pour un export en erreur, on remet statut en_cours puis termine
  // (idempotent — un vrai retry refait le calcul, ici on ne marque que
  // l'etat puisque le contenu n'est pas re-genere par cette fonction).
  return updateExportComptable(exportId, { statut: "termine", erreur: null });
}

// ============================================================================
// NOTIFICATIONS PUSH PWA (subscriptions + preferences + historique) - Drizzle
// ============================================================================

export async function savePushSubscription(
  data: InsertPushSubscription
): Promise<PushSubscription | undefined> {
  // Upsert sur (technicienId, endpoint) : reactive ou recree — check-then-act neutre dialecte.
  // NB OPE-184 : `push_subscriptions` n'a PAS de clé unique (seul `id` PK, vérifié base live)
  // → l'ancien `ON DUPLICATE KEY UPDATE` ne déclenchait jamais l'update en mysql (bug latent :
  // ré-abonnement = doublon de subscription). Le check-then-act rend l'upsert réellement idempotent.
  // `actif` est forcé à TRUE (réactivation) ; `updatedAt` géré par $onUpdate.
  const dbi = await getDb();
  const existing = await dbi.select({ id: pushSubscriptions.id }).from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.technicienId, data.technicienId), eq(pushSubscriptions.endpoint, data.endpoint)))
    .limit(1);
  if (existing[0]) {
    await dbi.update(pushSubscriptions).set({
      p256dh: data.p256dh, auth: data.auth, userAgent: data.userAgent || null, actif: true,
    }).where(eq(pushSubscriptions.id, existing[0].id));
  } else {
    await dbi.insert(pushSubscriptions).values({
      technicienId: data.technicienId, endpoint: data.endpoint, p256dh: data.p256dh,
      auth: data.auth, userAgent: data.userAgent || null, actif: true,
    });
  }
  const r = await dbi.select().from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.technicienId, data.technicienId), eq(pushSubscriptions.endpoint, data.endpoint)))
    .orderBy(desc(pushSubscriptions.id)).limit(1);
  return r[0];
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const dbi = await getDb();
  // Soft-delete : marque actif=false plutot que DELETE (utile pour
  // debug + reactivation rapide).
  await dbi.update(pushSubscriptions)
    .set({ actif: false })
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function getPushSubscriptionByEndpoint(endpoint: string): Promise<PushSubscription | undefined> {
  const dbi = await getDb();
  if (!dbi) return undefined;
  const r = await dbi.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).limit(1);
  return r[0];
}

export async function getPreferencesNotifications(
  technicienId: number
): Promise<PreferenceNotification | undefined> {
  const dbi = await getDb();
  const r = await dbi.select().from(preferencesNotifications)
    .where(eq(preferencesNotifications.technicienId, technicienId)).limit(1);
  return r[0];
}

export async function savePreferencesNotifications(
  data: InsertPreferenceNotification
): Promise<PreferenceNotification | undefined> {
  // Upsert sur technicienId (pas explicitement UNIQUE dans le schema,
  // donc on fait SELECT + UPDATE/INSERT).
  const existing = await getPreferencesNotifications(data.technicienId);
  const dbi = await getDb();
  if (existing) {
    await dbi.update(preferencesNotifications).set(data).where(eq(preferencesNotifications.id, existing.id));
  } else {
    await dbi.insert(preferencesNotifications).values(data);
  }
  return getPreferencesNotifications(data.technicienId);
}

export async function createHistoriqueNotificationPush(
  data: InsertHistoriqueNotificationPush
): Promise<HistoriqueNotificationPush | undefined> {
  const dbi = await getDb();
  await dbi.insert(historiqueNotificationsPush).values(data);
  const r = await dbi.select().from(historiqueNotificationsPush)
    .where(eq(historiqueNotificationsPush.technicienId, data.technicienId))
    .orderBy(desc(historiqueNotificationsPush.id)).limit(1);
  return r[0];
}

export async function getHistoriqueNotificationsPush(
  technicienId: number,
  limit: number = 50
): Promise<HistoriqueNotificationPush[]> {
  const dbi = await getDb();
  return await dbi.select().from(historiqueNotificationsPush)
    .where(eq(historiqueNotificationsPush.technicienId, technicienId))
    .orderBy(desc(historiqueNotificationsPush.dateEnvoi))
    .limit(limit);
}

export async function getHistoriqueNotificationPushById(id: number): Promise<HistoriqueNotificationPush | undefined> {
  const dbi = await getDb();
  if (!dbi) return undefined;
  const r = await dbi.select().from(historiqueNotificationsPush).where(eq(historiqueNotificationsPush.id, id)).limit(1);
  return r[0];
}

export async function markNotificationPushAsRead(id: number): Promise<void> {
  const dbi = await getDb();
  await dbi.update(historiqueNotificationsPush)
    .set({ statut: "lu", dateLecture: new Date() })
    .where(eq(historiqueNotificationsPush.id, id));
}

// ============================================================================
// PREVISIONS CA + ALERTES ECARTS (config + historique alertes) - Drizzle ORM
// ============================================================================

export async function getConfigAlertePrevision(
  artisanId: number
): Promise<ConfigAlertePrevision | undefined> {
  const dbi = await getDb();
  const r = await dbi.select().from(configAlertesPrevisions)
    .where(eq(configAlertesPrevisions.artisanId, artisanId)).limit(1);
  return r[0];
}

// Colonnes autorisées de config_alertes_previsions — whitelist explicite (noms
// interpolés en SQL brut). Cf. audit injection SQL 2026-06-13.
const CONFIG_ALERTE_COLS = new Set([
  "artisanId", "seuilAlertePositif", "seuilAlerteNegatif", "alerteEmail",
  "alerteSms", "emailDestination", "telephoneDestination", "frequenceVerification",
  "actif",
]);

export async function saveConfigAlertePrevision(
  data: InsertConfigAlertePrevision
): Promise<ConfigAlertePrevision | undefined> {
  // Upsert sur artisanId (clé unique) : select-puis-insert/update neutre dialecte.
  // Whitelist CONFIG_ALERTE_COLS conservée (defense-in-depth audit injection SQL).
  const dbi = await getDb();
  const filtered: Record<string, any> = {};
  for (const k of Object.keys(data)) if (CONFIG_ALERTE_COLS.has(k)) filtered[k] = (data as any)[k];
  const existing = await dbi.select({ id: configAlertesPrevisions.id }).from(configAlertesPrevisions)
    .where(eq(configAlertesPrevisions.artisanId, data.artisanId)).limit(1);
  if (existing[0]) {
    const { artisanId: _aid, ...updates } = filtered;
    if (Object.keys(updates).length > 0) {
      await dbi.update(configAlertesPrevisions).set(updates)
        .where(eq(configAlertesPrevisions.artisanId, data.artisanId));
    }
  } else {
    await dbi.insert(configAlertesPrevisions).values(filtered as any);
  }
  return getConfigAlertePrevision(data.artisanId);
}

export async function getHistoriqueAlertesPrevisions(
  artisanId: number
): Promise<HistoriqueAlertePrevision[]> {
  const dbi = await getDb();
  return await dbi.select().from(historiqueAlertesPrevisions)
    .where(eq(historiqueAlertesPrevisions.artisanId, artisanId))
    .orderBy(desc(historiqueAlertesPrevisions.dateEnvoi))
    .limit(100);
}

export async function verifierEcartsEtEnvoyerAlertes(
  artisanId: number
): Promise<HistoriqueAlertePrevision[]> {
  // Compare CA previsionnel vs realise pour le mois courant. Si l'ecart
  // depasse le seuil configure, enregistre une alerte. Le canal d'envoi
  // reel (email/sms) est externe a ce helper — on enregistre juste la
  // ligne d'historique.
  const config = await getConfigAlertePrevision(artisanId);
  if (!config || !config.actif) return [];

  const dbi = await getDb();
  const now = new Date();
  const mois = now.getMonth() + 1;
  const annee = now.getFullYear();

  // CA previsionnel pour ce mois (depuis previsions_ca).
  const prevRows = await dbi.select().from(previsionsCA)
    .where(and(
      eq(previsionsCA.artisanId, artisanId),
      eq(previsionsCA.mois, mois),
      eq(previsionsCA.annee, annee),
    )).limit(1);
  const prev = prevRows[0];
  if (!prev) return [];
  const caPrev = Number(prev.caPrevisionnel || 0);
  if (caPrev <= 0) return [];

  // CA realise pour le mois (factures payees). dateFacture timestamp → sql BETWEEN brut.
  const debutMois = new Date(annee, mois - 1, 1).toISOString().slice(0, 10);
  const finMois = new Date(annee, mois, 0).toISOString().slice(0, 10);
  const [rRow] = await dbi.select({ ca: sql<string>`COALESCE(SUM(${factures.totalTTC}), 0)` })
    .from(factures).where(and(
      eq(factures.artisanId, artisanId),
      eq(factures.statut, "payee" as any),
      sql`${factures.dateFacture} BETWEEN ${debutMois} AND ${finMois}`,
    ));
  const caReel = Number(rRow?.ca || 0);

  // Calcul ecart en %.
  const ecart = ((caReel - caPrev) / caPrev) * 100;
  const seuilPos = Number(config.seuilAlertePositif || 10);
  const seuilNeg = Number(config.seuilAlerteNegatif || 10);

  const nouvellesAlertes: HistoriqueAlertePrevision[] = [];
  let typeAlerte: "depassement_positif" | "depassement_negatif" | null = null;
  if (ecart >= seuilPos) typeAlerte = "depassement_positif";
  else if (ecart <= -seuilNeg) typeAlerte = "depassement_negatif";
  if (!typeAlerte) return [];

  // Verifier si une alerte du meme type a deja ete envoyee ce mois pour
  // eviter le spam.
  const existsRows = await dbi.select({ id: historiqueAlertesPrevisions.id }).from(historiqueAlertesPrevisions)
    .where(and(
      eq(historiqueAlertesPrevisions.artisanId, artisanId),
      eq(historiqueAlertesPrevisions.mois, mois),
      eq(historiqueAlertesPrevisions.annee, annee),
      eq(historiqueAlertesPrevisions.typeAlerte, typeAlerte as any),
    )).limit(1);
  if (existsRows.length > 0) return [];

  const canal: "email" | "sms" | "les_deux" =
    config.alerteEmail && config.alerteSms ? "les_deux" :
    config.alerteEmail ? "email" :
    config.alerteSms ? "sms" : "email";
  const message = typeAlerte === "depassement_positif"
    ? `Bonne nouvelle : votre CA realise (${caReel.toFixed(0)} EUR) depasse de ${ecart.toFixed(1)}% le previsionnel (${caPrev.toFixed(0)} EUR) pour ${mois}/${annee}.`
    : `Attention : votre CA realise (${caReel.toFixed(0)} EUR) est inferieur de ${Math.abs(ecart).toFixed(1)}% au previsionnel (${caPrev.toFixed(0)} EUR) pour ${mois}/${annee}.`;

  await dbi.insert(historiqueAlertesPrevisions).values({
    artisanId,
    mois,
    annee,
    typeAlerte,
    caPrevisionnel: caPrev.toFixed(2),
    caRealise: caReel.toFixed(2),
    ecartPourcentage: ecart.toFixed(2),
    canalEnvoi: canal,
    statut: "envoye",
    message,
  });
  const lastRows = await dbi.select().from(historiqueAlertesPrevisions)
    .where(and(
      eq(historiqueAlertesPrevisions.artisanId, artisanId),
      eq(historiqueAlertesPrevisions.mois, mois),
      eq(historiqueAlertesPrevisions.annee, annee),
      eq(historiqueAlertesPrevisions.typeAlerte, typeAlerte),
    )).orderBy(desc(historiqueAlertesPrevisions.id)).limit(1);
  if (lastRows[0]) nouvellesAlertes.push(lastRows[0]);
  return nouvellesAlertes;
}

// ============================================================================
// DEPENSES & NOTES DE FRAIS (raw SQL - tables custom hors schema.ts)
// ============================================================================

export async function getNextDepenseNumero(artisanId: number): Promise<string> {
  const db = await getDb();
  const [row] = await db.select({ numero: depenses.numero }).from(depenses)
    .where(eq(depenses.artisan_id, artisanId)).orderBy(desc(depenses.id)).limit(1);
  const last = row?.numero || "";
  const m = last.match(/-(\d+)$/);
  const n = m ? parseInt(m[1], 10) + 1 : 1;
  return `DEP-${String(n).padStart(5, "0")}`;
}

export async function getNextNoteFraisNumero(artisanId: number): Promise<string> {
  const db = await getDb();
  const [row] = await db.select({ numero: notesDeFrais.numero }).from(notesDeFrais)
    .where(eq(notesDeFrais.artisan_id, artisanId)).orderBy(desc(notesDeFrais.id)).limit(1);
  const last = row?.numero || "";
  const m = last.match(/-(\d+)$/);
  const n = m ? parseInt(m[1], 10) + 1 : 1;
  return `NDF-${String(n).padStart(5, "0")}`;
}

type DepenseFilters = {
  categorie?: string;
  statut?: string;
  dateDebut?: string;
  dateFin?: string;
  userId?: number;
  clientId?: number;
  search?: string;
};

export async function getDepensesByArtisan(
  artisanId: number,
  filters: DepenseFilters = {}
): Promise<any[]> {
  const db = await getDb();
  const conds: any[] = [eq(depenses.artisan_id, artisanId)];
  if (filters.categorie) conds.push(eq(depenses.categorie, filters.categorie));
  if (filters.statut) conds.push(eq(depenses.statut, filters.statut as any));
  if (filters.dateDebut) conds.push(gte(depenses.date_depense, filters.dateDebut));
  if (filters.dateFin) conds.push(lte(depenses.date_depense, filters.dateFin));
  if (filters.userId) conds.push(eq(depenses.user_id, filters.userId));
  if (filters.clientId) conds.push(eq(depenses.client_id, filters.clientId));
  if (filters.search) {
    const q = `%${filters.search}%`;
    conds.push(or(like(depenses.fournisseur, q), like(depenses.description, q), like(depenses.numero, q)));
  }
  return await db.select().from(depenses).where(and(...conds))
    .orderBy(desc(depenses.date_depense), desc(depenses.id)).limit(500);
}

export async function getDepenseById(id: number, artisanId: number): Promise<any | null> {
  const db = await getDb();
  const [row] = await db.select().from(depenses)
    .where(and(eq(depenses.id, id), eq(depenses.artisan_id, artisanId))).limit(1);
  return row || null;
}

// OPE-99 — détection de doublon probable d'une dépense (anti double-remboursement /
// double déduction TVA). Avertissement NON bloquant : on retourne les dépenses du même
// tenant qui partagent montant TTC + date + fournisseur (triplet retenu par Odoo
// hr_expense.duplicate_expense_ids). `excludeId` permet d'ignorer la dépense en cours
// d'édition. Toujours scopé `artisan_id` (jamais cross-tenant).
export async function findDepensesDoublons(
  artisanId: number,
  params: { montantTtc: number; dateDepense: string; fournisseur?: string | null; excludeId?: number },
): Promise<any[]> {
  const db = await getDb();
  const conds: any[] = [
    eq(depenses.artisan_id, artisanId),
    sql`ABS(${depenses.montant_ttc} - ${params.montantTtc}) < 0.01`,
    eq(depenses.date_depense, params.dateDepense),
    sql`COALESCE(${depenses.fournisseur}, '') = COALESCE(${params.fournisseur ?? ''}, '')`,
  ];
  if (params.excludeId) conds.push(ne(depenses.id, params.excludeId));
  return await db.select({
    id: depenses.id, numero: depenses.numero, montantTtc: depenses.montant_ttc,
    dateDepense: depenses.date_depense, fournisseur: depenses.fournisseur,
    description: depenses.description, statut: depenses.statut,
  }).from(depenses).where(and(...conds))
    .orderBy(desc(depenses.date_depense), desc(depenses.id)).limit(10);
}

export async function createDepense(data: {
  artisanId: number;
  userId: number;
  numero: string;
  dateDepense: string;
  fournisseur?: string | null;
  categorie: string;
  sousCategorie?: string | null;
  description?: string | null;
  montantHt: number;
  tauxTva: number;
  montantTva: number;
  montantTtc: number;
  modePaiement?: string;
  statut?: string;
  remboursable?: boolean;
  chantierId?: number | null;
  interventionId?: number | null;
  clientId?: number | null;
  notes?: string | null;
  justificatifUrl?: string | null;
  justificatifNom?: string | null;
  tvaDeductible?: boolean;
}): Promise<any | null> {
  const db = await getDb();
  const newId = await insertReturningId(depenses, {
    artisan_id: data.artisanId, user_id: data.userId, numero: data.numero,
    date_depense: data.dateDepense, fournisseur: data.fournisseur || null,
    categorie: data.categorie, sous_categorie: data.sousCategorie || null,
    description: data.description || null,
    montant_ht: String(data.montantHt), taux_tva: String(data.tauxTva),
    montant_tva: String(data.montantTva), montant_ttc: String(data.montantTtc),
    mode_paiement: (data.modePaiement || "carte") as any, statut: (data.statut || "brouillon") as any,
    remboursable: data.remboursable ?? true, chantier_id: data.chantierId || null,
    intervention_id: data.interventionId || null, client_id: data.clientId || null,
    notes: data.notes || null, justificatif_url: data.justificatifUrl || null,
    justificatif_nom: data.justificatifNom || null, tva_deductible: data.tvaDeductible ?? true,
  });
  if (!newId) return null;
  return getDepenseById(newId, data.artisanId);
}

const DEPENSE_FIELD_MAP: Record<string, string> = {
  dateDepense: "date_depense", fournisseur: "fournisseur", categorie: "categorie",
  sousCategorie: "sous_categorie", description: "description",
  montantHt: "montant_ht", tauxTva: "taux_tva", montantTva: "montant_tva",
  montantTtc: "montant_ttc", modePaiement: "mode_paiement",
  // OPE-63 — `statut`/`rembourse`/`dateRemboursement` VOLONTAIREMENT hors map : les
  // transitions d'état de remboursement sont réservées au circuit contrôlé des notes de
  // frais (addDepenseToNoteFrais / approuverNoteFrais / payerNoteFrais, en SQL direct).
  // Les laisser ici permettait à un collaborateur de s'auto-rembourser via le `update`
  // générique (depenses.update accepte un objet libre) en contournant tout approbateur.
  // `remboursable` (classification « éligible au remboursement ») reste éditable.
  remboursable: "remboursable",
  chantierId: "chantier_id",
  interventionId: "intervention_id", clientId: "client_id", notes: "notes",
  justificatifUrl: "justificatif_url", justificatifNom: "justificatif_nom",
  ocrBrut: "ocr_brut", ocrTraite: "ocr_traite",
  recurrente: "recurrente", frequenceRecurrence: "frequence_recurrence",
  prochaineOccurrence: "prochaine_occurrence", tvaDeductible: "tva_deductible",
};

export async function updateDepense(
  id: number,
  artisanId: number,
  data: Record<string, any>
): Promise<any | null> {
  const db = await getDb();
  const numericCols = new Set(["montant_ht", "taux_tva", "montant_tva", "montant_ttc"]);
  const sets: any = {};
  for (const [key, val] of Object.entries(data)) {
    const col = DEPENSE_FIELD_MAP[key];
    if (!col) continue; // whitelist OPE-63 préservée
    sets[col] = (numericCols.has(col) && val != null) ? String(val) : val;
  }
  if (Object.keys(sets).length > 0) {
    await db.update(depenses).set(sets).where(and(eq(depenses.id, id), eq(depenses.artisan_id, artisanId)));
  }
  // Recalcul TVA/TTC dès qu'un champ monétaire est touché (OPE-252) : la TVA et le
  // TTC sont TOUJOURS dérivés du HT + taux (le formulaire est HT-first), donc on ne
  // peut pas persister un montant_tva/montant_ttc incohérent avec le HT (qui
  // corromprait FEC/CA3). Behavior-preserving : le front envoie HT+taux → recalcul
  // déjà déclenché ; on ajoute juste le cas « TTC/TVA seul » (forgé) pour le corriger.
  if ("montantHt" in data || "tauxTva" in data || "montantTva" in data || "montantTtc" in data) {
    const dep = await getDepenseById(id, artisanId);
    if (dep) {
      const ht = Number(dep.montant_ht || 0);
      const tx = Number(dep.taux_tva || 0);
      const tva = +(ht * tx / 100).toFixed(2);
      const ttc = +(ht + tva).toFixed(2);
      await db.update(depenses).set({ montant_tva: String(tva), montant_ttc: String(ttc) })
        .where(and(eq(depenses.id, id), eq(depenses.artisan_id, artisanId)));
    }
  }
  return getDepenseById(id, artisanId);
}

export async function deleteDepense(id: number, artisanId: number): Promise<void> {
  const db = await getDb();
  await db.delete(notesFraisDepenses).where(eq(notesFraisDepenses.depense_id, id));
  await db.delete(depenses).where(and(eq(depenses.id, id), eq(depenses.artisan_id, artisanId)));
}

export async function markDepenseOcrTraite(id: number, artisanId: number, ocrData: any): Promise<void> {
  const db = await getDb();
  // OPE-91 : scope par artisan_id pour éviter l'écriture cross-tenant.
  await db.update(depenses)
    .set({ ocr_brut: JSON.stringify(ocrData || {}).slice(0, 5000), ocr_traite: true })
    .where(and(eq(depenses.id, id), eq(depenses.artisan_id, artisanId)));
}

export async function getDepensesStats(
  artisanId: number,
  mois?: string
): Promise<any> {
  const db = await getDb();
  const m = mois || new Date().toISOString().slice(0, 7);
  const debutMois = `${m}-01`;
  const [y, mo] = m.split("-").map(Number);
  const finMois = new Date(y, mo, 0).toISOString().slice(0, 10);
  const moisPrec = new Date(y, mo - 2, 1).toISOString().slice(0, 7);
  const debutPrec = `${moisPrec}-01`;
  const finPrec = new Date(y, mo - 1, 0).toISOString().slice(0, 10);
  const anneeDebut = `${y}-01-01`;
  const anneeFin = `${y}-12-31`;
  // 5 mois avant debutMois (remplace DATE_SUB(?, INTERVAL 5 MONTH)).
  const cinqMoisAvant = new Date(y, (mo - 1) - 5, 1).toISOString().slice(0, 10);

  const sumTtcEntre = (d1: string, d2: string) =>
    db.select({ total: sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)` })
      .from(depenses)
      .where(and(eq(depenses.artisan_id, artisanId), between(depenses.date_depense, d1, d2)));

  const [totMois] = await db.select({
    total: sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)`,
    nb: sql<number>`COUNT(*)`,
    aRembourser: sql<string>`COALESCE(SUM(CASE WHEN ${depenses.remboursable} = TRUE AND ${depenses.rembourse} = FALSE THEN ${depenses.montant_ttc} ELSE 0 END), 0)`,
    tvaRecup: sql<string>`COALESCE(SUM(CASE WHEN ${depenses.tva_deductible} = TRUE THEN ${depenses.montant_tva} ELSE 0 END), 0)`,
  }).from(depenses).where(and(eq(depenses.artisan_id, artisanId), between(depenses.date_depense, debutMois, finMois)));

  const [totPrec] = await sumTtcEntre(debutPrec, finPrec);
  const [totAnnee] = await sumTtcEntre(anneeDebut, anneeFin);

  const parCategorie = await db.select({
    categorie: depenses.categorie,
    total: sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)`,
    nb: sql<number>`COUNT(*)`,
  }).from(depenses)
    .where(and(eq(depenses.artisan_id, artisanId), between(depenses.date_depense, debutMois, finMois)))
    .groupBy(depenses.categorie)
    .orderBy(desc(sql`COALESCE(SUM(${depenses.montant_ttc}), 0)`));

  const topDepenses = await db.select({
    id: depenses.id, numero: depenses.numero, fournisseur: depenses.fournisseur,
    categorie: depenses.categorie, montant_ttc: depenses.montant_ttc, date_depense: depenses.date_depense,
  }).from(depenses)
    .where(and(eq(depenses.artisan_id, artisanId), between(depenses.date_depense, debutMois, finMois)))
    .orderBy(desc(depenses.montant_ttc)).limit(5);

  const topFournisseurs = await db.select({
    fournisseur: depenses.fournisseur,
    total: sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)`,
    nb: sql<number>`COUNT(*)`,
  }).from(depenses)
    .where(and(
      eq(depenses.artisan_id, artisanId),
      between(depenses.date_depense, debutMois, finMois),
      isNotNull(depenses.fournisseur),
      ne(depenses.fournisseur, ""),
    ))
    .groupBy(depenses.fournisseur)
    .orderBy(desc(sql`COALESCE(SUM(${depenses.montant_ttc}), 0)`)).limit(3);

  const parMois = await db.select({
    mois: sql<string>`to_char(${depenses.date_depense}, 'YYYY-MM')`,
    total: sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)`,
  }).from(depenses)
    .where(and(eq(depenses.artisan_id, artisanId), gte(depenses.date_depense, cinqMoisAvant)))
    .groupBy(sql`to_char(${depenses.date_depense}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${depenses.date_depense}, 'YYYY-MM') ASC`);

  const totalM = Number(totMois?.total || 0);
  const totalP = Number(totPrec?.total || 0);
  const variation = totalP > 0 ? ((totalM - totalP) / totalP) * 100 : null;

  return {
    mois: m,
    totalMois: totalM,
    nbDepensesMois: Number(totMois?.nb || 0),
    aRembourser: Number(totMois?.aRembourser || 0),
    tvaRecuperable: Number(totMois?.tvaRecup || 0),
    totalMoisPrecedent: totalP,
    variation,
    totalAnnee: Number(totAnnee?.total || 0),
    parCategorie: parCategorie as any[],
    topDepenses: topDepenses as any[],
    topFournisseurs: topFournisseurs as any[],
    parMois: parMois as any[],
  };
}

// === Catégories ===

export async function getCategoriesDepenses(artisanId: number): Promise<any[]> {
  const db = await getDb();
  return await db.select().from(categoriesDepenses)
    .where(and(eq(categoriesDepenses.artisan_id, artisanId), eq(categoriesDepenses.actif, true)))
    .orderBy(asc(categoriesDepenses.ordre), asc(categoriesDepenses.id));
}

export async function createCategorieDepense(data: {
  artisanId: number;
  nom: string;
  couleur?: string;
  icone?: string;
  compteComptable?: string;
  plafondMensuel?: number;
}): Promise<any | null> {
  const db = await getDb();
  // INSERT IGNORE (unique artisan_id+nom) → select-puis-insert, dialect-neutre.
  const existing = await db.select().from(categoriesDepenses)
    .where(and(eq(categoriesDepenses.artisan_id, data.artisanId), eq(categoriesDepenses.nom, data.nom))).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(categoriesDepenses).values({
    artisan_id: data.artisanId,
    nom: data.nom,
    couleur: data.couleur || "#6366f1",
    icone: data.icone || "Receipt",
    compte_comptable: data.compteComptable ?? null,
    plafond_mensuel: data.plafondMensuel != null ? String(data.plafondMensuel) : null,
  });
  const [row] = await db.select().from(categoriesDepenses)
    .where(and(eq(categoriesDepenses.artisan_id, data.artisanId), eq(categoriesDepenses.nom, data.nom))).limit(1);
  return row || null;
}

export async function updateCategorieDepense(
  id: number,
  artisanId: number,
  data: { nom?: string; couleur?: string; icone?: string; compteComptable?: string; plafondMensuel?: number; actif?: boolean }
): Promise<void> {
  const db = await getDb();
  const sets: any = {};
  if (data.nom !== undefined) sets.nom = data.nom;
  if (data.couleur !== undefined) sets.couleur = data.couleur;
  if (data.icone !== undefined) sets.icone = data.icone;
  if (data.compteComptable !== undefined) sets.compte_comptable = data.compteComptable;
  if (data.plafondMensuel !== undefined) sets.plafond_mensuel = data.plafondMensuel != null ? String(data.plafondMensuel) : null;
  if (data.actif !== undefined) sets.actif = data.actif;
  if (Object.keys(sets).length === 0) return;
  await db.update(categoriesDepenses).set(sets)
    .where(and(eq(categoriesDepenses.id, id), eq(categoriesDepenses.artisan_id, artisanId)));
}

export async function deleteCategorieDepense(id: number, artisanId: number): Promise<void> {
  const db = await getDb();
  // Soft-delete : marque actif=FALSE pour preserver l'historique des depenses.
  await db.update(categoriesDepenses).set({ actif: false })
    .where(and(eq(categoriesDepenses.id, id), eq(categoriesDepenses.artisan_id, artisanId)));
}

// === Notes de frais ===

export async function getNotesFrais(artisanId: number, userId?: number): Promise<any[]> {
  const db = await getDb();
  const conds: any[] = [eq(notesDeFrais.artisan_id, artisanId)];
  if (userId) conds.push(eq(notesDeFrais.user_id, userId));
  return await db.select({
    ...getTableColumns(notesDeFrais),
    nb_depenses: sql<number>`(SELECT COUNT(*) FROM ${notesFraisDepenses} WHERE ${notesFraisDepenses.note_id} = ${notesDeFrais.id})`,
  }).from(notesDeFrais).where(and(...conds)).orderBy(desc(notesDeFrais.created_at));
}

export async function getNoteFraisById(id: number, artisanId: number): Promise<any | null> {
  const db = await getDb();
  const [note] = await db.select().from(notesDeFrais)
    .where(and(eq(notesDeFrais.id, id), eq(notesDeFrais.artisan_id, artisanId))).limit(1);
  if (!note) return null;
  const deps = await db.select(getTableColumns(depenses)).from(depenses)
    .innerJoin(notesFraisDepenses, eq(notesFraisDepenses.depense_id, depenses.id))
    .where(eq(notesFraisDepenses.note_id, id))
    .orderBy(desc(depenses.date_depense));
  return { ...note, depenses: deps };
}

export async function createNoteFrais(data: {
  artisanId: number;
  userId: number;
  numero: string;
  titre: string;
  periodeDebut: string;
  periodeFin: string;
}): Promise<any | null> {
  const newId = await insertReturningId(notesDeFrais, {
    artisan_id: data.artisanId,
    user_id: data.userId,
    numero: data.numero,
    titre: data.titre,
    periode_debut: data.periodeDebut,
    periode_fin: data.periodeFin,
  });
  if (!newId) return null;
  return getNoteFraisById(newId, data.artisanId);
}

export async function addDepenseToNoteFrais(noteId: number, depenseId: number, artisanId: number): Promise<void> {
  const db = await getDb();
  // OPE-182 — vérifier que la NOTE appartient bien à l'artisan (la table de liaison
  // `notes_frais_depenses` n'a pas d'`artisan_id`) → empêche de lier sa dépense dans
  // la note d'un autre tenant. Skip silencieux si la note n'est pas la sienne.
  const [noteOwn] = await db.select({ id: notesDeFrais.id }).from(notesDeFrais)
    .where(and(eq(notesDeFrais.id, noteId), eq(notesDeFrais.artisan_id, artisanId))).limit(1);
  if (!noteOwn) return;
  // Verifier que la depense appartient bien a l'artisan + qu'elle est REMBOURSABLE :
  // une note de frais ne regroupe que des avances remboursables au salarié (OPE-179).
  // Skip silencieux (cohérent avec l'échec d'ownership) → une note ne contient jamais
  // de dépense non remboursable « visible mais non comptée ». Sûr pour la création en lot.
  const [dep] = await db.select({ remboursable: depenses.remboursable }).from(depenses)
    .where(and(eq(depenses.id, depenseId), eq(depenses.artisan_id, artisanId))).limit(1);
  if (!dep) return;
  if (!dep.remboursable) return;
  // INSERT IGNORE → select-then-insert (dialect-neutre, pas d'ON CONFLICT mysql).
  const [existing] = await db.select({ note_id: notesFraisDepenses.note_id }).from(notesFraisDepenses)
    .where(and(eq(notesFraisDepenses.note_id, noteId), eq(notesFraisDepenses.depense_id, depenseId))).limit(1);
  if (existing) return;
  await db.insert(notesFraisDepenses).values({ note_id: noteId, depense_id: depenseId });
}

export async function removeDepenseFromNoteFrais(noteId: number, depenseId: number, artisanId: number): Promise<void> {
  const db = await getDb();
  // OPE-182 — scoper la suppression du lien à la NOTE de l'artisan (table de liaison
  // sans `artisan_id`) → empêche un retrait cross-tenant d'une dépense de la note d'autrui.
  // On vérifie d'abord l'ownership de la note, puis on supprime le lien.
  const [noteOwn] = await db.select({ id: notesDeFrais.id }).from(notesDeFrais)
    .where(and(eq(notesDeFrais.id, noteId), eq(notesDeFrais.artisan_id, artisanId))).limit(1);
  if (!noteOwn) return;
  await db.delete(notesFraisDepenses)
    .where(and(eq(notesFraisDepenses.note_id, noteId), eq(notesFraisDepenses.depense_id, depenseId)));
}

export async function calculerTotalNoteFrais(noteId: number, artisanId: number): Promise<number> {
  const db = await getDb();
  // OPE-179 — ne somme QUE les dépenses remboursables (avances salarié) : une dépense
  // `remboursable = FALSE` (réglée par l'entreprise) liée à une note ne doit pas gonfler
  // le montant à rembourser. Aligné sur la stat `getDepensesStats` (filtre déjà remboursable).
  const [agg] = await db.select({
    total: sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)`,
  }).from(depenses)
    .innerJoin(notesFraisDepenses, eq(notesFraisDepenses.depense_id, depenses.id))
    .where(and(
      eq(notesFraisDepenses.note_id, noteId),
      eq(depenses.artisan_id, artisanId),
      eq(depenses.remboursable, true),
    ));
  const total = Number(agg?.total || 0);
  await db.update(notesDeFrais).set({ montant_total: String(total) })
    .where(and(eq(notesDeFrais.id, noteId), eq(notesDeFrais.artisan_id, artisanId)));
  return total;
}

// Sous-requête réutilisable : ids des dépenses liées à une note (remplace l'UPDATE..JOIN
// mysql, non supporté en PG). On filtre côté UPDATE par artisan_id en plus, conservant
// le scope tenant d'origine. `db` est passé pour rester dans le même pool/dialecte.
function depenseIdsLieesANote(db: any, noteId: number) {
  return db.select({ id: notesFraisDepenses.depense_id }).from(notesFraisDepenses)
    .where(eq(notesFraisDepenses.note_id, noteId));
}

const todayDate = () => new Date().toISOString().slice(0, 10);

export async function soumettreNoteFrais(id: number, artisanId: number): Promise<any | null> {
  const db = await getDb();
  await calculerTotalNoteFrais(id, artisanId);
  await db.update(notesDeFrais)
    .set({ statut: "soumise" as any, date_soumission: todayDate() })
    .where(and(eq(notesDeFrais.id, id), eq(notesDeFrais.artisan_id, artisanId)));
  // Marquer toutes les depenses associees en 'soumise' (UPDATE..JOIN -> sous-requête).
  await db.update(depenses).set({ statut: "soumise" as any })
    .where(and(eq(depenses.artisan_id, artisanId), inArray(depenses.id, depenseIdsLieesANote(db, id))));
  return getNoteFraisById(id, artisanId);
}

export async function approuverNoteFrais(id: number, artisanId: number, commentaire?: string): Promise<any | null> {
  const db = await getDb();
  await db.update(notesDeFrais)
    .set({ statut: "approuvee" as any, date_approbation: todayDate(), commentaire_approbateur: commentaire || null })
    .where(and(eq(notesDeFrais.id, id), eq(notesDeFrais.artisan_id, artisanId)));
  await db.update(depenses).set({ statut: "approuvee" as any })
    .where(and(eq(depenses.artisan_id, artisanId), inArray(depenses.id, depenseIdsLieesANote(db, id))));
  return getNoteFraisById(id, artisanId);
}

export async function rejeterNoteFrais(id: number, artisanId: number, commentaire: string): Promise<any | null> {
  const db = await getDb();
  await db.update(notesDeFrais)
    .set({ statut: "rejetee" as any, commentaire_approbateur: commentaire })
    .where(and(eq(notesDeFrais.id, id), eq(notesDeFrais.artisan_id, artisanId)));
  await db.update(depenses).set({ statut: "rejetee" as any })
    .where(and(eq(depenses.artisan_id, artisanId), inArray(depenses.id, depenseIdsLieesANote(db, id))));
  return getNoteFraisById(id, artisanId);
}

export async function payerNoteFrais(id: number, artisanId: number): Promise<any | null> {
  const db = await getDb();
  await db.update(notesDeFrais)
    .set({ statut: "payee" as any, date_paiement: todayDate() })
    .where(and(eq(notesDeFrais.id, id), eq(notesDeFrais.artisan_id, artisanId)));
  // OPE-179 — ne marque « remboursée » QUE les dépenses remboursables (cohérent avec le
  // total calculé) : une dépense non remboursable liée à la note n'est pas remboursée au salarié.
  await db.update(depenses)
    .set({ statut: "remboursee" as any, rembourse: true, date_remboursement: todayDate() })
    .where(and(
      eq(depenses.artisan_id, artisanId),
      eq(depenses.remboursable, true),
      inArray(depenses.id, depenseIdsLieesANote(db, id)),
    ));
  return getNoteFraisById(id, artisanId);
}

// === Budgets ===

export async function calculerBudgetsRealises(artisanId: number, mois: string): Promise<any[]> {
  const db = await getDb();
  // Realise du mois par categorie.
  const debutMois = `${mois}-01`;
  const [y, m] = mois.split("-").map(Number);
  const finMois = new Date(y, m, 0).toISOString().slice(0, 10);
  const realises = await db.select({ categorie: depenses.categorie, reel: sql<string>`COALESCE(SUM(${depenses.montant_ttc}), 0)` })
    .from(depenses)
    .where(and(eq(depenses.artisan_id, artisanId), between(depenses.date_depense, debutMois, finMois)))
    .groupBy(depenses.categorie);
  const reelMap = new Map<string, number>();
  for (const r of realises) reelMap.set(r.categorie as string, Number(r.reel));

  const budgets = await db.select({ categorie: budgetsCategories.categorie, budget: budgetsCategories.budget })
    .from(budgetsCategories)
    .where(and(eq(budgetsCategories.artisan_id, artisanId), eq(budgetsCategories.mois, mois)));
  const budgetMap = new Map<string, number>();
  for (const b of budgets) budgetMap.set(b.categorie as string, Number(b.budget));

  const cats = await getCategoriesDepenses(artisanId);
  return cats.map((c: any) => {
    const reel = reelMap.get(c.nom) || 0;
    const budget = budgetMap.get(c.nom) || 0;
    const pct = budget > 0 ? Math.round((reel / budget) * 100) : 0;
    return {
      categorie: c.nom, couleur: c.couleur, icone: c.icone,
      budget, reel, ecart: budget - reel, pct,
    };
  });
}

export async function upsertBudget(
  artisanId: number,
  categorie: string,
  mois: string,
  budget: number
): Promise<void> {
  const db = await getDb();
  // ON DUPLICATE KEY (unique artisan_id+categorie+mois) → select-puis-insert/update (dialect-neutre).
  const existing = await db.select({ id: budgetsCategories.id }).from(budgetsCategories)
    .where(and(eq(budgetsCategories.artisan_id, artisanId), eq(budgetsCategories.categorie, categorie), eq(budgetsCategories.mois, mois)))
    .limit(1);
  if (existing[0]) {
    await db.update(budgetsCategories).set({ budget: String(budget) }).where(eq(budgetsCategories.id, existing[0].id));
  } else {
    await db.insert(budgetsCategories).values({ artisan_id: artisanId, categorie, mois, budget: String(budget) });
  }
}

// === Relevés bancaires ===

export async function importReleve(
  artisanId: number,
  nomFichier: string,
  transactions: Array<{ dateTransaction: string; libelle: string; montant: number; typeTransaction: string }>
): Promise<{ releveId: number; nbImportees: number }> {
  const dbi = await getDb();
  const releveId = await insertReturningId(relevesBancaires, {
    artisan_id: artisanId, nom_fichier: nomFichier,
    nb_transactions: transactions.length, statut: "en_cours",
  });
  if (!releveId) return { releveId: 0, nbImportees: 0 };
  // Règles de catégorisation actives, lues une seule fois (boucle en mémoire).
  let regles: any[] = [];
  try {
    regles = await dbi.select({ motif_libelle: reglesCategorisation.motif_libelle, categorie: reglesCategorisation.categorie })
      .from(reglesCategorisation)
      .where(and(eq(reglesCategorisation.artisan_id, artisanId), eq(reglesCategorisation.actif, true)));
  } catch { /* ok */ }
  let nbImportees = 0;
  for (const t of transactions) {
    // Detection categorie suggeree via regles_categorisation.
    let categorieSuggeree: string | null = null;
    const lib = String(t.libelle || "").toUpperCase();
    for (const r of regles) {
      if (lib.includes(String(r.motif_libelle).toUpperCase())) {
        categorieSuggeree = r.categorie;
        break;
      }
    }
    try {
      await dbi.insert(transactionsBancaires).values({
        artisan_id: artisanId, releve_id: releveId, date_transaction: t.dateTransaction,
        libelle: t.libelle, montant: String(Math.abs(t.montant)),
        type_transaction: t.typeTransaction as any, categorie_suggeree: categorieSuggeree,
      });
      nbImportees++;
    } catch {
      /* ok ligne suivante */
    }
  }
  await dbi.update(relevesBancaires).set({ nb_importees: nbImportees, statut: "termine" as any })
    .where(eq(relevesBancaires.id, releveId));
  return { releveId, nbImportees };
}

export async function getTransactionsBancaires(artisanId: number, releveId?: number): Promise<any[]> {
  const dbi = await getDb();
  const conds: any[] = [eq(transactionsBancaires.artisan_id, artisanId), eq(transactionsBancaires.ignoree, false)];
  if (releveId) conds.push(eq(transactionsBancaires.releve_id, releveId));
  return await dbi.select().from(transactionsBancaires)
    .where(and(...conds))
    .orderBy(desc(transactionsBancaires.date_transaction), desc(transactionsBancaires.id))
    .limit(500);
}

export async function lierTransactionDepense(
  transactionId: number,
  depenseId: number,
  artisanId: number
): Promise<void> {
  const dbi = await getDb();
  await dbi.update(transactionsBancaires).set({ depense_id: depenseId })
    .where(and(eq(transactionsBancaires.id, transactionId), eq(transactionsBancaires.artisan_id, artisanId)));
}

export async function ignorerTransaction(id: number, artisanId: number): Promise<void> {
  const dbi = await getDb();
  await dbi.update(transactionsBancaires).set({ ignoree: true })
    .where(and(eq(transactionsBancaires.id, id), eq(transactionsBancaires.artisan_id, artisanId)));
}

// === Export FEC achats ===

export async function exportDepensesFEC(
  artisanId: number,
  dateDebut: string,
  dateFin: string
): Promise<string> {
  const dbi = await getDb();
  const config = await getConfigurationComptable(artisanId);
  const compteAchats = config?.compteAchats || "607000";
  const compteTVA = config?.compteTVADeductible || "445660";
  const compteFournisseurs = config?.compteFournisseurs || "401000";
  const journal = config?.journalAchats || "AC";

  const rows: any[] = await dbi.select({
    id: depenses.id, numero: depenses.numero, date_depense: depenses.date_depense,
    fournisseur: depenses.fournisseur, montant_ht: depenses.montant_ht,
    montant_tva: depenses.montant_tva, montant_ttc: depenses.montant_ttc, description: depenses.description,
  }).from(depenses)
    .where(and(
      eq(depenses.artisan_id, artisanId),
      between(depenses.date_depense, dateDebut, dateFin),
      eq(depenses.tva_deductible, true),
    ))
    .orderBy(asc(depenses.date_depense), asc(depenses.id));

  const header = [
    "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum",
    "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate",
    "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet",
    "ValidDate", "Montantdevise", "Idevise",
  ].join("\t");
  const lines = [header];
  let num = 1;
  const fec = (val: any) => Number(val || 0).toFixed(2).replace(".", ",");

  for (const d of rows as any[]) {
    const dateF = new Date(d.date_depense).toISOString().slice(0, 10).replace(/-/g, "");
    const lib = `Achat ${d.numero} ${d.fournisseur || ""}`.trim();
    lines.push([journal, "Achats", num, dateF, compteAchats, "Achats", "", "", d.numero, dateF, lib, fec(d.montant_ht), "0,00", "", "", "", "", ""].join("\t"));
    lines.push([journal, "Achats", num, dateF, compteTVA, "TVA deductible", "", "", d.numero, dateF, lib, fec(d.montant_tva), "0,00", "", "", "", "", ""].join("\t"));
    lines.push([journal, "Achats", num, dateF, compteFournisseurs, "Fournisseurs", "", "", d.numero, dateF, lib, "0,00", fec(d.montant_ttc), "", "", "", "", ""].join("\t"));
    num++;
  }
  return lines.join("\n");
}

// ============================================================================
// AI CHAT — threads and messages
// ============================================================================

export async function getOrCreateAiThread(artisanId: number, firstMessage: string): Promise<number> {
  const title = firstMessage.slice(0, 80) + (firstMessage.length > 80 ? '…' : '');
  return await insertReturningId(aiThreads, { artisanId, mode: 'general', title, lastMessageAt: new Date() });
}

export async function getAiThread(threadId: number, artisanId: number): Promise<any> {
  const db = await getDb();
  const [row] = await db.select().from(aiThreads)
    .where(and(eq(aiThreads.id, threadId), eq(aiThreads.artisanId, artisanId))).limit(1);
  return row || null;
}

export async function listAiThreads(artisanId: number, limit = 20): Promise<any[]> {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit) || 20));
  return await db.select().from(aiThreads)
    .where(eq(aiThreads.artisanId, artisanId))
    .orderBy(desc(aiThreads.lastMessageAt)).limit(safeLimit);
}

export async function insertAiMessage(
  threadId: number,
  role: 'user' | 'assistant',
  transcript: string,
  metadata?: any,
  pricingMetadata?: any,
): Promise<void> {
  const db = await getDb();
  await db.insert(aiMessages).values({
    threadId, role, transcript,
    metadata: metadata ?? null,
    pricingMetadata: pricingMetadata ?? null,
  });
  await db.update(aiThreads).set({ lastMessageAt: new Date() }).where(eq(aiThreads.id, threadId));
}

export async function getAiMessages(threadId: number, limit = 50): Promise<any[]> {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit) || 50));
  return await db.select().from(aiMessages)
    .where(eq(aiMessages.threadId, threadId))
    .orderBy(asc(aiMessages.createdAt)).limit(safeLimit);
}
