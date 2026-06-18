// Contrat public du module articles : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/article";
export * from "./application/article-repository";
export * from "./articles.module";
