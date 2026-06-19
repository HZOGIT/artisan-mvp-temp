/*
 * Contrat public du module conges : types de domaine + port + module/factory + le calcul
 * pur de solde. Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
 */
export * from "./domain/conge";
export * from "./application/conge-repository";
export * from "./application/solde";
export * from "./conges.module";
