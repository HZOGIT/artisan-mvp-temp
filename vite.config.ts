import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";


const plugins = [react(), tailwindcss(), jsxLocPlugin()];

export default defineConfig(({ mode }) => {
  // Charge les variables d'environnement
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "apps", "web", "src"),
        "@shared": path.resolve(import.meta.dirname, "packages", "contract"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    envDir: path.resolve(import.meta.dirname),
    root: path.resolve(import.meta.dirname, "apps", "web"),
    publicDir: path.resolve(import.meta.dirname, "apps", "web", "public"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    // Cle publique Clerk : injectee uniquement depuis l'env, jamais hardcodee.
    // Si VITE_CLERK_PUBLISHABLE_KEY n'est pas defini, l'app demarrera sans
    // Clerk configure et Clerk levera une erreur explicite cote runtime.
    define: {
      'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(
        env.VITE_CLERK_PUBLISHABLE_KEY || ''
      )
    },
    server: {
      host: true,
      port: 3000,
      allowedHosts: ["localhost", "127.0.0.1", "dev.operioz.com"],
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
