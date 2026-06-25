import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "apps", "web", "src"),
      "@shared": path.resolve(templateRoot, "packages", "contract"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["apps/api/**/*.test.ts"],
    exclude: [
      "apps/api/**/infra/*drizzle*.test.ts",
      "apps/api/**/interface/**/*.test.ts",
    ],
    setupFiles: ["./vitest.setup.api.ts"],
    reporter: ["dot"],
  },
});
