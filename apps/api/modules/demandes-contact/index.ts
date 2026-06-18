// Contrat public du module demandes-contact : types de domaine + port + module/factory.
// Pas d'impl Drizzle (infra) ici → zéro couplage DB pour les consommateurs purs.
export * from "./domain/demande-contact";
export * from "./application/demande-contact-repository";
export * from "./demandes-contact.module";
