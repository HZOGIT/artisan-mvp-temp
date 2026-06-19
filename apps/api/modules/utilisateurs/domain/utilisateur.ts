/*
 * Gestion des utilisateurs/collaborateurs d'un artisan (tables `users` + `permissions_utilisateur`,
 * toutes deux HORS RLS → l'isolation est portée par un scope EXPLICITE `artisanId` dans chaque requête).
 * Rôles assignables à un collaborateur (PAS `admin` — réservé au staff Operioz).
 */
export type CollaborateurRole = "artisan" | "secretaire" | "technicien";

export interface UtilisateurListItem {
  readonly id: number;
  readonly name: string | null;
  readonly prenom: string | null;
  readonly email: string | null;
  readonly role: string;
  readonly actif: boolean;
  readonly lastSignedIn: Date | null;
  readonly createdAt: Date;
}

export interface InviteInput {
  readonly email: string;
  readonly nom: string;
  readonly prenom?: string;
  readonly role: CollaborateurRole;
}

export interface PermissionsInfo {
  readonly userId: number;
  readonly role: string;
  readonly permissions: string[];
  readonly roleDefaults: string[];
}
