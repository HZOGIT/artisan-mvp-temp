// Contrat public du module conges : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/conge";
export * from "./application/conge-repository";
export * from "./conges.module";
