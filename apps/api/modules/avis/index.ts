/*
 * Contrat public du module avis : types de domaine + ports + module/factory.
 * On n'exporte PAS les implémentations Drizzle (infra) pour ne pas coupler la base
 * de données aux consommateurs purs (use-cases/tests).
 */
export * from "./domain/avis";
export * from "./domain/demande-avis";
export * from "./application/avis-repository";
export * from "./application/demande-avis-repository";
export * from "./avis.module";
