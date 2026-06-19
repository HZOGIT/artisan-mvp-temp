import type { TenantContext } from "../../../shared/tenant";

/*
 * Port de LECTURE du domaine devis, vu depuis factures (conversion devis→facture). On évite le
 * couplage inter-modules : factures dépend d'une **abstraction de lecture minimale** (modèles
 * propres), pas du module devis. L'impl Drizzle lit `devis`/`devis_lignes` (RLS) ; un fake sert
 * aux tests. Tout est scopé tenant (→ null/[] hors tenant : anti-IDOR-FK).
 */

export interface DevisReadModel {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly numero: string;
  /** "brouillon" | "envoye" | "accepte" | "refuse" | "expire" */
  readonly statut: string;
  readonly objet: string | null;
  readonly referenceClient: string | null;
  readonly conditionsPaiement: string | null;
  readonly notes: string | null;
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly totalTTC: string;
}

export interface DevisLigneReadModel {
  readonly ordre: number;
  readonly reference: string | null;
  readonly designation: string;
  readonly description: string | null;
  readonly quantite: string;
  readonly unite: string;
  readonly prixUnitaireHT: string;
  readonly tauxTVA: string;
  readonly montantHT: string;
  readonly montantTVA: string;
  readonly montantTTC: string;
  /** "produit" | "section" | "note" */
  readonly type: string;
}

export interface IDevisReader {
  /** null si le devis n'appartient pas au tenant. */
  getDevis(ctx: TenantContext, devisId: number): Promise<DevisReadModel | null>;
  /** [] si le devis n'appartient pas au tenant (scope via le devis parent). */
  getLignes(ctx: TenantContext, devisId: number): Promise<DevisLigneReadModel[]>;
}
