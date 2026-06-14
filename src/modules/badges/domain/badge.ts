// Types de domaine du module badges (gamification : badges définis par l'artisan +
// attribution aux techniciens) — découplés du schéma Drizzle.

export type BadgeCategorie = "interventions" | "avis" | "ca" | "anciennete" | "special";

export interface Badge {
  readonly id: number;
  readonly artisanId: number;
  readonly code: string;
  readonly nom: string;
  readonly description: string | null;
  readonly icone: string | null;
  readonly couleur: string | null;
  readonly categorie: BadgeCategorie;
  readonly condition: string | null;
  readonly seuil: number | null;
  readonly points: number;
  readonly actif: boolean;
  readonly createdAt: Date;
}

// Attribution d'un badge à un technicien. La table n'a pas d'artisanId → l'isolation
// passe par l'appartenance du technicien (et du badge) au tenant (anti-IDOR).
export interface BadgeTechnicien {
  readonly id: number;
  readonly technicienId: number;
  readonly badgeId: number;
  readonly dateObtention: Date;
  readonly valeurAtteinte: number | null;
  readonly notifie: boolean;
}

// Objectif mensuel d'un technicien (gamification : cibles + réalisé). La table a un `artisanId`
// (isolation RLS) mais l'accès passe AUSSI par l'appartenance du technicien au tenant (anti-IDOR,
// données salarié). Montants `numeric` → string ; cibles/réalisés entiers nullable (défaut 0).
export interface ObjectifTechnicien {
  readonly id: number;
  readonly technicienId: number;
  readonly mois: number;
  readonly annee: number;
  readonly objectifInterventions: number | null;
  readonly objectifCA: string | null;
  readonly objectifAvisPositifs: number | null;
  readonly interventionsRealisees: number | null;
  readonly caRealise: string | null;
  readonly avisPositifsObtenus: number | null;
  readonly pointsGagnes: number | null;
}

export interface CreateBadgeInput {
  readonly code: string;
  readonly nom: string;
  readonly description?: string | null;
  readonly icone?: string | null;
  readonly couleur?: string | null;
  readonly categorie?: BadgeCategorie;
  readonly condition?: string | null;
  readonly seuil?: number | null;
  readonly points?: number;
  readonly actif?: boolean;
}

export interface UpdateBadgeInput {
  readonly nom?: string;
  readonly description?: string | null;
  readonly icone?: string | null;
  readonly couleur?: string | null;
  readonly categorie?: BadgeCategorie;
  readonly condition?: string | null;
  readonly seuil?: number | null;
  readonly points?: number;
  readonly actif?: boolean;
}
