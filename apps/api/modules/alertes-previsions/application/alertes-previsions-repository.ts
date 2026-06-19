import type { TenantContext } from "../../../shared/tenant";
import type { AlerteConfig, AlerteHistorique, AlerteType, AlerteCanal, AlerteStatut, SaveAlerteConfigInput } from "../domain/alerte-prevision";

/** Données à insérer dans l'historique (valeurs déjà calculées par le use-case). */
export interface InsertHistoriqueData {
  readonly mois: number;
  readonly annee: number;
  readonly typeAlerte: AlerteType;
  readonly caPrevisionnel: string;
  readonly caRealise: string;
  readonly ecartPourcentage: string;
  readonly canalEnvoi: AlerteCanal;
  readonly statut: AlerteStatut;
  readonly message: string;
}

/*
 * Port du repository alertes-prévisions. Tables `config_alertes_previsions` /
 * `historique_alertes_previsions` SOUS RLS (artisanId via app.tenant) — l'impl Drizzle scope via
 * `withTenant`. `previsions_ca` + `factures` (RLS aussi) servent au calcul de l'écart.
 */
export interface IAlertesPrevisionsRepository {
  getConfig(ctx: TenantContext): Promise<AlerteConfig | null>;
  upsertConfig(ctx: TenantContext, patch: SaveAlerteConfigInput): Promise<AlerteConfig | null>;
  listHistorique(ctx: TenantContext): Promise<AlerteHistorique[]>;
  /** CA prévisionnel du mois (depuis previsions_ca) — null si pas de prévision. */
  getPrevisionCA(ctx: TenantContext, mois: number, annee: number): Promise<number | null>;
  /** CA réalisé du mois = Σ TTC des factures `payee` dont dateFacture ∈ [1er, dernier jour]. */
  getCaRealiseMois(ctx: TenantContext, mois: number, annee: number): Promise<number>;
  /** Une alerte du même type a-t-elle déjà été enregistrée ce mois (anti-spam) ? */
  historiqueExiste(ctx: TenantContext, mois: number, annee: number, typeAlerte: AlerteType): Promise<boolean>;
  /** Insère une ligne d'historique et renvoie la ligne créée. */
  insertHistorique(ctx: TenantContext, data: InsertHistoriqueData): Promise<AlerteHistorique>;
}
