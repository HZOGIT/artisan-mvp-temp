// Contrat public du module interventions : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/intervention";
export * from "./application/intervention-repository";
export * from "./interventions.module";
