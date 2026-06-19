import { provisionDatabase } from "./provision-database";

/**
 * Entrée CLI pour provisionner une base locale/CI (rôle applicatif + migrations) sans démarrer
 * le serveur — même logique qu'au boot. Requiert `DATABASE_URL` (owner) + `APP_DATABASE_URL` (app).
 */
provisionDatabase()
  .then(() => {
    console.warn("[provision] base provisionnée (rôle applicatif + migrations schéma/RLS).");
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error("[provision] échec :", err);
    process.exit(1);
  });
