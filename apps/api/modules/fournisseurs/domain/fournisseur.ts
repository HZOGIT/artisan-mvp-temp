/** Types de domaine du module fournisseurs — découplés du schéma Drizzle. */

export interface Fournisseur {
  readonly id: number;
  readonly artisanId: number;
  readonly nom: string;
  readonly contact: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateFournisseurInput {
  readonly nom: string;
  readonly contact?: string | null;
  readonly email?: string | null;
  readonly telephone?: string | null;
  readonly adresse?: string | null;
  readonly codePostal?: string | null;
  readonly ville?: string | null;
  readonly notes?: string | null;
}

export interface UpdateFournisseurInput {
  readonly nom?: string;
  readonly contact?: string | null;
  readonly email?: string | null;
  readonly telephone?: string | null;
  readonly adresse?: string | null;
  readonly codePostal?: string | null;
  readonly ville?: string | null;
  readonly notes?: string | null;
}
