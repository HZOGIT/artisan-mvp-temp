import { eq, and, desc, like, or, sql, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
  relancesDevis, InsertRelanceDevis, RelanceDevis
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
  return await db.select().from(clients).where(
    and(
      eq(clients.artisanId, artisanId),
      or(
        like(clients.nom, `%${query}%`),
        like(clients.prenom, `%${query}%`),
        like(clients.email, `%${query}%`),
        like(clients.telephone, `%${query}%`)
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
  
  if (metier) {
    return await db.select().from(bibliothequeArticles).where(
      and(
        eq(bibliothequeArticles.metier, metier as any),
        or(
          like(bibliothequeArticles.designation, `%${query}%`),
          like(bibliothequeArticles.reference, `%${query}%`)
        )
      )
    ).orderBy(bibliothequeArticles.designation).limit(50);
  }
  
  return await db.select().from(bibliothequeArticles).where(
    or(
      like(bibliothequeArticles.designation, `%${query}%`),
      like(bibliothequeArticles.reference, `%${query}%`)
    )
  ).orderBy(bibliothequeArticles.designation).limit(50);
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
      sql`${stocks.quantiteEnStock} <= ${stocks.seuilAlerte}`
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

export interface CommandeFournisseur {
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

export async function getRapportCommandeFournisseur(artisanId: number): Promise<CommandeFournisseur[]> {
  const stocksEnRupture = await getStocksEnRupture(artisanId);
  
  // Regrouper par fournisseur
  const parFournisseur = new Map<number | null, CommandeFournisseur>();
  
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
  
  // Récupérer les devis envoyés mais non signés
  const devisEnvoyesResult = await db.select().from(devis).where(
    and(
      eq(devis.artisanId, artisanId),
      eq(devis.statut, "envoye"),
      sql`${devis.dateDevis} <= ${dateLimit.toISOString().split('T')[0]}`
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
