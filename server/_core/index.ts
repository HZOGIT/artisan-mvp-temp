import "dotenv/config";
import express from "express";
import compression from "compression";
import { createServer } from "http";
import net from "net";
import cookieParser from "cookie-parser";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter, checkRateLimit } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

// JWT_SECRET requis pour la signature des cookies de session. Throw au boot
// si manquant pour eviter qu'on signe avec un secret par defaut en prod.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET manquant ! Definir la variable d'environnement (min 32 caracteres).");
}

// OPE-82 — Filet de dernier recours au niveau process. Sans ces handlers, une
// rejection non gerée ou un evenement 'error' non ecoute (ex. pool MySQL sur
// coupure DB) termine le process (Node 22) → crash de toute l'instance
// multi-tenant. On loggue et on NE quitte PAS (la coupure DB est transitoire ;
// le pool se reconnecte) pour eviter les crash-loops.
process.on("unhandledRejection", (reason: unknown) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err: Error) => {
  console.error("[uncaughtException]", err?.stack || err?.message || err);
});

// OPE-24 — rate-limit en mémoire pour l'endpoint public /api/voice/debug
// (crash-reporting via sendBeacon). Borne le flood de logs par IP.
const voiceDebugHits = new Map<string, { count: number; resetAt: number }>();

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
              `INSERT INTO rdv_en_ligne (artisanId, clientId, titre, description, dateProposee, dureeEstimee, statut_rdv, urgence_rdv, createdAt, updatedAt) VALUES
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

  // ─────────────────────────────────────────────────────────────────
  // Compression HTTP gzip. Applique TRES TOT dans la chaine pour que
  // toutes les reponses (JSON tRPC, HTML statique, JS chunks) en
  // beneficient. threshold 1024 octets = pas la peine pour les petites
  // reponses (overhead > gain). level 6 = bon compromis CPU/ratio.
  // x-no-compression header → bypass (utile pour debug Railway).
  // ─────────────────────────────────────────────────────────────────
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
    level: 6,
    threshold: 1024,
  }));
  
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

  // ─────────────────────────────────────────────────────────────────
  // Headers de securite HTTP. Applique a TOUTES les reponses.
  // - X-Frame-Options DENY : interdit l'inclusion d'Operioz dans un iframe
  //   (anti clickjacking).
  // - X-Content-Type-Options nosniff : interdit au navigateur de deviner
  //   le type MIME (anti XSS via fichiers uploades).
  // - Strict-Transport-Security : force HTTPS pendant 1 an, inclus
  //   sous-domaines.
  // - Referrer-Policy : ne pas leak de path complet en cross-origin.
  // - Permissions-Policy : restreint l'acces aux APIs sensibles. Camera off,
  //   micro et geoloc autorises uniquement pour notre origin (MonAssistant
  //   vocal + page Geolocalisation).
  // ─────────────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(self)');
    next();
  });

  // ─────────────────────────────────────────────────────────────────
  // Rate limit sur l'authentification : max 5 tentatives / 15min / IP.
  // S'applique aux routes tRPC auth.signin et auth.signup.
  // Implementation Map en memoire — single instance Railway hobby, suffisant.
  // ─────────────────────────────────────────────────────────────────
  const authAttempts = new Map<string, { count: number; resetAt: number }>();
  const AUTH_MAX = 5;
  const AUTH_WINDOW_MS = 15 * 60 * 1000;
  app.use('/api/trpc', (req, res, next) => {
    // Cible uniquement les mutations auth.signin / auth.signup.
    const path = req.path || '';
    const isAuth = path.includes('auth.signin') || path.includes('auth.signup');
    if (!isAuth) return next();
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      || req.socket.remoteAddress
      || 'unknown';
    const now = Date.now();
    let entry = authAttempts.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + AUTH_WINDOW_MS };
      authAttempts.set(ip, entry);
      return next();
    }
    entry.count++;
    if (entry.count > AUTH_MAX) {
      const retryAfterS = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterS);
      return res.status(429).json({
        error: { message: 'Trop de tentatives. Réessayez dans 15 minutes.', code: 'TOO_MANY_REQUESTS' },
      });
    }
    next();
  });
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
      console.log(`[Upload Logo] user=${user.id} mime=${file.mimetype} bytes=${file.size} b64chars=${base64.length}`);

      const { getArtisanByUserId, updateArtisan } = await import('../db');
      const artisan = await getArtisanByUserId(user.id);
      if (!artisan) return res.status(404).json({ error: 'Artisan non trouvé' });

      await updateArtisan(artisan.id, { logo: base64 });
      res.json({ success: true, logoUrl: base64 });
    } catch (error: any) {
      // Détail loggué côté serveur (debug) — JAMAIS renvoyé au client (fuite de
      // sqlMessage/schéma interne). On mappe les cas connus vers un message convivial.
      console.error('[Upload Logo] Error:', {
        message: error?.message,
        code: error?.code,
        sqlState: error?.sqlState,
        sqlMessage: error?.sqlMessage,
      });
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Fichier trop volumineux (max 2MB)' });
      }
      if (error.code === 'ER_DATA_TOO_LONG') {
        return res.status(400).json({ error: 'Image trop volumineuse après encodage. Réduisez la taille ou la résolution du logo.' });
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
  // Fonts Roboto exposees pour la generation PDF cote client (guide
  // utilisateur). Permet a jsPDF dans le browser de fetch la police et
  // d'afficher les accents francais correctement (l'alternative serait
  // d'inliner 1+ MB de base64 dans le bundle client, indesirable).
  // ============================================================
  app.get('/api/fonts/:name', async (req, res) => {
    const name = String(req.params.name || '').toLowerCase();
    try {
      const { ROBOTO_REGULAR, ROBOTO_BOLD } = await import('./fonts');
      let b64: string | null = null;
      if (name === 'roboto-regular.ttf') b64 = ROBOTO_REGULAR;
      else if (name === 'roboto-bold.ttf') b64 = ROBOTO_BOLD;
      if (!b64) {
        res.status(404).json({ error: 'font_not_found' });
        return;
      }
      const buf = Buffer.from(b64, 'base64');
      res.setHeader('Content-Type', 'font/ttf');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Length', String(buf.length));
      res.send(buf);
    } catch (e: any) {
      res.status(500).json({ error: 'font_load_failed', message: e?.message });
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

      // COLLATE utf8mb4_general_ci : insensible aux accents et a la casse.
      // Recherche elargie au-dela du nom : description et categorie.
      let query = `
        SELECT id, nom, description, prix_base, unite, metier, categorie, sous_categorie, duree_moyenne_minutes
        FROM bibliotheque_articles
        WHERE visible = 1
          AND (nom COLLATE utf8mb4_general_ci LIKE ?
               OR description COLLATE utf8mb4_general_ci LIKE ?
               OR categorie COLLATE utf8mb4_general_ci LIKE ?)
      `;
      const params: any[] = [`%${q}%`, `%${q}%`, `%${q}%`];

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
      const secret = new TextEncoder().encode(JWT_SECRET);
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
      const secret = new TextEncoder().encode(JWT_SECRET);
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
    const secret = new TextEncoder().encode(JWT_SECRET);
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

      const { getArtisanByUserId, getOrCreateAiThread, insertAiMessage } = await import('../db');
      const artisan = await getArtisanByUserId(user.id);
      if (!artisan) { res.status(404).json({ error: 'Artisan non trouvé' }); return; }

      // Rate-limit IA partagé (OPE-24) : borne le burn Gemini par tenant. Chaque
      // requête peut déclencher jusqu'à MAX_TURNS appels Gemini -> 429 avant tout stream.
      if (!checkRateLimit(artisan.id)) {
        res.status(429).json({ error: 'Trop de requêtes. Réessayez dans quelques minutes.' });
        return;
      }

      const { message, history, pageContext, threadId: clientThreadId } = req.body;
      if (!message) { res.status(400).json({ error: 'Message requis' }); return; }

      const { buildSystemPrompt } = await import('./assistantContext');
      const systemPrompt = await buildSystemPrompt(artisan.id, {
        pageContext: typeof pageContext === 'string' ? pageContext : undefined,
      });

      // Build Gemini contents array from history
      const contents: any[] = [];
      if (Array.isArray(history)) {
        for (const h of history.slice(-10)) {
          if (h?.role && h?.content) {
            contents.push({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: String(h.content) }],
            });
          }
        }
      }
      contents.push({ role: 'user', parts: [{ text: message }] });

      // SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const { GoogleGenAI } = await import('@google/genai');
      const { AGENT_TOOLS, executeTool, TOOL_INVALIDATIONS } = await import('./assistantTools');

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

      let aborted = false;
      req.on('close', () => { aborted = true; });

      // Create/get thread for persistence
      let threadId: number = clientThreadId || 0;
      if (!threadId) {
        try { threadId = await getOrCreateAiThread(artisan.id, message); } catch { threadId = 0; }
      }
      if (threadId) res.write(`data: ${JSON.stringify({ threadId })}\n\n`);

      const MAX_TURNS = 10;
      let fullAssistantText = '';
      let usageMetadata: any = null;
      let emptyRetries = 0; // Gemini renvoie parfois un candidat vide -> on retente
      const collectedToolCalls: Array<{ name: string; args: any; ok: boolean; error?: string }> = [];

      try {
        for (let turn = 0; turn < MAX_TURNS && !aborted; turn++) {
          const stream = await ai.models.generateContentStream({
            model,
            contents,
            config: {
              systemInstruction: systemPrompt,
              tools: [{ functionDeclarations: AGENT_TOOLS }],
              maxOutputTokens: 2000,
              temperature: 0.7,
            },
          });

          let textBuffer = '';
          const functionCalls: any[] = [];
          let lastFinishReason: string | undefined;

          for await (const chunk of stream) {
            if (aborted) break;
            const fr = chunk.candidates?.[0]?.finishReason;
            if (fr) lastFinishReason = fr;
            // In @google/genai v1.x, iterate parts directly. `chunk.text` is a
            // getter (not a method) and throws/ warns when functionCall parts
            // are present — so we extract text + functionCalls from parts.
            const parts = chunk.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
              if (typeof part.text === 'string' && part.text) {
                textBuffer += part.text;
                fullAssistantText += part.text;
                res.write(`data: ${JSON.stringify({ content: part.text })}\n\n`);
              }
              if (part.functionCall) functionCalls.push(part.functionCall);
            }
            if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;
          }

          // Assemble model turn
          const modelParts: any[] = [];
          if (textBuffer) modelParts.push({ text: textBuffer });
          functionCalls.forEach(fc => modelParts.push({ functionCall: fc }));
          if (modelParts.length > 0) contents.push({ role: 'model', parts: modelParts });

          if (functionCalls.length === 0) {
            if (!textBuffer) console.warn(`[Assistant] tour vide — finishReason=${lastFinishReason} promptLen=${systemPrompt.length}`);
            // Candidat Gemini vide (ni texte ni tool) sur ce tour : on retente
            // le meme tour quelques fois avant d'abandonner, sinon l'utilisateur
            // recoit une reponse totalement vide.
            if (!textBuffer && !fullAssistantText && collectedToolCalls.length === 0 && emptyRetries < 2) {
              emptyRetries++;
              turn--;
              continue;
            }
            break;
          }

          // Execute tools
          const toolResultParts: any[] = [];
          for (const fc of functionCalls) {
            if (aborted) break;
            res.write(`data: ${JSON.stringify({ toolStart: { name: fc.name, args: fc.args || {} } })}\n\n`);
            const result = await executeTool(fc.name, fc.args || {}, { artisanId: artisan.id });
            const toolError = result.ok ? undefined : (typeof result === 'object' && 'error' in result ? String((result as any).error) : 'Erreur');
            res.write(`data: ${JSON.stringify({ toolEnd: { name: fc.name, ok: result.ok, error: toolError } })}\n\n`);
            collectedToolCalls.push({ name: fc.name, args: fc.args || {}, ok: result.ok, error: toolError });

            if (fc.name === 'naviguer_vers' && result.ok) {
              const nav = (result.data as any)?.navigate;
              if (nav?.page) res.write(`data: ${JSON.stringify({ navigate: nav.page, filtre: nav.filtre, message: nav.message })}\n\n`);
            }
            if (result.ok) {
              const keys = TOOL_INVALIDATIONS[fc.name];
              if (keys?.length) res.write(`data: ${JSON.stringify({ invalidate: keys })}\n\n`);
            }
            toolResultParts.push({ functionResponse: { name: fc.name, response: result } });
          }
          if (toolResultParts.length > 0) contents.push({ role: 'user', parts: toolResultParts });
          if (toolResultParts.length === 0) break;
        }

        // Persist messages to DB
        if (threadId && !aborted) {
          try {
            await insertAiMessage(threadId, 'user', message);
            if (fullAssistantText) {
              await insertAiMessage(
                threadId,
                'assistant',
                fullAssistantText,
                { model, toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined },
                usageMetadata ?? undefined,
              );
            }
          } catch (e: any) {
            console.warn('[Assistant] Persist error:', e?.message);
          }
        }

        // Filet anti-réponse-vide : si Gemini n'a produit NI texte NI action
        // visible, on renvoie un message plutôt qu'un chat muet.
        if (!aborted && !fullAssistantText && collectedToolCalls.length === 0) {
          res.write(`data: ${JSON.stringify({ content: "Je n'ai pas réussi à traiter ta demande. Peux-tu la reformuler ?" })}\n\n`);
        }

        if (!aborted) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (err) {
        console.error('[Assistant] Stream/tool error:', err);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: 'Erreur de génération' })}\n\n`);
          res.end();
        }
      }
    } catch (error) {
      console.error('[Assistant] Error:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // Voice debug sink — the browser POSTs its voice-session diagnostics here so
  // we can see them in the server logs (the Live WS itself is browser↔Google
  // and never touches us). Dev aid; fire-and-forget from the client.
  app.post('/api/voice/debug', (req, res) => {
    try {
      // OPE-24 — endpoint public (crash-reporting sendBeacon, sans auth).
      // 1) rate-limit par IP (CF-Connecting-IP de confiance derriere Cloudflare)
      //    → borne le flood de logs ; throttle SILENCIEUX pour ne pas casser les
      //    clients legitimes. 2) sanitisation anti log-injection (CRLF/control).
      const ip = String(
        (req.headers['cf-connecting-ip'] as string)
        || (req.headers['x-forwarded-for'] as string || '').split(',')[0].trim()
        || req.socket?.remoteAddress || 'unknown'
      );
      const now = Date.now();
      const hit = voiceDebugHits.get(ip);
      if (!hit || hit.resetAt <= now) {
        voiceDebugHits.set(ip, { count: 1, resetAt: now + 60_000 });
      } else if (++hit.count > 30) {
        return res.json({ ok: true });
      }
      const sanitize = (v: any) =>
        String(typeof v === 'string' ? v : JSON.stringify(v))
          .replace(/[\r\n\x00-\x1f]/g, ' ')
          .slice(0, 500);
      const { events } = req.body || {};
      if (Array.isArray(events)) {
        for (const e of events.slice(0, 20)) {
          console.log(`[VoiceDebug] ${sanitize(e)}`);
        }
      } else if (req.body?.msg) {
        console.log(`[VoiceDebug] ${sanitize(req.body.msg)}`);
      }
    } catch { /* ignore */ }
    res.json({ ok: true });
  });

  // Voice token endpoint — mints ephemeral Gemini token for Live WebSocket
  app.post('/api/voice/token', async (req, res) => {
    try {
      const { getUserFromRequest } = await import('./auth-simple');
      const user = await getUserFromRequest(req);
      if (!user) { res.status(401).json({ error: 'Non autorisé' }); return; }

      const { getArtisanByUserId, getAiMessages, getOrCreateAiThread } = await import('../db');
      const artisan = await getArtisanByUserId(user.id);
      if (!artisan) { res.status(404).json({ error: 'Artisan non trouvé' }); return; }

      // Rate-limit IA partagé (OPE-24) : un token vocal ouvre une session Gemini Live
      // coûteuse -> borne par tenant (budget partagé avec le chat texte / outils IA).
      if (!checkRateLimit(artisan.id)) {
        res.status(429).json({ error: 'Trop de requêtes. Réessayez dans quelques minutes.' });
        return;
      }

      // Ensure a thread exists so voice turns can be persisted (browser↔Google
      // voice never hits our server, so the client posts turns to /voice/persist).
      let threadId = req.body?.threadId ? Number(req.body.threadId) : 0;
      if (!threadId) {
        try { threadId = await getOrCreateAiThread(artisan.id, 'Conversation vocale'); } catch { threadId = 0; }
      }

      // Build the system instruction: artisan business context + recent
      // conversation history (so voice mode is seamless with the text chat).
      const { buildSystemPrompt } = await import('./assistantContext');
      let systemText = await buildSystemPrompt(artisan.id);

      if (threadId) {
        try {
          const msgs = await getAiMessages(Number(threadId), 20);
          if (msgs.length > 0) {
            const histLines = msgs
              .map((m: any) => `${m.role === 'assistant' ? 'Assistant' : 'Artisan'}: ${m.transcript}`)
              .join('\n');
            systemText += `\n\n--- Historique récent de la conversation ---\n${histLines}`;
          }
        } catch { /* history optional */ }
      }

      // Tools: list them in the prompt AND declare them in the setup so the model
      // calls them for real instead of hallucinating ("Tool call: …", "un instant…").
      const { AGENT_TOOLS } = await import('./assistantTools');
      const toolList = (AGENT_TOOLS as any[]).map((t) => `- ${t.name} : ${t.description}`).join('\n');
      systemText += `\n\n--- OUTILS DISPONIBLES (fonctions que tu peux APPELER) ---
${toolList}

RÈGLES STRICTES sur les outils :
- Quand une demande nécessite une de ces actions, APPELLE réellement la fonction correspondante. N'écris/ne prononce JAMAIS "Tool call:" ou le nom de la fonction en texte.
- N'invente JAMAIS un résultat, un client, un devis, un montant ou une donnée. Ne prétends pas avoir fait une action sans appeler l'outil.
- N'annonce pas "je cherche" / "un instant" pour ensuite attendre : appelle l'outil immédiatement, son résultat te reviendra et tu répondras ensuite.
- Si AUCUNE fonction ne couvre la demande, dis-le franchement plutôt que d'inventer, et propose éventuellement de repasser en mode texte.`;

      // Expiry: token valid 30 min, session must start within 1 min
      const now = new Date();
      const expireTime = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
      const newSessionExpireTime = new Date(now.getTime() + 60 * 1000).toISOString();

      const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-latest';
      const apiKey = process.env.GEMINI_API_KEY!;

      // Ephemeral token endpoint is v1alpha/auth_tokens with a FLAT snake_case
      // body (the @google/genai SDK and v1beta paths do not expose this).
      // response_modalities must be a SINGLE modality for Live — we use AUDIO
      // and enable input/output transcription to get synchronized TEXT
      // (seamless voice + text).
      const body: any = {
        uses: 1,
        expire_time: expireTime,
        new_session_expire_time: newSessionExpireTime,
        bidi_generate_content_setup: {
          model: `models/${liveModel}`,
          generation_config: {
            response_modalities: ['AUDIO'],
            speech_config: {
              voice_config: { prebuilt_voice_config: { voice_name: 'Aoede' } },
            },
          },
          system_instruction: { parts: [{ text: systemText }] },
          input_audio_transcription: {},
          output_audio_transcription: {},
          tools: [{ function_declarations: AGENT_TOOLS }],
        },
      };

      const tokenRes = await fetch(
        `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('[VoiceToken] Gemini error:', tokenRes.status, err);
        res.status(502).json({ error: 'Impossible de créer le token vocal' });
        return;
      }

      const tokenData = await tokenRes.json();
      const token = tokenData?.name || tokenData?.token;

      res.json({
        token,
        wsUrl: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained`,
        model: liveModel,
        expiresAt: expireTime,
        threadId: threadId || undefined,
      });
    } catch (error) {
      console.error('[VoiceToken] Error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // Persist a completed VOICE turn (user + assistant transcripts) to the thread.
  // The Gemini Live session is browser↔Google, so the client posts each turn here.
  app.post('/api/voice/persist', async (req, res) => {
    try {
      const { getUserFromRequest } = await import('./auth-simple');
      const user = await getUserFromRequest(req);
      if (!user) { res.status(401).json({ error: 'Non autorisé' }); return; }

      const { getArtisanByUserId, getAiThread, insertAiMessage } = await import('../db');
      const artisan = await getArtisanByUserId(user.id);
      if (!artisan) { res.status(404).json({ error: 'Artisan non trouvé' }); return; }

      const threadId = Number(req.body?.threadId);
      const userText = typeof req.body?.userTranscript === 'string' ? req.body.userTranscript.trim() : '';
      const assistantText = typeof req.body?.assistantTranscript === 'string' ? req.body.assistantTranscript.trim() : '';
      const usageMeta = req.body?.usageMetadata ?? undefined;
      if (!threadId || (!userText && !assistantText)) { res.status(400).json({ error: 'threadId + transcript requis' }); return; }

      // Verify the thread belongs to this artisan.
      const thread = await getAiThread(threadId, artisan.id);
      if (!thread) { res.status(404).json({ error: 'Thread introuvable' }); return; }

      if (userText) await insertAiMessage(threadId, 'user', userText, { source: 'voice' });
      if (assistantText) await insertAiMessage(threadId, 'assistant', assistantText, { source: 'voice' }, usageMeta);
      res.json({ ok: true });
    } catch (error) {
      console.error('[VoicePersist] Error:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // Execute a tool requested by the voice Live session. The browser receives the
  // Gemini `toolCall`, calls this (with DB-backed artisan context), and sends the
  // result back to Gemini as a toolResponse.
  app.post('/api/voice/tool', async (req, res) => {
    try {
      const { getUserFromRequest } = await import('./auth-simple');
      const user = await getUserFromRequest(req);
      if (!user) { res.status(401).json({ error: 'Non autorisé' }); return; }

      const { getArtisanByUserId } = await import('../db');
      const artisan = await getArtisanByUserId(user.id);
      if (!artisan) { res.status(404).json({ error: 'Artisan non trouvé' }); return; }

      const { name, args } = req.body || {};
      if (!name || typeof name !== 'string') { res.status(400).json({ error: 'name requis' }); return; }

      const { executeTool } = await import('./assistantTools');
      const result = await executeTool(name, args || {}, { artisanId: artisan.id });
      res.json({ result });
    } catch (error: any) {
      console.error('[VoiceTool] Error:', error?.message);
      res.json({ result: { ok: false, error: 'Erreur exécution outil' } });
    }
  });

  // tRPC API — protege par subscriptionGuard (T3) qui :
  // - bloque (402) si abonnement expire sauf paths whitelistes,
  // - enregistre l'appareil et applique la limite (403 si depassement),
  // - cree/refresh la session active et evicte la plus ancienne si LRU.
  // Le guard est defensif : en cas d'erreur DB, il PASSE sans bloquer.
  const { subscriptionGuard } = await import("./subscriptionGuard");
  app.use("/api/trpc", subscriptionGuard());
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

  // OPE-82 — Middleware d'erreur Express (4 args). Express 4 ne transmet pas
  // automatiquement les erreurs des handlers async ; ce filet attrape ce qui
  // remonte (next(err) ou throw sync), loggue, et renvoie un 500 generique
  // (pas de detail interne expose au client).
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[express error]", err?.stack || err?.message || err);
    if (res.headersSent) return;
    res.status(500).json({ error: "Erreur serveur" });
  });

  // En production (Railway, …), on DOIT listen exactement sur
  // process.env.PORT et sur 0.0.0.0. Tenter de "trouver un autre port"
  // si l'attribué est busy fait que le proxy route vers du vide → l'app
  // apparait DOWN ("Application failed to respond"). En dev local, on
  // garde le fallback sur le port disponible pour ne pas bloquer.
  const preferredPort = parseInt(process.env.PORT || "3000");
  const host = "0.0.0.0";
  const isProd = process.env.NODE_ENV === "production";

  let port = preferredPort;
  if (!isProd) {
    port = await findAvailablePort(preferredPort);
    if (port !== preferredPort) {
      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }
  }

  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}/ (env=${process.env.NODE_ENV || "dev"})`);
  });

  // ==========================================================================
  // T5 — Scheduler horaire : sessions expirees + emails J-3/J-1 + bascule
  // trials terminés en 'expired'. Best-effort, ne crashe pas le process si
  // une iteration echoue.
  // ==========================================================================
  const runScheduler = async () => {
    try {
      const db = await import("../db");
      const { sendEmail, buildTrialEndingJ3Email, buildTrialEndingJ1Email } = await import("./emailService");
      const appUrl = process.env.APP_URL || "https://www.operioz.com";

      // 1) Nettoyage des sessions expirees.
      const cleaned = await db.cleanExpiredSessions();
      if (cleaned > 0) console.log(`[Scheduler] ${cleaned} session(s) expiree(s) nettoyee(s)`);

      // 2) Bascule des trials termines en 'expired'. On le fait AVANT les
      //    envois d'email pour ne pas envoyer un J-3 alors qu'il est deja
      //    a 0 jour (edge case du scheduler qui aurait saute des heures).
      try {
        const pool = db.getPool();
        if (pool) {
          const [r] = await pool.execute(
            `UPDATE subscriptions SET status='expired', plan='expired'
             WHERE status='trialing' AND trial_ends_at < NOW()`
          ) as any;
          if (r.affectedRows > 0) {
            console.log(`[Scheduler] ${r.affectedRows} trial(s) expire(s) -> plan='expired'`);
          }
        }
      } catch (e: any) {
        console.warn("[Scheduler] expire trials:", e?.message || e);
      }

      // 3) Emails J-3 (trials qui se terminent dans EXACTEMENT 3 jours).
      //    On utilise DATE() pour matcher par jour calendaire et eviter
      //    un envoi a la minute pres.
      try {
        const pool = db.getPool();
        if (pool) {
          const [rows] = await pool.execute(`
            SELECT a.id AS artisanId, u.email AS email, u.prenom AS prenom
            FROM artisans a
            JOIN users u ON u.id = a.userId
            JOIN subscriptions s ON s.artisan_id = a.id
            WHERE s.status = 'trialing'
              AND DATE(s.trial_ends_at) = DATE(DATE_ADD(NOW(), INTERVAL 3 DAY))
          `) as any;
          for (const row of rows as any[]) {
            if (!row.email) continue;
            const { subject, body } = buildTrialEndingJ3Email({
              firstName: row.prenom, appUrl,
            });
            await sendEmail({ to: row.email, subject, body });
          }
          if ((rows as any[]).length > 0) {
            console.log(`[Scheduler] ${(rows as any[]).length} email(s) J-3 envoye(s)`);
          }
        }
      } catch (e: any) {
        console.warn("[Scheduler] J-3:", e?.message || e);
      }

      // 4) Emails J-1.
      try {
        const pool = db.getPool();
        if (pool) {
          const [rows] = await pool.execute(`
            SELECT a.id AS artisanId, u.email AS email, u.prenom AS prenom
            FROM artisans a
            JOIN users u ON u.id = a.userId
            JOIN subscriptions s ON s.artisan_id = a.id
            WHERE s.status = 'trialing'
              AND DATE(s.trial_ends_at) = DATE(DATE_ADD(NOW(), INTERVAL 1 DAY))
          `) as any;
          for (const row of rows as any[]) {
            if (!row.email) continue;
            const { subject, body } = buildTrialEndingJ1Email({
              firstName: row.prenom, appUrl,
            });
            await sendEmail({ to: row.email, subject, body });
          }
          if ((rows as any[]).length > 0) {
            console.log(`[Scheduler] ${(rows as any[]).length} email(s) J-1 envoye(s)`);
          }
        }
      } catch (e: any) {
        console.warn("[Scheduler] J-1:", e?.message || e);
      }

      // 5) Email decouverte J+3 apres inscription : recommandations pour
      //    bien demarrer (devis IA, import clients, paiement en ligne).
      try {
        const { buildDiscoveryJ3Email } = await import("./emailService");
        const pool = db.getPool();
        if (pool) {
          const [rows] = await pool.execute(`
            SELECT a.id AS artisanId, u.email AS email, u.prenom AS prenom
            FROM artisans a
            JOIN users u ON u.id = a.userId
            WHERE DATE(u.createdAt) = DATE(DATE_SUB(NOW(), INTERVAL 3 DAY))
          `) as any;
          for (const row of rows as any[]) {
            if (!row.email) continue;
            const { subject, body } = buildDiscoveryJ3Email({
              firstName: row.prenom, appUrl,
            });
            await sendEmail({ to: row.email, subject, body });
          }
          if ((rows as any[]).length > 0) {
            console.log(`[Scheduler] ${(rows as any[]).length} email(s) decouverte J+3 envoye(s)`);
          }
        }
      } catch (e: any) {
        console.warn("[Scheduler] J+3:", e?.message || e);
      }

      // 6) Depenses recurrentes : pour chaque depense flaggee recurrente
      //    dont prochaine_occurrence <= aujourd'hui, on cree une copie a
      //    la date du jour et on incrémente prochaine_occurrence selon
      //    la frequence (mensuelle / trimestrielle / annuelle).
      //    Idempotent : si le scheduler tourne plusieurs fois le meme
      //    jour, l'update de prochaine_occurrence empeche les doublons.
      try {
        const pool = db.getPool();
        if (pool) {
          const [rows] = await pool.execute(`
            SELECT id, artisan_id, user_id, fournisseur, categorie, sous_categorie,
                   description, montant_ht, taux_tva, montant_tva, montant_ttc,
                   mode_paiement, remboursable, chantier_id, intervention_id,
                   client_id, notes, tva_deductible, frequence_recurrence,
                   prochaine_occurrence
              FROM depenses
             WHERE recurrente = TRUE
               AND prochaine_occurrence IS NOT NULL
               AND prochaine_occurrence <= CURDATE()
             LIMIT 50
          `) as any;
          let nbCreated = 0;
          for (const d of rows as any[]) {
            try {
              // Generer un nouveau numero DEP-XXXXX.
              const numero = await db.getNextDepenseNumero(d.artisan_id);
              await pool.execute(
                `INSERT INTO depenses
                   (artisan_id, user_id, numero, date_depense, fournisseur,
                    categorie, sous_categorie, description, montant_ht, taux_tva,
                    montant_tva, montant_ttc, mode_paiement, statut, remboursable,
                    chantier_id, intervention_id, client_id, notes, tva_deductible,
                    recurrente)
                 VALUES (?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'brouillon', ?, ?, ?, ?, ?, ?, FALSE)`,
                [
                  d.artisan_id, d.user_id, numero, d.fournisseur, d.categorie,
                  d.sous_categorie, d.description, d.montant_ht, d.taux_tva,
                  d.montant_tva, d.montant_ttc, d.mode_paiement, d.remboursable,
                  d.chantier_id, d.intervention_id, d.client_id, d.notes,
                  d.tva_deductible,
                ]
              );
              // Avance prochaine_occurrence selon la frequence.
              const interval =
                d.frequence_recurrence === "hebdomadaire" ? "INTERVAL 7 DAY" :
                d.frequence_recurrence === "trimestrielle" ? "INTERVAL 3 MONTH" :
                d.frequence_recurrence === "annuelle" ? "INTERVAL 1 YEAR" :
                "INTERVAL 1 MONTH"; // mensuelle par defaut
              await pool.execute(
                `UPDATE depenses
                    SET prochaine_occurrence = DATE_ADD(prochaine_occurrence, ${interval})
                  WHERE id = ?`,
                [d.id]
              );
              // Notification a l'artisan.
              try {
                await pool.execute(
                  `INSERT INTO notifications (artisanId, type, titre, message, lien, lu)
                   VALUES (?, 'info', ?, ?, '/depenses', 0)`,
                  [
                    d.artisan_id,
                    `Dépense récurrente créée : ${d.fournisseur || d.categorie}`,
                    `${numero} — ${Number(d.montant_ttc).toLocaleString("fr-FR")} EUR — créée automatiquement aujourd'hui.`,
                  ]
                );
              } catch {/* table notifications absente : ok */}
              nbCreated++;
            } catch (errIn: any) {
              console.warn(`[Scheduler] depense recurrente ${d.id} :`, errIn?.message);
            }
          }
          if (nbCreated > 0) {
            console.log(`[Scheduler] ${nbCreated} depense(s) recurrente(s) creee(s)`);
          }
        }
      } catch (e: any) {
        console.warn("[Scheduler] depenses recurrentes:", e?.message || e);
      }
    } catch (e: any) {
      console.error("[Scheduler] erreur generale:", e?.message || e);
    }
  };

  // Premier tick apres 60s (laisse le temps a la migration de tourner), puis
  // toutes les heures. On ne lance le scheduler qu'en prod pour ne pas
  // envoyer des emails depuis chaque session de dev.
  if (isProd) {
    setTimeout(runScheduler, 60_000);
    setInterval(runScheduler, 60 * 60 * 1000);
    console.log("[Scheduler] Active (toutes les heures)");
  } else {
    console.log("[Scheduler] Skip (NODE_ENV != production)");
  }
}

startServer().catch(console.error);
