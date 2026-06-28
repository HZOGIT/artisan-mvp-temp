import type { TenantContext } from "../../../shared/tenant";

/*
 * Port de LECTURE du domaine factures, vu depuis ecritures (génération FEC). On évite le couplage
 * inter-modules : ecritures dépend d'une **abstraction de lecture minimale** (modèles propres),
 * pas du module factures. L'impl Drizzle lit `factures`/`factures_lignes` (RLS) ; un fake sert
 * aux tests. Tout est scopé tenant (→ null/[] hors tenant).
 */

export interface FactureReadModel {
  readonly id: number;
  readonly artisanId: number;
  readonly numero: string | null;
  readonly dateFacture: Date;
  /** "facture" | "avoir" */
  readonly typeDocument: string;
  /** brouillon|validee|envoyee|payee|en_retard|annulee */
  readonly statut: string;
  readonly datePaiement: Date | null;
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly totalTTC: string;
  readonly regimeTVA?: string | null;
}

export interface FactureLigneReadModel {
  readonly tauxTVA: string;
  readonly montantTVA: string;
}

export interface IFactureReader {
  /** null si la facture n'appartient pas au tenant. */
  getFacture(ctx: TenantContext, factureId: number): Promise<FactureReadModel | null>;
  /** [] si la facture n'appartient pas au tenant (scope via la facture parente). */
  getLignes(ctx: TenantContext, factureId: number): Promise<FactureLigneReadModel[]>;
}
