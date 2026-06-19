/*
 * Types de domaine du module modeles-email (modèles d'email réutilisables de l'artisan) —
 * découplés du schéma Drizzle. Table `modeles_email` (RLS sur artisanId). CRUD by-id tenant-scopé.
 * Invariants : isolation cross-tenant ; nom/sujet/contenu non vides ; type ∈ enum ; ⚠️ au plus un
 * modèle `isDefault` par (artisanId, type) — garanti côté write use-case (étape 4/9).
 */

/*
 * Union littérale alignée sur `modeleEmailTypeEnum` (relance_devis, envoi_devis, envoi_facture,
 * rappel_paiement, autre).
 */
export const TYPES_MODELE_EMAIL = ["relance_devis", "envoi_devis", "envoi_facture", "rappel_paiement", "autre"] as const;
export type TypeModeleEmail = (typeof TYPES_MODELE_EMAIL)[number];

export interface ModeleEmail {
  readonly id: number;
  readonly artisanId: number;
  readonly nom: string;
  readonly type: TypeModeleEmail;
  readonly sujet: string;
  readonly contenu: string;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateModeleEmailInput {
  readonly nom: string;
  readonly type: TypeModeleEmail;
  readonly sujet: string;
  readonly contenu: string;
  readonly isDefault?: boolean;
}

export interface UpdateModeleEmailInput {
  readonly nom?: string;
  readonly type?: TypeModeleEmail;
  readonly sujet?: string;
  readonly contenu?: string;
  readonly isDefault?: boolean;
}
