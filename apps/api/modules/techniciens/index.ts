// Contrat public du module techniciens : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/technicien";
export * from "./domain/disponibilite";
export * from "./domain/position";
export * from "./domain/utilisateur-liable";
export * from "./application/technicien-repository";
export * from "./techniciens.module";
