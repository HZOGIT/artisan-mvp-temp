/*
 * Types de domaine du module modeles-devis (modèles/trames de devis réutilisables) — découplés du
 * schéma Drizzle. **Agrégat en-tête + lignes** (comme `devis`), mais SANS montants signés ni
 * numérotation : c'est un gabarit, pas une pièce financière. Tables `modeles_devis` (RLS sur
 * artisanId) + `modeles_devis_lignes` (PAS d'artisanId → scopée via le parent `modeleId`, comme
 * `devis_lignes`).
 * 
 * Invariants (étapes ultérieures) : isolation cross-tenant (modèle + lignes via parent) ; artisanId
 * forcé ; validation (nom non vide ; lignes : designation non vide, quantite/prix ≥ 0, tauxTVA &
 * remise ∈ [0,100]) ; ⚠️ `isDefault` unique par artisan (au plus un modèle par défaut, sans
 * dimension type) ; lignes toujours scopées via l'appartenance du modèle parent au tenant.
 */

export interface ModeleDevisLigne {
  readonly id: number;
  readonly modeleId: number;
  readonly articleId: number | null;
  readonly designation: string;
  readonly description: string | null;
  /** numeric PG en string */
  readonly quantite: string;
  readonly unite: string;
  readonly prixUnitaireHT: string;
  readonly tauxTVA: string;
  readonly remise: string;
  readonly ordre: number;
}

export interface ModeleDevis {
  readonly id: number;
  readonly artisanId: number;
  readonly nom: string;
  readonly description: string | null;
  readonly notes: string | null;
  readonly isDefault: boolean;
  readonly lignes: readonly ModeleDevisLigne[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/*
 * Entrée de ligne (création/remplacement). Les défauts PG (unite "unité", quantite "1.00",
 * prix "0.00", tauxTVA "20.00", remise "0.00", ordre 1) sont posés par l'infra si absents.
 */
export interface CreateModeleDevisLigneInput {
  readonly articleId?: number | null;
  readonly designation: string;
  readonly description?: string | null;
  readonly quantite?: string;
  readonly unite?: string;
  readonly prixUnitaireHT?: string;
  readonly tauxTVA?: string;
  readonly remise?: string;
  readonly ordre?: number;
}

export interface CreateModeleDevisInput {
  readonly nom: string;
  readonly description?: string | null;
  readonly notes?: string | null;
  readonly isDefault?: boolean;
  readonly lignes?: readonly CreateModeleDevisLigneInput[];
}

/*
 * Update partiel de l'en-tête ; si `lignes` est fourni → **remplacement complet** des lignes du
 * modèle (sinon les lignes existantes sont conservées).
 */
export interface UpdateModeleDevisInput {
  readonly nom?: string;
  readonly description?: string | null;
  readonly notes?: string | null;
  readonly isDefault?: boolean;
  readonly lignes?: readonly CreateModeleDevisLigneInput[];
}
