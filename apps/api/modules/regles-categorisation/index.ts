/*
 * Contrat public du module regles-categorisation : types de domaine + port + module/factory.
 * Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
 */
export * from "./domain/regle-categorisation";
export * from "./application/regle-categorisation-repository";
export * from "./regles-categorisation.module";
