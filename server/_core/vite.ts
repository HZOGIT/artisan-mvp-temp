import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const resolvedViteConfig = typeof viteConfig === "function"
    ? await (viteConfig as Function)({ mode: "development", command: "serve", isSsrBuild: false })
    : viteConfig;

  const vite = await createViteServer({
    ...resolvedViteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Use process.cwd() instead of import.meta.dirname because esbuild bundles
  // the code and import.meta.dirname becomes unreliable in production
  const distPath = path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Serve static files from dist/public.
  // IMPORTANT : index.html ne doit JAMAIS etre mis en cache par le navigateur,
  // sinon apres un deploiement le client garde un index.html perime qui pointe
  // vers d'anciens hashes de chunks (Modules-XXXX.js) supprimes => 404 +
  // "error loading dynamically imported module". Les assets hashes (/assets)
  // restent en cache long car immuables par leur hash.
  app.use(express.static(distPath, {
    maxAge: '1d',
    etag: false,
    index: false, // ne pas auto-servir index.html (cache 1j) pour '/'
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));

  // Serve assets explicitly with long cache (immuables : hash dans le nom)
  app.use('/assets', express.static(path.resolve(distPath, 'assets'), {
    maxAge: '1y',
    etag: false,
    immutable: true,
  }));

  // Fall through to index.html for SPA routing — toujours frais (no-cache)
  app.use("*", (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
