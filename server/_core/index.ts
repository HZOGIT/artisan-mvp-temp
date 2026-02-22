import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import cookieParser from "cookie-parser";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  console.log('[Server] Starting...');
  console.log('[Database] Checking MySQL connection...');
  console.log('[Database] DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Missing');
  console.log('[Stripe] STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'Set' : 'Missing');
  console.log('[Stripe] STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET ? 'Set' : 'Missing');
  
  try {
    const { getDb, seedTestData } = await import('../db');
    const db = await getDb();
    if (db) {
      console.log('[Database] MySQL connected successfully');
      // Seed test data (one-time, skips if data already exists)
      try { await seedTestData(); } catch (e) { console.error('[Seed] Error:', e); }
      // Migrate parametres_artisan: set default objectif values
      try {
        const { getPool: getMigPool } = await import('../db');
        const migPool = getMigPool();
        if (migPool) {
          const [rows] = await migPool.execute("SELECT id FROM parametres_artisan WHERE (objectifCA IS NULL OR objectifCA = 0) AND (objectifDevis IS NULL OR objectifDevis = 0) LIMIT 1");
          if ((rows as any[]).length > 0) {
            await migPool.execute("UPDATE parametres_artisan SET objectifCA = 10000, objectifDevis = 15, objectifClients = 5 WHERE objectifCA IS NULL OR objectifCA = 0");
            console.log('[Migration] Set default objectif values in parametres_artisan');
          }
        }
      } catch (e) { console.error('[Migration] objectif values error:', e); }
      // Seed demo notifications (one-time)
      try {
        const { getPool } = await import('../db');
        const pool = getPool();
        if (pool) {
          const [existing] = await pool.execute('SELECT COUNT(*) as cnt FROM notifications WHERE artisanId = 1');
          if ((existing as any)[0].cnt === 0) {
            const now = new Date();
            const notifs = [
              { type: 'succes', titre: 'Devis DEV-00026 accepte et signe', message: 'Le client Durand Pierre a accepte et signe le devis DEV-00026', lien: '/devis/26', lu: 0, hours: 2 },
              { type: 'info', titre: 'Nouveau message de Hab Doudi', message: 'Bonjour, je souhaiterais modifier la date de mon intervention...', lien: '/chat', lu: 0, hours: 4 },
              { type: 'rappel', titre: 'Intervention demain : Entretien chauffage M. Durand', message: 'Rappel: Intervention prevue demain a 09:00 chez Pierre Durand', lien: '/interventions', lu: 0, hours: 6 },
              { type: 'alerte', titre: 'Stock bas : Joint torique (5 restants)', message: 'Le stock de Joint torique est descendu sous le seuil d\'alerte', lien: '/stocks', lu: 1, hours: 24 },
              { type: 'rappel', titre: 'Facture FAC-00008 en retard de 35 jours', message: 'La facture FAC-00008 de 360.00 EUR est en retard de paiement', lien: '/factures/8', lu: 1, hours: 48 },
            ];
            for (const n of notifs) {
              const createdAt = new Date(now.getTime() - n.hours * 3600000);
              await pool.execute(
                'INSERT INTO notifications (artisanId, type, titre, message, lien, lu, createdAt) VALUES (1, ?, ?, ?, ?, ?, ?)',
                [n.type, n.titre, n.message, n.lien, n.lu, createdAt]
              );
            }
            console.log('[Seed] 5 demo notifications inserted');
          }
        }
      } catch (e) { console.error('[Seed] Notifications error:', e); }
      // Seed demo RDV en ligne (one-time)
      try {
        const { getPool: getRdvPool } = await import('../db');
        const rdvPool = getRdvPool();
        if (rdvPool) {
          const [existingRdv] = await rdvPool.execute('SELECT COUNT(*) as cnt FROM rdv_en_ligne WHERE artisanId = 1');
          if ((existingRdv as any)[0].cnt === 0) {
            await rdvPool.execute(
              `INSERT INTO rdv_en_ligne (artisanId, clientId, titre, description, dateProposee, dureeEstimee, statut, urgence, createdAt, updatedAt) VALUES
              (1, 2, 'Fuite robinet cuisine', 'Le robinet de la cuisine fuit depuis 2 jours, goutte a goutte permanent. Marque Grohe.', '2026-02-24 10:00:00', 60, 'en_attente', 'normale', NOW(), NOW()),
              (1, 5, 'Panne chauffe-eau', 'Le chauffe-eau ne produit plus d''eau chaude depuis ce matin. Modele Atlantic 200L.', '2026-02-25 14:00:00', 60, 'en_attente', 'urgente', NOW(), NOW())`
            );
            console.log('[Seed] 2 demo RDV en ligne inserted');
          }
        }
      } catch (e) { console.error('[Seed] RDV en ligne error:', e); }
    } else {
      console.error('[Database] MySQL connection failed: getDb returned null');
    }
  } catch (error) {
    console.error('[Database] MySQL connection failed:', error);
  }
  
  const app = express();
  const server = createServer(app);
  
  console.log('=== SERVER SETUP ===');
  
  // TODO: Re-enable CSP with proper Clerk directives
  // Temporarily disabled to allow Clerk to load
  // app.use((req, res, next) => {
  //   res.setHeader(
  //     'Content-Security-Policy',
  //     "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.cheminov.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-src 'self' https://clerk.cheminov.com;"
  //   );
  //   next();
  // });}
  
  // Stripe webhook - MUST be before express.json() for signature verification
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const { handleStripeWebhook } = await import('../stripe/webhookHandler');
      return handleStripeWebhook(req, res);
    } catch (error: any) {
      console.error('[Stripe Webhook] Route error:', error);
      res.status(500).json({ error: 'Webhook route error', detail: error.message });
    }
  });
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  console.log('OK express.json() charge');
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // IMPORTANT: cookie-parser MUST be before routes to parse cookies
  app.use(cookieParser());
  console.log('OK cookieParser() charge');

  // ============================================================
  // API Upload Logo - multipart/form-data with multer
  // ============================================================
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
  app.post('/api/upload-logo', upload.single('logo'), async (req, res) => {
    try {
      const { getUserFromRequest } = await import('./auth-simple');
      const user = await getUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Non authentifié' });

      const file = req.file;
      if (!file) return res.status(400).json({ error: 'Aucun fichier envoyé' });

      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ error: 'Type de fichier non supporté (PNG, JPG, WebP, SVG uniquement)' });
      }

      const base64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

      const { getArtisanByUserId, updateArtisan } = await import('../db');
      const artisan = await getArtisanByUserId(user.id);
      if (!artisan) return res.status(404).json({ error: 'Artisan non trouvé' });

      await updateArtisan(artisan.id, { logo: base64 });
      res.json({ success: true, logoUrl: base64 });
    } catch (error: any) {
      console.error('[Upload Logo] Error:', error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Fichier trop volumineux (max 2MB)' });
      }
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  app.delete('/api/upload-logo', async (req, res) => {
    try {
      const { getUserFromRequest } = await import('./auth-simple');
      const user = await getUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Non authentifié' });

      const { getArtisanByUserId, updateArtisan } = await import('../db');
      const artisan = await getArtisanByUserId(user.id);
      if (!artisan) return res.status(404).json({ error: 'Artisan non trouvé' });

      await updateArtisan(artisan.id, { logo: null });
      res.json({ success: true });
    } catch (error) {
      console.error('[Delete Logo] Error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // ============================================================
  // API Articles - recherche bibliothèque
  // ============================================================
  app.get('/api/articles/search', async (req, res) => {
    try {
      const q = (req.query.q as string || '').trim();
      if (q.length < 2) {
        return res.json([]);
      }
      const metier = req.query.metier as string | undefined;
      const categorie = req.query.categorie as string | undefined;
      const sous_categorie = req.query.sous_categorie as string | undefined;

      const { getDb, getPool } = await import('../db');
      await getDb(); // ensure connection is initialized
      const pool = getPool();
      if (!pool) return res.status(500).json({ error: 'Database unavailable' });

      let query = `
        SELECT id, nom, description, prix_base, unite, metier, categorie, sous_categorie, duree_moyenne_minutes
        FROM bibliotheque_articles
        WHERE visible = 1 AND nom LIKE ?
      `;
      const params: any[] = [`%${q}%`];

      if (metier) { query += ' AND metier = ?'; params.push(metier); }
      if (categorie) { query += ' AND categorie = ?'; params.push(categorie); }
      if (sous_categorie) { query += ' AND sous_categorie = ?'; params.push(sous_categorie); }

      query += ' ORDER BY nom LIMIT 10';

      const [rows] = await pool.execute(query, params);
      res.json(rows);
    } catch (error) {
      console.error('[API] /api/articles/search error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/articles/categories', async (req, res) => {
    try {
      const metier = req.query.metier as string;
      if (!metier) {
        return res.status(400).json({ error: 'Parameter metier is required' });
      }

      const { getDb, getPool } = await import('../db');
      await getDb();
      const pool = getPool();
      if (!pool) return res.status(500).json({ error: 'Database unavailable' });

      const [rows] = await pool.execute(
        `SELECT DISTINCT categorie, sous_categorie FROM bibliotheque_articles WHERE visible = 1 AND metier = ? ORDER BY categorie, sous_categorie`,
        [metier]
      );

      // Group by categorie
      const grouped: Record<string, string[]> = {};
      for (const row of rows as any[]) {
        if (!grouped[row.categorie]) grouped[row.categorie] = [];
        if (!grouped[row.categorie].includes(row.sous_categorie)) {
          grouped[row.categorie].push(row.sous_categorie);
        }
      }

      res.json(grouped);
    } catch (error) {
      console.error('[API] /api/articles/categories error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ============================================================
  // Portail Client — Public PDF download routes
  // ============================================================
  app.get('/api/portail/:token/devis/:id/pdf', async (req, res) => {
    try {
      const { getClientPortalAccessByToken, getDevisById, getLignesDevisByDevisId, getArtisanById, getClientById } = await import('../db');
      const access = await getClientPortalAccessByToken(req.params.token);
      if (!access) return res.status(403).json({ error: 'Accès non autorisé ou expiré' });

      const devisData = await getDevisById(parseInt(req.params.id));
      if (!devisData || devisData.clientId !== access.clientId) return res.status(404).json({ error: 'Devis non trouvé' });

      const lignes = await getLignesDevisByDevisId(devisData.id);
      const artisan = await getArtisanById(access.artisanId);
      const client = await getClientById(access.clientId);
      if (!artisan || !client) return res.status(404).json({ error: 'Données introuvables' });

      const { generateDevisPDF } = await import('./pdfGenerator');
      const pdfBuffer = generateDevisPDF({ devis: { ...devisData, lignes }, artisan, client });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Devis_${devisData.numero}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('[Portail] PDF devis error:', error);
      res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
    }
  });

  app.get('/api/portail/:token/factures/:id/pdf', async (req, res) => {
    try {
      const { getClientPortalAccessByToken, getFactureById, getLignesFacturesByFactureId, getArtisanById, getClientById } = await import('../db');
      const access = await getClientPortalAccessByToken(req.params.token);
      if (!access) return res.status(403).json({ error: 'Accès non autorisé ou expiré' });

      const facture = await getFactureById(parseInt(req.params.id));
      if (!facture || facture.clientId !== access.clientId) return res.status(404).json({ error: 'Facture non trouvée' });

      const lignes = await getLignesFacturesByFactureId(facture.id);
      const artisan = await getArtisanById(access.artisanId);
      const client = await getClientById(access.clientId);
      if (!artisan || !client) return res.status(404).json({ error: 'Données introuvables' });

      const { generateFacturePDF } = await import('./pdfGenerator');
      const pdfBuffer = generateFacturePDF({ facture: { ...facture, lignes }, artisan, client });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Facture_${facture.numero}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('[Portail] PDF facture error:', error);
      res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
    }
  });

  // Contrat PDF (authenticated via cookie)
  app.get('/api/contrats/:id/pdf', async (req, res) => {
    try {
      const { getContratById, getArtisanByUserId, getClientById } = await import('../db');
      const { generateContratPDF } = await import('./pdfGenerator');
      const { jwtVerify } = await import('jose');

      // Verify JWT from cookie
      const token = req.cookies?.token;
      if (!token) { res.status(401).json({ error: 'Non authentifié' }); return; }
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret');
      let payload: any;
      try { payload = (await jwtVerify(token, secret)).payload; } catch { res.status(401).json({ error: 'Token invalide' }); return; }

      const contrat = await getContratById(parseInt(req.params.id));
      if (!contrat) { res.status(404).json({ error: 'Contrat non trouvé' }); return; }

      const artisan = await getArtisanByUserId(payload.userId);
      if (!artisan || contrat.artisanId !== artisan.id) { res.status(403).json({ error: 'Accès non autorisé' }); return; }

      const client = await getClientById(contrat.clientId);
      if (!client) { res.status(404).json({ error: 'Client non trouvé' }); return; }

      const pdfBuffer = generateContratPDF({ contrat, artisan, client });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${contrat.reference}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('[Contrat] PDF error:', error);
      res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
    }
  });

  // Bon de commande PDF (authenticated via cookie)
  app.get('/api/commandes-fournisseurs/:id/pdf', async (req, res) => {
    try {
      const { getCommandeFournisseurById, getArtisanByUserId, getFournisseurById, getLignesCommandeFournisseur } = await import('../db');
      const { generateBonCommandePDF } = await import('./pdfGenerator');
      const { jwtVerify } = await import('jose');

      const token = req.cookies?.token;
      if (!token) { res.status(401).json({ error: 'Non authentifié' }); return; }
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret');
      let payload: any;
      try { payload = (await jwtVerify(token, secret)).payload; } catch { res.status(401).json({ error: 'Token invalide' }); return; }

      const commande = await getCommandeFournisseurById(parseInt(req.params.id));
      if (!commande) { res.status(404).json({ error: 'Commande non trouvée' }); return; }

      const artisan = await getArtisanByUserId(payload.userId);
      if (!artisan || commande.artisanId !== artisan.id) { res.status(403).json({ error: 'Accès non autorisé' }); return; }

      const fournisseur = await getFournisseurById(commande.fournisseurId);
      if (!fournisseur) { res.status(404).json({ error: 'Fournisseur non trouvé' }); return; }

      const lignes = await getLignesCommandeFournisseur(commande.id);
      const pdfBuffer = generateBonCommandePDF({ commande: { ...commande, lignes }, artisan, fournisseur });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="BonCommande_${commande.numero || commande.id}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('[BonCommande] PDF error:', error);
      res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
    }
  });

  // ============================================================================
  // COMPTABILITE EXPORTS (FEC + CSV)
  // ============================================================================

  // Helper: authenticate via JWT cookie
  async function authFromCookie(req: any, res: any): Promise<any | null> {
    const { getArtisanByUserId } = await import('../db');
    const { jwtVerify } = await import('jose');
    const token = req.cookies?.token;
    if (!token) { res.status(401).json({ error: 'Non authentifié' }); return null; }
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret');
    let payload: any;
    try { payload = (await jwtVerify(token, secret)).payload; } catch { res.status(401).json({ error: 'Token invalide' }); return null; }
    const artisan = await getArtisanByUserId(payload.userId);
    if (!artisan) { res.status(404).json({ error: 'Artisan non trouvé' }); return null; }
    return artisan;
  }

  // Helper: format number with comma for FEC (French decimal format)
  function fecAmount(val: string | number | null): string {
    const num = typeof val === 'string' ? parseFloat(val) : (val || 0);
    return num.toFixed(2).replace('.', ',');
  }

  // Helper: format date as YYYYMMDD for FEC
  function fecDate(d: Date | string): string {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  // GET /api/comptabilite/fec - Generate FEC file
  app.get('/api/comptabilite/fec', async (req, res) => {
    try {
      const artisan = await authFromCookie(req, res);
      if (!artisan) return;

      const { getFacturesByArtisanId, getClientById } = await import('../db');
      const dateDebut = req.query.dateDebut ? new Date(req.query.dateDebut as string) : new Date(new Date().getFullYear(), 0, 1);
      const dateFin = req.query.dateFin ? new Date(req.query.dateFin as string) : new Date();
      dateFin.setHours(23, 59, 59, 999);

      const allFactures = await getFacturesByArtisanId(artisan.id);
      const factures = allFactures.filter(f => {
        const d = new Date(f.dateFacture);
        return d >= dateDebut && d <= dateFin && f.statut !== 'brouillon' && f.statut !== 'annulee';
      });

      // FEC header
      const header = 'JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise';
      const lines: string[] = [header];

      let ecritureNum = 1;
      for (const facture of factures) {
        const client = await getClientById(facture.clientId);
        const clientNom = client?.nom || 'Client';
        const clientNum = `C${String(facture.clientId).padStart(5, '0')}`;
        const ecritureDate = fecDate(facture.dateFacture);
        const pieceRef = facture.numero;
        const ecritureLib = `Facture ${facture.numero} - ${clientNom}`;
        const ttc = parseFloat(facture.totalTTC?.toString() || '0');
        const ht = parseFloat(facture.totalHT?.toString() || '0');
        const tva = parseFloat(facture.totalTVA?.toString() || '0');
        const validDate = fecDate(facture.dateFacture);
        const num = String(ecritureNum).padStart(6, '0');

        // Ligne 1: Débit 411000 (Clients) TTC
        lines.push(`VE|Journal des ventes|${num}|${ecritureDate}|411000|Clients|${clientNum}|${clientNom}|${pieceRef}|${ecritureDate}|${ecritureLib}|${fecAmount(ttc)}|${fecAmount(0)}||||EUR`);
        // Ligne 2: Crédit 701000 (Ventes) HT
        lines.push(`VE|Journal des ventes|${num}|${ecritureDate}|701000|Ventes de produits finis||${clientNom}|${pieceRef}|${ecritureDate}|${ecritureLib}|${fecAmount(0)}|${fecAmount(ht)}||||EUR`);
        // Ligne 3: Crédit 445710 (TVA collectée) TVA
        if (tva > 0) {
          lines.push(`VE|Journal des ventes|${num}|${ecritureDate}|445710|TVA collectée|||${pieceRef}|${ecritureDate}|${ecritureLib}|${fecAmount(0)}|${fecAmount(tva)}||||EUR`);
        }
        ecritureNum++;
      }

      const content = lines.join('\n');
      const siret = (artisan.siret || '00000000000000').replace(/\s/g, '');
      const filename = `${siret}FEC${fecDate(dateFin)}.txt`;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      console.error('[Compta] FEC error:', error);
      res.status(500).json({ error: 'Erreur lors de la génération du FEC' });
    }
  });

  // GET /api/comptabilite/export-csv - Export factures as CSV
  app.get('/api/comptabilite/export-csv', async (req, res) => {
    try {
      const artisan = await authFromCookie(req, res);
      if (!artisan) return;

      const { getFacturesByArtisanId, getClientById } = await import('../db');
      const dateDebut = req.query.dateDebut ? new Date(req.query.dateDebut as string) : new Date(new Date().getFullYear(), 0, 1);
      const dateFin = req.query.dateFin ? new Date(req.query.dateFin as string) : new Date();
      dateFin.setHours(23, 59, 59, 999);

      const allFactures = await getFacturesByArtisanId(artisan.id);
      const factures = allFactures.filter(f => {
        const d = new Date(f.dateFacture);
        return d >= dateDebut && d <= dateFin;
      });

      const csvHeader = 'Date;Numéro;Client;HT;TVA;TTC;Statut';
      const csvLines: string[] = [csvHeader];

      for (const f of factures) {
        const client = await getClientById(f.clientId);
        const date = new Date(f.dateFacture).toLocaleDateString('fr-FR');
        csvLines.push(`${date};${f.numero};${client?.nom || 'Client'};${fecAmount(f.totalHT)};${fecAmount(f.totalTVA)};${fecAmount(f.totalTTC)};${f.statut}`);
      }

      const content = '\ufeff' + csvLines.join('\n'); // BOM for Excel
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="factures_${fecDate(dateDebut)}_${fecDate(dateFin)}.csv"`);
      res.send(content);
    } catch (error) {
      console.error('[Compta] CSV error:', error);
      res.status(500).json({ error: 'Erreur lors de l\'export CSV' });
    }
  });

  // ============================================================================
  // FACTUR-X (electronic invoicing) + PDF batch export
  // ============================================================================

  // GET /api/comptabilite/facturx/:factureId — Download PDF of a single invoice
  app.get('/api/comptabilite/facturx/:factureId', async (req, res) => {
    try {
      const artisan = await authFromCookie(req, res);
      if (!artisan) return;

      const { getFactureById, getLignesFacturesByFactureId, getClientById } = await import('../db');
      const facture = await getFactureById(parseInt(req.params.factureId));
      if (!facture || facture.artisanId !== artisan.id) {
        return res.status(404).json({ error: 'Facture non trouvée' });
      }

      const lignes = await getLignesFacturesByFactureId(facture.id);
      const client = await getClientById(facture.clientId);
      if (!client) return res.status(404).json({ error: 'Client introuvable' });

      const { generateFacturePDF } = await import('./pdfGenerator');
      const pdfBuffer = generateFacturePDF({ facture: { ...facture, lignes }, artisan, client });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Facture_${facture.numero}_FacturX.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('[FacturX] PDF error:', error);
      res.status(500).json({ error: 'Erreur lors de la génération Factur-X' });
    }
  });

  // GET /api/comptabilite/facturx-xml/:factureId — Download raw Factur-X XML
  app.get('/api/comptabilite/facturx-xml/:factureId', async (req, res) => {
    try {
      const artisan = await authFromCookie(req, res);
      if (!artisan) return;

      const { getFactureById, getLignesFacturesByFactureId, getClientById } = await import('../db');
      const facture = await getFactureById(parseInt(req.params.factureId));
      if (!facture || facture.artisanId !== artisan.id) {
        return res.status(404).json({ error: 'Facture non trouvée' });
      }

      const lignes = await getLignesFacturesByFactureId(facture.id);
      const client = await getClientById(facture.clientId);
      if (!client) return res.status(404).json({ error: 'Client introuvable' });

      const { generateFacturXML } = await import('./facturx');
      const xml = generateFacturXML({ ...facture, lignes }, artisan, client);

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="FacturX_${facture.numero}.xml"`);
      res.send(xml);
    } catch (error) {
      console.error('[FacturX] XML error:', error);
      res.status(500).json({ error: 'Erreur lors de la génération du XML Factur-X' });
    }
  });

  // GET /api/comptabilite/export-facturx-lot — ZIP of all Factur-X XMLs for a period
  app.get('/api/comptabilite/export-facturx-lot', async (req, res) => {
    try {
      const artisan = await authFromCookie(req, res);
      if (!artisan) return;

      const { getFacturesByArtisanId, getClientById, getLignesFacturesByFactureId } = await import('../db');
      const { generateFacturXML } = await import('./facturx');
      const archiver = (await import('archiver')).default;

      const dateDebut = req.query.dateDebut ? new Date(req.query.dateDebut as string) : new Date(new Date().getFullYear(), 0, 1);
      const dateFin = req.query.dateFin ? new Date(req.query.dateFin as string) : new Date();
      dateFin.setHours(23, 59, 59, 999);

      const allFactures = await getFacturesByArtisanId(artisan.id);
      const factures = allFactures.filter(f => {
        const d = new Date(f.dateFacture);
        return d >= dateDebut && d <= dateFin && f.statut !== 'brouillon' && f.statut !== 'annulee';
      });

      if (factures.length === 0) {
        return res.status(404).json({ error: 'Aucune facture sur cette période' });
      }

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="FacturX_${fecDate(dateDebut)}_${fecDate(dateFin)}.zip"`);

      const archive = archiver('zip', { zlib: { level: 5 } });
      archive.pipe(res);

      for (const facture of factures) {
        const lignes = await getLignesFacturesByFactureId(facture.id);
        const client = await getClientById(facture.clientId);
        if (!client) continue;
        const xml = generateFacturXML({ ...facture, lignes }, artisan, client);
        const clientNom = (client.nom || 'Client').replace(/[^a-zA-Z0-9À-ÿ_-]/g, '_');
        archive.append(xml, { name: `${facture.numero}_${clientNom}.xml` });
      }

      await archive.finalize();
    } catch (error) {
      console.error('[FacturX] Lot export error:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Erreur lors de l\'export Factur-X en lot' });
    }
  });

  // GET /api/comptabilite/export-pdf-lot — ZIP of all invoice PDFs for a period
  app.get('/api/comptabilite/export-pdf-lot', async (req, res) => {
    try {
      const artisan = await authFromCookie(req, res);
      if (!artisan) return;

      const { getFacturesByArtisanId, getClientById, getLignesFacturesByFactureId } = await import('../db');
      const { generateFacturePDF } = await import('./pdfGenerator');
      const archiver = (await import('archiver')).default;

      const dateDebut = req.query.dateDebut ? new Date(req.query.dateDebut as string) : new Date(new Date().getFullYear(), 0, 1);
      const dateFin = req.query.dateFin ? new Date(req.query.dateFin as string) : new Date();
      dateFin.setHours(23, 59, 59, 999);

      const allFactures = await getFacturesByArtisanId(artisan.id);
      const factures = allFactures.filter(f => {
        const d = new Date(f.dateFacture);
        return d >= dateDebut && d <= dateFin && f.statut !== 'brouillon' && f.statut !== 'annulee';
      });

      if (factures.length === 0) {
        return res.status(404).json({ error: 'Aucune facture sur cette période' });
      }

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="Factures_PDF_${fecDate(dateDebut)}_${fecDate(dateFin)}.zip"`);

      const archive = archiver('zip', { zlib: { level: 5 } });
      archive.pipe(res);

      for (const facture of factures) {
        const lignes = await getLignesFacturesByFactureId(facture.id);
        const client = await getClientById(facture.clientId);
        if (!client) continue;
        const pdfBuffer = generateFacturePDF({ facture: { ...facture, lignes }, artisan, client });
        const clientNom = (client.nom || 'Client').replace(/[^a-zA-Z0-9À-ÿ_-]/g, '_');
        archive.append(pdfBuffer, { name: `${facture.numero}_${clientNom}.pdf` });
      }

      await archive.finalize();
    } catch (error) {
      console.error('[Compta] PDF lot error:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Erreur lors de l\'export PDF en lot' });
    }
  });

  // ============================================================================
  // PAIEMENT STRIPE — Portail client
  // ============================================================================


  // POST /api/paiement/create-checkout-session
  app.post('/api/paiement/create-checkout-session', async (req, res) => {
    try {
      const { factureId, token } = req.body;
      if (!factureId || !token) {
        return res.status(400).json({ error: 'factureId et token requis' });
      }

      const { getClientPortalAccessByToken, getFactureById, getClientById, getArtisanById, createPaiementStripe } = await import('../db');
      const access = await getClientPortalAccessByToken(token);
      if (!access) {
        return res.status(403).json({ error: 'Accès portail non autorisé ou expiré' });
      }

      const facture = await getFactureById(factureId);
      if (!facture || facture.clientId !== access.clientId) {
        return res.status(404).json({ error: 'Facture non trouvée' });
      }

      if (facture.statut === 'payee') {
        return res.status(400).json({ error: 'Cette facture est déjà payée' });
      }

      const client = await getClientById(access.clientId);
      const artisan = await getArtisanById(access.artisanId);
      if (!client || !artisan) {
        return res.status(404).json({ error: 'Données introuvables' });
      }

      const { nanoid } = await import('nanoid');
      const tokenPaiement = nanoid(32);

      const { createCheckoutSession } = await import('../stripe/stripeService');
      // Use X-Forwarded-Proto for correct protocol behind Railway proxy
      const proto = req.get('x-forwarded-proto') || req.protocol;
      const origin = `${proto}://${req.get('host')}`;
      console.log('[Paiement] origin:', origin, '| factureId:', factureId, '| montantTTC:', facture.totalTTC);

      const result = await createCheckoutSession({
        factureId: facture.id,
        numeroFacture: facture.numero,
        montantTTC: parseFloat(facture.totalTTC?.toString() || '0'),
        clientEmail: client.email || '',
        clientName: `${client.prenom || ''} ${client.nom}`.trim(),
        artisanName: artisan.nomEntreprise || 'Artisan',
        artisanId: artisan.id,
        userId: access.clientId,
        origin,
        tokenPaiement,
        portalToken: token,
      });

      // Enregistrer le paiement dans la base
      await createPaiementStripe({
        factureId: facture.id,
        artisanId: artisan.id,
        stripeSessionId: result.sessionId,
        montant: facture.totalTTC || '0',
        statut: 'en_attente',
        lienPaiement: result.url,
        tokenPaiement,
      });

      res.json({ url: result.url, sessionId: result.sessionId });
    } catch (error: any) {
      console.error('[Paiement] FULL ERROR:', JSON.stringify({
        message: error?.message,
        type: error?.type,
        code: error?.code,
        statusCode: error?.statusCode,
        raw: error?.raw?.message,
        stack: error?.stack?.split('\n').slice(0, 5),
      }));
      const detail = error?.message?.includes('STRIPE_SECRET_KEY is not configured')
        ? 'Clé Stripe non configurée. Ajoutez STRIPE_SECRET_KEY dans les variables d\'environnement Railway.'
        : error?.type === 'StripeAuthenticationError'
        ? 'Clé Stripe invalide ou manquante'
        : error?.message || 'Erreur inconnue';
      res.status(500).json({ error: 'Erreur lors de la création de la session de paiement', detail });
    }
  });

  // GET /api/paiement/status/:factureId?token=XXX
  app.get('/api/paiement/status/:factureId', async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) {
        return res.status(400).json({ error: 'Token requis' });
      }

      const { getClientPortalAccessByToken, getFactureById, getPaiementsByFactureId } = await import('../db');
      const access = await getClientPortalAccessByToken(token);
      if (!access) {
        return res.status(403).json({ error: 'Accès portail non autorisé ou expiré' });
      }

      const factureId = parseInt(req.params.factureId);
      const facture = await getFactureById(factureId);
      if (!facture || facture.clientId !== access.clientId) {
        return res.status(404).json({ error: 'Facture non trouvée' });
      }

      const paiements = await getPaiementsByFactureId(factureId);
      const dernierPaiement = paiements.length > 0 ? paiements[paiements.length - 1] : null;

      res.json({
        factureId,
        statutFacture: facture.statut,
        montantTTC: facture.totalTTC,
        montantPaye: facture.montantPaye,
        datePaiement: facture.datePaiement,
        modePaiement: (facture as any).modePaiement || null,
        dernierPaiement: dernierPaiement ? {
          statut: dernierPaiement.statut,
          paidAt: dernierPaiement.paidAt,
        } : null,
      });
    } catch (error: any) {
      console.error('[Paiement] Status error:', error);
      res.status(500).json({ error: 'Erreur lors de la vérification du statut' });
    }
  });

  // SSE streaming endpoint for AI assistant
  app.post('/api/assistant/stream', async (req, res) => {
    try {
      const { getUserFromRequest } = await import('./auth-simple');
      const user = await getUserFromRequest(req);
      if (!user) { res.status(401).json({ error: 'Non autorisé' }); return; }

      const { getArtisanByUserId, getDashboardStats, getClientsByArtisanId, getDevisNonSignes, getInterventionsByArtisanId, getLowStockItems, getContratsByArtisanId, getArtisanById } = await import('../db');
      const artisan = await getArtisanByUserId(user.id);
      if (!artisan) { res.status(404).json({ error: 'Artisan non trouvé' }); return; }

      const { message, history } = req.body;
      if (!message) { res.status(400).json({ error: 'Message requis' }); return; }

      // Build system prompt
      const stats = await getDashboardStats(artisan.id);
      const clientsList = await getClientsByArtisanId(artisan.id);
      const recentClients = clientsList.slice(0, 5).map((c: any) => `${c.prenom || ''} ${c.nom}`.trim()).join(', ');
      const devisNonSignes = await getDevisNonSignes(artisan.id);
      const interventionsList = await getInterventionsByArtisanId(artisan.id);
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 86400000);
      const interventionsSemaine = interventionsList.filter((i: any) => { const d = new Date(i.dateDebut); return d >= now && d <= weekFromNow && i.statut === 'planifiee'; });
      const stocksBas = await getLowStockItems(artisan.id);
      const contrats = await getContratsByArtisanId(artisan.id);
      const contratsARenouveler = contrats.filter((c: any) => c.dateFin && new Date(c.dateFin) <= weekFromNow && c.statut === 'actif');
      const artisanFull = await getArtisanById(artisan.id);

      const systemPrompt = `Tu es MonAssistant, l'assistant IA de MonArtisan Pro. Tu aides l'artisan ${artisanFull?.nomEntreprise || 'Artisan'} (${artisanFull?.metier || 'artisan'}) dans sa gestion quotidienne.\n\nTu as accès aux données suivantes :\n- ${stats.devisEnCours} devis en attente de réponse\n- ${stats.facturesImpayees.count} factures impayées pour un total de ${stats.facturesImpayees.total.toFixed(2)} euros\n- CA du mois : ${stats.caMonth.toFixed(2)} euros\n- CA de l'année : ${stats.caYear.toFixed(2)} euros\n- ${interventionsSemaine.length} interventions cette semaine\n- ${stocksBas.length} articles en stock bas\n- ${devisNonSignes.length} devis envoyés en attente de signature\n- ${contratsARenouveler.length} contrats à renouveler prochainement\n- ${stats.totalClients} clients au total\n- Clients récents : ${recentClients || 'aucun'}\n- SIRET : ${artisanFull?.siret || 'non renseigné'}\n\nRéponds toujours en français, de manière concise et professionnelle. Utilise le tutoiement.\nUtilise le markdown pour formater tes réponses.`;

      // Build messages array with history
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      if (Array.isArray(history)) {
        for (const h of history.slice(-10)) {
          messages.push({ role: h.role, content: h.content });
        }
      }
      messages.push({ role: 'user', content: message });

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic();
      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        temperature: 0.7,
        system: systemPrompt,
        messages,
      });

      stream.on('text', (text) => {
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      });

      stream.on('end', () => {
        res.write('data: [DONE]\n\n');
        res.end();
      });

      stream.on('error', (error) => {
        console.error('[Assistant] Stream error:', error);
        res.write(`data: ${JSON.stringify({ error: 'Erreur de génération' })}\n\n`);
        res.end();
      });

      req.on('close', () => {
        stream.abort();
      });
    } catch (error) {
      console.error('[Assistant] Error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erreur serveur' });
      }
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
