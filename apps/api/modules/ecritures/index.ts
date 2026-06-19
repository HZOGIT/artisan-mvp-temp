/*
 * Contrat public du module ecritures (compta/FEC) : types de domaine + ports + agrégats de
 * lecture + module/factory. Pas d'impl Drizzle (infra) ici → zéro couplage DB. Le port de lecture
 * `IFactureReader` (cross-domaine) fait partie du contrat ; l'adapter `ComptaPort` (effet de bord)
 * vit en infra et n'est PAS exposé.
 */
export * from "./domain/ecriture";
export * from "./application/ecriture-repository";
export * from "./application/facture-reader";
export * from "./application/balance";
export * from "./ecritures.module";
