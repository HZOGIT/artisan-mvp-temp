/*
 * Types de domaine du module devis (commercial/financier) — découplés du schéma Drizzle.
 * ⚠️ Domaine financier SENSIBLE : montants/TVA exacts (decimal/string ; totalTTC = totalHT +
 * totalTVA), numérotation maîtrisée côté serveur, **immutabilité post-signature** (un devis
 * accepté/envoyé ne se modifie plus librement → porté par les use-cases d'écriture), isolation
 * cross-tenant, anti-IDOR-FK (clientId du tenant). Le calcul des totaux à partir des lignes, les
 * transitions de statut et la conversion en facture sont portés aux étapes ultérieures.
 * 
 * NB : `devis` et `devis_lignes` sont en camelCase côté colonnes (artisanId, totalHT…), mais les
 * lignes (`devis_lignes`) n'ont PAS d'artisanId → elles sont scopées via l'appartenance du devis
 * parent au tenant (cf. pattern commandes/lignes).
 */

export type DevisStatut = "brouillon" | "envoye" | "accepte" | "refuse" | "expire";
export type LigneType = "produit" | "section" | "note";

export interface DevisLigne {
  readonly id: number;
  readonly devisId: number;
  readonly ordre: number;
  readonly reference: string | null;
  readonly designation: string;
  readonly description: string | null;
  /** numeric PG en string */
  readonly quantite: string;
  readonly unite: string;
  readonly prixUnitaireHT: string;
  readonly tauxTVA: string;
  readonly tvaCategorieId: string | null;
  readonly remise: string;
  readonly montantHT: string;
  readonly montantTVA: string;
  readonly montantTTC: string;
  readonly type: LigneType;
}

export interface Devis {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly numero: string;
  readonly dateDevis: Date;
  readonly dateValidite: Date | null;
  readonly dateVue: Date | null;
  readonly statut: DevisStatut;
  readonly objet: string | null;
  readonly referenceClient: string | null;
  readonly conditionsPaiement: string | null;
  readonly notes: string | null;
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly totalTTC: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/*
 * Entrée de création (niveau repo) : `numero` est fourni par le use-case (généré serveur via
 * `nextNumero`), jamais par le client. `statut` (brouillon) et les totaux (0) sont des défauts
 * posés par l'infra.
 */
export interface CreateDevisInput {
  readonly clientId: number;
  readonly numero: string;
  readonly objet?: string | null;
  readonly referenceClient?: string | null;
  readonly conditionsPaiement?: string | null;
  readonly notes?: string | null;
  readonly dateValidite?: Date | null;
}

/*
 * Entrée de modification : ⚠️ `clientId` (client immuable), `numero` (numérotation maîtrisée),
 * `statut` (transitions = workflow) et `totalHT/TVA/TTC` (dérivés des lignes) sont ABSENTS — ils
 * ne passent pas par un `update` de métadonnées.
 */
export interface UpdateDevisInput {
  readonly objet?: string | null;
  readonly referenceClient?: string | null;
  readonly conditionsPaiement?: string | null;
  readonly notes?: string | null;
  readonly dateValidite?: Date | null;
}

export interface CreateDevisLigneInput {
  readonly designation: string;
  readonly prixUnitaireHT: string;
  readonly quantite?: string;
  readonly unite?: string;
  readonly tauxTVA?: string;
  readonly tvaCategorieId?: string | null;
  readonly reference?: string | null;
  readonly description?: string | null;
  readonly ordre?: number;
  readonly type?: LigneType;
  readonly remise?: string;
}

export interface UpdateDevisLigneInput {
  readonly designation?: string;
  readonly prixUnitaireHT?: string;
  readonly quantite?: string;
  readonly unite?: string;
  readonly tauxTVA?: string;
  readonly tvaCategorieId?: string | null;
  readonly reference?: string | null;
  readonly description?: string | null;
  readonly ordre?: number;
  readonly type?: LigneType;
  readonly remise?: string;
}
