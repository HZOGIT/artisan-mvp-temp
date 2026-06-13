// Contrat public du module techniciens : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/technicien";
export * from "./application/technicien-repository";
export * from "./techniciens.module";
