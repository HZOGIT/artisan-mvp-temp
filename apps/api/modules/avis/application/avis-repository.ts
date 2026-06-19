import type { TenantContext } from "../../../shared/tenant";
import type { Avis, AvisEnrichi, AvisStats, StatutAvis } from "../domain/avis";

/*
 * Port du repository avis. Chaque méthode exige le TenantContext (scope tenant + RLS).
 * Gestion des avis côté artisan : consultation, statistiques, réponse, modération de statut.
 */
export interface IAvisRepository {
  list(ctx: TenantContext): Promise<Avis[]>;
  /** Liste enrichie du client + intervention liés (résumés), scopée tenant (jointures RLS). */
  listEnrichi(ctx: TenantContext): Promise<AvisEnrichi[]>;
  getById(ctx: TenantContext, id: number): Promise<Avis | null>;
  getStats(ctx: TenantContext): Promise<AvisStats>;

  /** Réponse de l'artisan à un avis (modération). null si l'avis n'appartient pas au tenant. */
  repondre(ctx: TenantContext, id: number, reponse: string): Promise<Avis | null>;
  /** Change le statut (publie/masque/en_attente). null si hors tenant. */
  changerStatut(ctx: TenantContext, id: number, statut: StatutAvis): Promise<Avis | null>;
}
