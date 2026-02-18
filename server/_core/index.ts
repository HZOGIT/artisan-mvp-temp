import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import cookieParser from "cookie-parser";
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
    const { handleStripeWebhook } = await import('../stripe/webhookHandler');
    return handleStripeWebhook(req, res);
  });
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  console.log('OK express.json() charge');
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // IMPORTANT: cookie-parser MUST be before routes to parse cookies
  app.use(cookieParser());
  console.log('OK cookieParser() charge');

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
