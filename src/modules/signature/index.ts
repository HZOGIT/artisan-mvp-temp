// Contrat public du module signature : types de domaine + ports + module/factory.
// Les implémentations Drizzle (infra) ne sont PAS exportées (découplage DB / consommateurs purs).
export * from "./domain/signature";
export * from "./application/signature-repository";
export * from "./application/use-cases";
export * from "./signature.module";
