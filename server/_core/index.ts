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
    const { getDb } = await import('../db');
    const db = await getDb();
    if (db) {
      console.log('[Database] MySQL connected successfully');
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
