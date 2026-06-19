/*
 * Contrat public du module rdv-en-ligne : types de domaine + port + module/factory.
 * Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
 */
export * from "./domain/rdv";
export * from "./application/rdv-repository";
export * from "./rdv-en-ligne.module";
