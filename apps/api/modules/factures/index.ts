/*
 * Contrat public du module factures : types de domaine + ports + module/factory.
 * Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs. Le port compta
 * expose son no-op (`NoopComptaPort`) car c'est un défaut neutre, pas une impl d'infra.
 */
export * from "./domain/facture";
export * from "./application/facture-repository";
export * from "./application/devis-reader";
export * from "./application/compta-port";
export * from "./factures.module";
