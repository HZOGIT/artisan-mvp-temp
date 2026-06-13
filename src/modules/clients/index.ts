// Contrat public du module clients : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/client";
export * from "./application/client-repository";
export * from "./clients.module";
