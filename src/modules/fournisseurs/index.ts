// Contrat public du module fournisseurs : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/fournisseur";
export * from "./application/fournisseur-repository";
export * from "./fournisseurs.module";
