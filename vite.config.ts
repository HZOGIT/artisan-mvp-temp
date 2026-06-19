import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const plugins = [react(), tailwindcss(), jsxLocPlugin()];

export default defineConfig({
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
  server: {
    host: true,
    port: 3000,
    allowedHosts: ["localhost", "127.0.0.1", "dev.operioz.com"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
