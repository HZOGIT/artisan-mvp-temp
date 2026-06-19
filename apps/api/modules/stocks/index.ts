/*
 * Contrat public du module stocks : types de domaine + port + module/factory.
 * Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
 */
export * from "./domain/stock";
export * from "./application/stock-repository";
export * from "./stocks.module";
