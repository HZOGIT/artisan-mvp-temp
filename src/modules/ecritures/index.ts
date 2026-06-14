// Contrat public du module ecritures : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/ecriture";
export * from "./application/ecriture-repository";
export * from "./ecritures.module";
