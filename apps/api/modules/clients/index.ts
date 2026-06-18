// Contrat public du module clients : types de domaine + port + module/factory + le modèle
// de lecture de l'encours (type + calcul pur). Pas d'impl Drizzle (infra) ici → zéro
// couplage DB pour les consommateurs purs.
export * from "./domain/client";
export * from "./application/client-repository";
export * from "./application/encours";
export * from "./clients.module";
