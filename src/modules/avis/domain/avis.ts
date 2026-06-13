// Types de domaine du module avis (avis clients) — découplés du schéma Drizzle.

export type StatutAvis = "en_attente" | "publie" | "masque";

export interface Avis {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly interventionId: number | null;
  readonly note: number;
  readonly commentaire: string | null;
  readonly tokenAvis: string | null;
  readonly reponseArtisan: string | null;
  readonly reponseAt: Date | null;
  readonly statut: StatutAvis;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Résumés des entités liées exposés avec l'avis (lecture composite, parité legacy).
export interface AvisClientResume {
  readonly id: number;
  readonly nom: string;
  readonly prenom: string | null;
  readonly email: string | null;
}

export interface AvisInterventionResume {
  readonly id: number;
  readonly titre: string;
  readonly dateDebut: Date;
}

// Avis enrichi du client et (optionnellement) de l'intervention liés — tous deux
// scopés au même tenant que l'avis (jointures sous RLS + filtre artisanId).
export interface AvisEnrichi extends Avis {
  readonly client: AvisClientResume | null;
  readonly intervention: AvisInterventionResume | null;
}

// Répartition des notes (1 à 5) + moyenne + total.
export interface AvisStats {
  readonly moyenne: number;
  readonly total: number;
  readonly distribution: {
    readonly 1: number;
    readonly 2: number;
    readonly 3: number;
    readonly 4: number;
    readonly 5: number;
  };
}
