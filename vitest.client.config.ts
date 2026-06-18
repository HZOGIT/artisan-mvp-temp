import { defineConfig } from "vitest/config";
import path from "path";

// Gate de tests du FRONTEND (`client/src/**`). Config DÉDIÉE,
// distincte de `vitest.config.ts` (qui ne collecte que `src/**` = backend) pour ne pas perturber le
// gate des autres agents. Exécution : `pnpm exec vitest run -c vitest.client.config.ts`.
const root = path.resolve(import.meta.dirname);

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "client", "src"),
      "@shared": path.resolve(root, "shared"),
      "@assets": path.resolve(root, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["client/src/**/*.test.ts", "client/src/**/*.test.tsx"],
  },
});
