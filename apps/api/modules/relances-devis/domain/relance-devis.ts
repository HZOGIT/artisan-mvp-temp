// Types de domaine du module relances-devis (historique/journal des relances envoyées pour un
// devis) — découplés du schéma Drizzle. Table `relances_devis` (RLS sur artisanId). C'est un
// **journal append-only** : une relance enregistre un événement d'envoi (email/notification) et son
// résultat (envoyé/échec) ; elle est **immuable** (aucune mise à jour). `devisId` est anti-IDOR-FK
// (le devis doit appartenir au tenant).

// Tuples alignés sur les enums Drizzle (`relanceTypeEnum` / `relanceStatutEnum`) — réutilisés pour
// la validation use-case et les bornes zod du routeur (z.enum).
export const TYPES_RELANCE = ["email", "notification"] as const;
export const STATUTS_RELANCE = ["envoye", "echec"] as const;
export type RelanceType = (typeof TYPES_RELANCE)[number];
export type RelanceStatut = (typeof STATUTS_RELANCE)[number];

export interface RelanceDevis {
  readonly id: number;
  readonly devisId: number;
  readonly artisanId: number;
  readonly type: RelanceType;
  readonly destinataire: string | null;
  readonly message: string | null;
  readonly statut: RelanceStatut;
  readonly createdAt: Date;
}

// Entrée de création (enregistrement d'un événement de relance). `statut` reflète le résultat de
// l'envoi (défaut "envoye") ; `artisanId` est posé par l'infra (scopé tenant). Pas d'`UpdateInput` :
// une relance est immuable (audit log append-only).
export interface CreateRelanceInput {
  readonly devisId: number;
  readonly type: RelanceType;
  readonly destinataire?: string | null;
  readonly message?: string | null;
  readonly statut?: RelanceStatut;
}
