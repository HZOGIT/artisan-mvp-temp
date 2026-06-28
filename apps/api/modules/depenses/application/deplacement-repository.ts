import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";

export interface Trajet {
  readonly id: number;
  readonly technicienId: number;
  readonly interventionId: number | null;
  readonly dateDebut: Date;
  readonly distanceKm: string | null;
  readonly adresseDepart: string | null;
  readonly adresseArrivee: string | null;
  readonly depenseId: number | null;
}

/**
 * Port du repository trajets (historique_deplacements). Accès scopé au tenant via JOIN techniciens
 * (la table n'a pas de RLS propre — isolation garantie par la FK technicienId + RLS techniciens).
 */
export interface IDeplacementRepository {
  /** null si le trajet n'appartient pas au tenant (technicien hors tenant). */
  getParTenant(ctx: TenantContext, id: number): Promise<Trajet | null>;
  /** Trajets du tenant triés par date décroissante. */
  listParTenant(ctx: TenantContext): Promise<Trajet[]>;
  /** Marque le trajet comme converti en dépense. Scopé tenant (no-op si hors tenant). */
  setDepenseId(ctx: TenantContext, id: number, depenseId: number): Promise<void>;
  withDb(db: DbClient): IDeplacementRepository;
}
