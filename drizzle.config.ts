import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// Stack 100% PostgreSQL (legacy MySQL supprimé) : schéma source = drizzle/schema.pg.ts,
// migrations écrites dans drizzle/pg.
export default defineConfig({
  schema: "./drizzle/schema.pg.ts",
  out: "./drizzle/pg",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
