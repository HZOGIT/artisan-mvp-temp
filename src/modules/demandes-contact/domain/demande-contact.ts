// Types de domaine du module demandes-contact (inbox CRM des demandes de contact reçues via la
// vitrine publique) — découplés du schéma Drizzle. Table `demandes_contact` (RLS sur artisanId).
// Gestion côté artisan : list, suivi du statut, conversion en client. La création publique (formulaire
// vitrine) est un bounded context séparé. Statut initial "nouveau" non usurpable ; transitions
// maîtrisées ; `clientId` lié à la conversion (anti-IDOR-FK).

export type DemandeContactStatut = "nouveau" | "contacte" | "converti" | "perdu";

export interface DemandeContact {
  readonly id: number;
  readonly artisanId: number;
  readonly nom: string;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly message: string | null;
  readonly source: string;
  readonly statut: DemandeContactStatut;
  readonly clientId: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Entrée de création (saisie manuelle côté artisan, ou normalisée depuis la vitrine). `statut`
// ("nouveau") et `clientId` (null) sont posés par l'infra ; jamais fournis par l'appelant.
export interface CreateDemandeInput {
  readonly nom: string;
  readonly email?: string | null;
  readonly telephone?: string | null;
  readonly message?: string | null;
  readonly source?: string;
}

// Update des métadonnées. ⚠️ `statut`/`clientId` ABSENTS : statut via transitions dédiées (7/9),
// clientId via la conversion.
export interface UpdateDemandeInput {
  readonly nom?: string;
  readonly email?: string | null;
  readonly telephone?: string | null;
  readonly message?: string | null;
  readonly source?: string;
}
