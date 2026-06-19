/*
 * Types de domaine du workflow « demande d'avis » (envoi d'un lien d'avis au client
 * après une intervention) — découplés du schéma Drizzle.
 */

export type StatutDemandeAvis = "envoyee" | "ouverte" | "completee" | "expiree";

export interface DemandeAvis {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly interventionId: number;
  readonly tokenDemande: string;
  readonly emailEnvoyeAt: Date | null;
  readonly expiresAt: Date;
  readonly statut: StatutDemandeAvis;
  readonly createdAt: Date;
}

// Références minimales scopées tenant utilisées par le workflow (ownership).
export interface InterventionRef {
  readonly id: number;
  readonly clientId: number;
  readonly dateDebut: Date;
}

export interface ClientRef {
  readonly id: number;
  readonly nom: string;
  readonly email: string | null;
}

export interface CreerDemandeInput {
  readonly clientId: number;
  readonly interventionId: number;
  readonly tokenDemande: string;
  readonly emailEnvoyeAt: Date;
  readonly expiresAt: Date;
}
