/*
 * Contrat public du module budgets-categories : types de domaine + port + module/factory.
 * Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
 */
export * from "./domain/budget-categorie";
export * from "./application/budget-categorie-repository";
export * from "./budgets-categories.module";
