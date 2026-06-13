// Contrat public du module factures : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/facture";
export * from "./application/facture-repository";
export * from "./factures.module";
