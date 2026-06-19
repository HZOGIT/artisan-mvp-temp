import type { TenantContext } from "../../../shared/tenant";
import type { CreneauOccupe } from "../domain/portal-scheduling";

export interface PortalRdv {
  readonly id: number;
  readonly titre: string;
  readonly description: string | null;
  readonly dateProposee: Date;
  readonly dureeEstimee: number | null;
  readonly statut: string | null;
  readonly motifRefus: string | null;
  readonly urgence: string | null;
  readonly createdAt: Date;
}

export interface CreateRdvData {
  readonly clientId: number;
  readonly titre: string;
  readonly description?: string;
  readonly urgence: string;
  readonly dateProposee: Date;
  readonly dureeEstimee: number;
}

export interface PortalChantierEtape {
  readonly id: number;
  readonly titre: string;
  readonly description: string | null;
  readonly statut: string | null;
  readonly pourcentage: number | null;
  readonly ordre: number | null;
  /** Colonnes `date` (Drizzle mode string) — conservées telles quelles (parité). */
  readonly dateDebut: string | null;
  readonly dateFin: string | null;
  readonly commentaire: string | null;
}

export interface PortalChantier {
  readonly id: number;
  readonly reference: string | null;
  readonly nom: string;
  readonly description: string | null;
  readonly adresse: string | null;
  readonly statut: string | null;
  readonly avancement: number | null;
  readonly dateDebut: string | null;
  readonly dateFinPrevue: string | null;
  readonly etapes: readonly PortalChantierEtape[];
}

/*
 * Port de planification du portail (RDV + chantiers). Lectures/écritures SCOPÉES tenant (artisanId
 * résolu) + filtrées par `clientId`. Le suivi de chantier n'est lu QUE pour les chantiers du client
 * (anti-IDOR via le chantier parent) et limité aux étapes `visibleClient`.
 */
export interface IPortalSchedulingReader {
  /** Occupations (interventions non annulées + RDV en attente/confirmés) sur la fenêtre. */
  getCreneauxOccupes(ctx: TenantContext, debut: Date, fin: Date): Promise<CreneauOccupe[]>;
  createRdv(ctx: TenantContext, data: CreateRdvData): Promise<PortalRdv>;
  getRdvByClient(ctx: TenantContext, clientId: number): Promise<PortalRdv[]>;
  /** Chantiers du client + étapes visibles client. */
  getChantiersWithSuivi(ctx: TenantContext, clientId: number): Promise<PortalChantier[]>;
}
