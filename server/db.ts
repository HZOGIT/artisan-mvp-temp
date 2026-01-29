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
  paiementsStripe, InsertPaiementStripe, PaiementStripe
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
    // Créer le pool de connexion
    _pool = mysql.createPool({
      host: ENV.DATABASE_HOST,
      user: ENV.DATABASE_USER,
      password: ENV.DATABASE_PASSWORD,
      database: ENV.DATABASE_NAME,
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
