import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
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
  const app = express();
  const server = createServer(app);
  
  // Stripe webhook - MUST be before express.json() for signature verification
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const { handleStripeWebhook } = await import('../stripe/webhookHandler');
    return handleStripeWebhook(req, res);
  });
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // Helper pour créer une session de test/demo
  const createTestSession = async (req: any, res: any, email: string) => {
    try {
      const { COOKIE_NAME, ONE_YEAR_MS } = await import('@shared/const');
      const { sdk } = await import('./sdk');
      const { getSessionCookieOptions } = await import('./cookies');
      const dbModule = await import('../db');
      const schemaModule = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      
      const db = await dbModule.getDb();
      
      const users = await db.select().from(schemaModule.users).where(
        eq(schemaModule.users.email, email)
      );
      
      if (users.length === 0) {
        return res.status(404).json({ error: `User ${email} not found` });
      }
      
      const user = users[0];
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || '',
        expiresInMs: ONE_YEAR_MS,
      });
      
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect('/');
    } catch (error) {
      console.error('Error creating test session:', error);
      res.status(500).json({ error: error.message });
    }
  };
  
  // DEMO LOGIN ROUTE - Works in all environments for testing
  app.get('/demo-login', async (req, res) => {
    try {
      console.log('[DEMO] Demo login route accessed');
      
      const dbModule = await import('../db');
      const schemaModule = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const { COOKIE_NAME, ONE_YEAR_MS } = await import('@shared/const');
      const { sdk } = await import('./sdk');
      const { getSessionCookieOptions } = await import('./cookies');
      
      const db = await dbModule.getDb();
      
      // 1. Chercher ou créer un utilisateur demo
      const demoEmail = 'zouiten@biopp.fr';
      let demoUsers = await db.select()
        .from(schemaModule.users)
        .where(eq(schemaModule.users.email, demoEmail))
        .limit(1);
      
      let demoUser = demoUsers[0];
      
      if (!demoUser) {
        console.log('[DEMO] Creating new demo user');
        // Créer l'utilisateur demo
        await db.insert(schemaModule.users).values({
          email: demoEmail,
          name: 'Zouiten Demo',
          openId: 'demo-zouiten-' + Date.now(),
          loginMethod: 'demo',
          role: 'user',
        });
        
        // Récupérer l'utilisateur créé
        const createdUsers = await db.select()
          .from(schemaModule.users)
          .where(eq(schemaModule.users.email, demoEmail))
          .limit(1);
        
        demoUser = createdUsers[0];
        
        // Créer aussi un artisan associé
        if (demoUser) {
          console.log('[DEMO] Creating demo artisan');
          await db.insert(schemaModule.artisans).values({
            userId: demoUser.id,
            nomEntreprise: 'Demo Électricité',
            siret: '12345678901234',
            adresse: '123 Rue Demo',
            codePostal: '75001',
            ville: 'Paris',
            telephone: '0123456789',
            email: demoEmail,
            specialite: 'electricite',
          });
        }
      }
      
      if (!demoUser) {
        throw new Error('Failed to create or find demo user');
      }
      
      // 2. Créer la session
      console.log('[DEMO] Creating session for user:', demoUser.id);
      const sessionToken = await sdk.createSessionToken(demoUser.openId, {
        name: demoUser.name || 'Demo User',
        expiresInMs: ONE_YEAR_MS,
      });
      
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      
      console.log('[DEMO] Session created, redirecting to dashboard');
      res.redirect('/');
      
    } catch (error) {
      console.error('[DEMO] Demo login error:', error);
      res.status(500).json({ 
        error: 'Demo login failed', 
        details: error.message 
      });
    }
  });
  
  // ENDPOINTS DE TEST - Forcer la connexion avec les utilisateurs de test (development only)
  if (process.env.NODE_ENV === "development") {
    app.get('/api/test/login-biopp2003', async (req, res) => {
      await createTestSession(req, res, 'biopp2003@yahoo.fr');
    });
    
    app.get('/api/test/login-doudihab', async (req, res) => {
      await createTestSession(req, res, 'doudihab@gmail.com');
    });
    
    app.get('/api/test/login-zouiten', async (req, res) => {
      await createTestSession(req, res, 'zouiten@biopp.fr');
    });
  }
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
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

export { startServer };
