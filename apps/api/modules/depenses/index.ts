// Contrat public du module depenses : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/depense";
export * from "./application/depense-repository";
export * from "./depenses.module";
