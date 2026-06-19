// drizzle/schema.active.ts — indirection de schéma (PG-only).
// Historiquement dialect-aware (OPE-184) ; le stack étant désormais 100% PostgreSQL
// (legacy MySQL supprimé), ce fichier réexporte simplement le schéma PG. Conservé comme
// point d'import stable pour les scripts standalone `scripts/test-*-pg.mjs`.
export * from "./schema.pg";
