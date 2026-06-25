import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@admin": path.resolve(import.meta.dirname, "apps", "admin", "src"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "apps", "admin"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/admin"),
    emptyOutDir: true,
  },
  server: { host: true, port: 3001 },
});
