/*
 * Contrat public du module parametres : types de domaine + port + module/factory.
 * Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
 */
export * from "./domain/parametres";
export * from "./application/parametres-repository";
export * from "./parametres.module";
