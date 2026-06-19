/*
 * Types de domaine du module clients (CRM) — découplés du schéma Drizzle.
 * ⚠️ Données personnelles (PII : nom, e-mail, téléphone, adresse, SIRET/TVA) : isolation
 * cross-tenant stricte (historique d'IDOR/fuite PII). Domaine fondamental réutilisé par
 * devis/factures/interventions → la suppression doit préserver l'intégrité référentielle.
 */

export type ClientType = "particulier" | "professionnel";

export interface Client {
  readonly id: number;
  readonly artisanId: number;
  readonly nom: string;
  readonly prenom: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
  readonly adresseFacturation: string | null;
  readonly codePostalFacturation: string | null;
  readonly villeFacturation: string | null;
  readonly type: ClientType;
  readonly raisonSociale: string | null;
  readonly siret: string | null;
  readonly numeroTVA: string | null;
  readonly etiquettes: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateClientInput {
  readonly nom: string;
  readonly prenom?: string | null;
  readonly email?: string | null;
  readonly telephone?: string | null;
  readonly adresse?: string | null;
  readonly codePostal?: string | null;
  readonly ville?: string | null;
  readonly adresseFacturation?: string | null;
  readonly codePostalFacturation?: string | null;
  readonly villeFacturation?: string | null;
  readonly type?: ClientType;
  readonly raisonSociale?: string | null;
  readonly siret?: string | null;
  readonly numeroTVA?: string | null;
  readonly etiquettes?: string | null;
  readonly notes?: string | null;
}

export interface UpdateClientInput {
  readonly nom?: string;
  readonly prenom?: string | null;
  readonly email?: string | null;
  readonly telephone?: string | null;
  readonly adresse?: string | null;
  readonly codePostal?: string | null;
  readonly ville?: string | null;
  readonly adresseFacturation?: string | null;
  readonly codePostalFacturation?: string | null;
  readonly villeFacturation?: string | null;
  readonly type?: ClientType;
  readonly raisonSociale?: string | null;
  readonly siret?: string | null;
  readonly numeroTVA?: string | null;
  readonly etiquettes?: string | null;
  readonly notes?: string | null;
}
