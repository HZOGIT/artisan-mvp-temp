/*
 * Contrat public du module badges : types de domaine + port + module/factory.
 * Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
 */
export * from "./domain/badge";
export * from "./domain/classement";
export * from "./application/badge-repository";
export * from "./badges.module";
