/*
 * Contrat public du module previsions-ca : types de domaine + port + module/factory.
 * Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
 */
export * from "./domain/prevision-ca";
export * from "./application/prevision-ca-repository";
export * from "./previsions-ca.module";
