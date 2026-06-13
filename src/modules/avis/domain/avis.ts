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
