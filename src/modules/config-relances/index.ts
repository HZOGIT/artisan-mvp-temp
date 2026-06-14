// Contrat public du module config-relances : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/config-relances";
export * from "./application/config-relances-repository";
export * from "./config-relances.module";
