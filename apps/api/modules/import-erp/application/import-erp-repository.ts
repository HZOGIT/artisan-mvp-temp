import type { TenantContext } from "../../../shared/tenant";
import type { ClientRef } from "../domain/import";

// Données d'un client importé (parité legacy createClient, champs de l'import).
export interface ImportClientData {
  readonly nom: string;
  readonly prenom?: string;
  readonly email?: string;
  readonly telephone?: string;
  readonly adresse?: string;
  readonly codePostal?: string;
  readonly ville?: string;
  readonly notes?: string;
}

// Devis « léger » importé : montant TTC brut, sans lignes (reprise de données). Numéro généré serveur.
export interface ImportDevisData {
  readonly clientId: number;
  readonly objet: string;
  readonly statut: string;
  readonly dateDevis: Date;
  readonly dateValidite: Date;
  readonly totalTTC: string;
  readonly notes?: string;
}

// Facture « légère » importée : montant TTC brut, sans lignes. Numéro généré serveur.
export interface ImportFactureData {
  readonly clientId: number;
  // Numéro LÉGAL d'origine (autre logiciel) à PRÉSERVER ; si absent/vide → numéro serveur généré.
  readonly numero?: string;
  readonly objet: string;
  readonly statut: string;
  readonly dateFacture: Date;
  readonly dateEcheance: Date;
  readonly datePaiement?: Date;
  readonly modePaiement?: string;
  readonly totalTTC: string;
}

// Port du repository d'import ERP. Tables clients/devis/factures SOUS RLS → l'impl scope via withTenant
// (artisanId). La numérotation devis/facture est générée SERVEUR (mêmes compteurs que la création
// normale). Les insertions sont « légères » (montant TTC brut, pas de lignes ni d'écritures FEC —
// parité legacy : un import n'émet rien, il reprend des données).
export interface IImportErpRepository {
  listClients(ctx: TenantContext): Promise<ClientRef[]>;
  createClient(ctx: TenantContext, data: ImportClientData): Promise<void>;
  createDevisLight(ctx: TenantContext, data: ImportDevisData): Promise<void>;
  createFactureLight(ctx: TenantContext, data: ImportFactureData): Promise<void>;
  // Numéros de facture déjà présents pour le tenant — pour refuser un doublon à l'import (le numéro
  // émis est immuable ; on ne réattribue pas et on ne crée pas deux factures au même numéro).
  listFactureNumeros(ctx: TenantContext): Promise<string[]>;
}
