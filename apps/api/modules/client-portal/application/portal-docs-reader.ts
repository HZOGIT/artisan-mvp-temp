import type { TenantContext } from "../../../shared/tenant";

/*
 * Sous-ensembles « client-safe » des documents exposés dans l'espace client (parité legacy : on
 * n'expose QUE des champs sûrs — ex. les `notes` internes des contrats sont EXCLUES).
 */
export interface PortalDevis {
  readonly id: number;
  readonly numero: string;
  readonly objet: string | null;
  readonly totalTTC: string | null;
  readonly statut: string | null;
  readonly dateCreation: Date;
  readonly tokenSignature: string | null;
}

export interface PortalFacture {
  readonly id: number;
  readonly numero: string | null;
  readonly objet: string | null;
  readonly totalTTC: string | null;
  readonly statut: string | null;
  readonly dateCreation: Date;
  readonly dateEcheance: Date | null;
  readonly lienPaiement: string | null;
}

export interface PortalIntervention {
  readonly id: number;
  readonly titre: string;
  readonly description: string | null;
  readonly dateIntervention: Date;
  readonly statut: string | null;
  readonly adresse: string | null;
}

export interface PortalContrat {
  readonly id: number;
  readonly reference: string;
  readonly titre: string;
  readonly description: string | null;
  readonly type: string | null;
  readonly montantHT: string | null;
  readonly tauxTVA: string | null;
  readonly periodicite: string | null;
  readonly dateDebut: Date;
  readonly dateFin: Date | null;
  readonly reconduction: boolean | null;
  readonly prochainPassage: Date | null;
  readonly conditionsParticulieres: string | null;
  readonly statut: string | null;
}

export interface PortalDevisOptionLigne {
  readonly id: number;
  readonly designation: string;
  readonly quantite: string | null;
  readonly unite: string | null;
  readonly prixUnitaireHT: string | null;
  readonly montantTTC: string | null;
}

export interface PortalDevisOption {
  readonly id: number;
  readonly nom: string;
  readonly description: string | null;
  readonly ordre: number;
  readonly totalHT: string;
  readonly totalTTC: string;
  readonly recommandee: boolean;
  readonly selectionnee: boolean;
  readonly lignes: PortalDevisOptionLigne[];
}

/*
 * Port de lecture des documents du client pour le portail. Toutes les lectures sont SCOPÉES au tenant
 * résolu (artisanId) ET filtrées par `clientId` (anti-IDOR : un client ne voit QUE ses documents).
 */
export interface IPortalDocsReader {
  listDevis(ctx: TenantContext, clientId: number): Promise<PortalDevis[]>;
  listFactures(ctx: TenantContext, clientId: number): Promise<PortalFacture[]>;
  listInterventions(ctx: TenantContext, clientId: number): Promise<PortalIntervention[]>;
  listContrats(ctx: TenantContext, clientId: number): Promise<PortalContrat[]>;
  /** Anti-IDOR : vérifie que le devis appartient au clientId avant de lire ses options. */
  getOptionsDevis(ctx: TenantContext, clientId: number, devisId: number): Promise<PortalDevisOption[]>;
}
