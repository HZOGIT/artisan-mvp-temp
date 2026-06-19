/*
 * Contrat public du module modeles-email : types de domaine + port + module/factory.
 * Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
 */
export * from "./domain/modele-email";
export * from "./application/modele-email-repository";
export * from "./modeles-email.module";
