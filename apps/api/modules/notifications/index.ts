/*
 * Contrat public du module notifications : types de domaine + port + module/factory.
 * Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
 */
export * from "./domain/notification";
export * from "./domain/facture-en-retard";
export * from "./application/notification-repository";
export * from "./notifications.module";
