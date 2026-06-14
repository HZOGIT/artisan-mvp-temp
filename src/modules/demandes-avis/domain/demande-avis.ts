// Types de domaine du module demandes-avis (demandes d'avis client envoyées après une intervention :
// un token est généré, un email est envoyé au client, le statut est suivi jusqu'à réception de l'avis)
// — découplés du schéma Drizzle. Table `demandes_avis` (RLS sur artisanId ; colonnes camelCase en
// base → pas de mapping snake_case). ⚠️ Anti-IDOR sur 2 FK (clientId, interventionId) ; `tokenDemande`
// généré SERVEUR (unique) ; statut initial "envoyee" non usurpable ; transitions maîtrisées.

export type DemandeAvisStatut = "envoyee" | "ouverte" | "completee" | "expiree";

export interface DemandeAvis {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly interventionId: number;
  readonly tokenDemande: string;
  readonly emailEnvoyeAt: Date | null;
  readonly avisRecuAt: Date | null;
  readonly statut: DemandeAvisStatut;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

// Entrée de création. `tokenDemande` (généré serveur, unique), `statut` ("envoyee") et `artisanId`
// sont posés par l'infra ; jamais fournis par l'appelant. ⚠️ `clientId`/`interventionId` validés
// anti-IDOR (ownsClient/ownsIntervention) avant insertion.
export interface CreateDemandeAvisInput {
  readonly clientId: number;
  readonly interventionId: number;
  readonly expiresAt?: Date;
}
