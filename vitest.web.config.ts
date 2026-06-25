import { defineConfig } from "vitest/config";
import path from "path";

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "apps", "web", "src"),
      "@shared": path.resolve(root, "packages", "contract"),
      "@assets": path.resolve(root, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx"],
    pool: "threads",
    poolOptions: {
      threads: { minThreads: 1, maxThreads: "75%" },
    },
    reporter: ["dot"],
    experimental: {
      fsModuleCache: true,
    },
  },
});
