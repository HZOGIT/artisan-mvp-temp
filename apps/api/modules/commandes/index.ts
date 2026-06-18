// Contrat public du module commandes : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/commande";
export * from "./application/commande-repository";
export * from "./commandes.module";
