// Contrat public du module categories-depenses : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/categorie-depense";
export * from "./application/categorie-depense-repository";
export * from "./categories-depenses.module";
