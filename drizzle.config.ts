import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// OPE-184 — bascule PG-first. Le dialecte est piloté par DB_DIALECT pour permettre
// la coexistence MySQL/Postgres pendant la conversion du schéma (P0.3→P0.6).
// Défaut = mysql (comportement actuel inchangé). Passera à "postgresql" une fois
// schema.ts converti en pgTable.
const dialect = (process.env.DB_DIALECT ?? "mysql") as "mysql" | "postgresql";
const isPg = dialect === "postgresql";

// PG-first : en postgres, on lit le schéma converti (schema.pg.ts) et on écrit les
// migrations dans un dossier dédié (drizzle/pg) pour ne PAS mélanger avec les
// migrations mysql legacy de drizzle/. Le dialect mysql reste inchangé.
export default defineConfig({
  schema: isPg ? "./drizzle/schema.pg.ts" : "./drizzle/schema.ts",
  out: isPg ? "./drizzle/pg" : "./drizzle",
  dialect,
  dbCredentials: {
    url: connectionString,
  },
});
