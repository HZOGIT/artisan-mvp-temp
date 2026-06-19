/*
 * Contrat public du module modeles-devis : types de domaine + port + module/factory.
 * Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
 */
export * from "./domain/modele-devis";
export * from "./application/modele-devis-repository";
export * from "./modeles-devis.module";
