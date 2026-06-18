// Contrat public du module notes-de-frais : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/note-de-frais";
export * from "./application/note-de-frais-repository";
export * from "./notes-de-frais.module";
