import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type {
  CreatePrevisionInput,
  PrevisionCA,
  UpdatePrevisionInput,
  HistoriqueCA,
  UpsertHistoriqueInput,
  UpsertPrevisionInput,
} from "../domain/prevision-ca";

/*
 * Port du repository previsions-ca (prévisions de CA par période). Chaque méthode exige le
 * TenantContext (scope tenant + RLS). `previsions_ca` possède un `artisanId` → double cloisonnement
 * RLS + filtre. Pas de contrainte d'unicité DB (plusieurs prévisions par période possibles). L'update
 * ne touche que les montants/méthode/confiance (mois/annee immuables).
 */
export interface IPrevisionCARepository {
  withDb(db: DbClient): IPrevisionCARepository;
  list(ctx: TenantContext): Promise<PrevisionCA[]>;
  /** Prévisions du tenant pour une année donnée ; [] si aucune. */
  listByAnnee(ctx: TenantContext, annee: number): Promise<PrevisionCA[]>;
  /** null si la prévision n'appartient pas au tenant. */
  getById(ctx: TenantContext, id: number): Promise<PrevisionCA | null>;
  create(ctx: TenantContext, input: CreatePrevisionInput): Promise<PrevisionCA>;
  /** Met à jour les montants/méthode/confiance (jamais mois/annee). null si hors tenant. */
  update(ctx: TenantContext, id: number, input: UpdatePrevisionInput): Promise<PrevisionCA | null>;
  /** false si la prévision n'appartient pas au tenant. */
  delete(ctx: TenantContext, id: number): Promise<boolean>;

  /*
   * Historique de CA mensuel agrégé du tenant (table `historique_ca`), trié récent d'abord, borné
   * aux `nombreMois` derniers mois. [] si aucun historique.
   */
  listHistorique(ctx: TenantContext, nombreMois: number): Promise<HistoriqueCA[]>;
  /** Historique de CA d'une année donnée (pour la comparaison prévu vs réalisé). [] si aucun. */
  listHistoriqueAnnee(ctx: TenantContext, annee: number): Promise<HistoriqueCA[]>;
  /** Upsert d'une ligne d'historique de CA (delete+insert par (artisan,mois,annee) ; artisanId forcé). */
  upsertHistorique(ctx: TenantContext, entry: UpsertHistoriqueInput): Promise<void>;
  /** Upsert d'une prévision calculée (delete+insert par (artisan,mois,annee) ; artisanId forcé). */
  upsertPrevision(ctx: TenantContext, entry: UpsertPrevisionInput): Promise<void>;
}
