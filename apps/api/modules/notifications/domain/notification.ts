/*
 * Types de domaine du module notifications (cloche applicative de l'artisan) — découplés
 * du schéma Drizzle.
 */

export type NotificationType = "info" | "alerte" | "rappel" | "succes" | "erreur";

export interface Notification {
  readonly id: number;
  readonly artisanId: number;
  readonly type: NotificationType;
  readonly titre: string;
  readonly message: string | null;
  readonly lien: string | null;
  readonly lu: boolean;
  readonly archived: boolean;
  readonly createdAt: Date;
}

/** Options de listing (filtres + pagination poussés en SQL côté repo). */
export interface ListNotificationsOptions {
  readonly includeArchived?: boolean;
  readonly nonLuesUniquement?: boolean;
  readonly page?: number;
  readonly limit?: number;
}
