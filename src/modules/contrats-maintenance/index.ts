// Contrat public du module contrats-maintenance : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/contrat";
export * from "./application/contrat-repository";
export * from "./contrats-maintenance.module";
