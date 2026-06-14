// Contrat public du module demandes-avis : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/demande-avis";
export * from "./application/demande-avis-repository";
export * from "./demandes-avis.module";
