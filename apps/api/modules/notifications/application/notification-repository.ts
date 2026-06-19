import type { TenantContext } from "../../../shared/tenant";
import type { Notification, ListNotificationsOptions } from "../domain/notification";
import type { FactureEnRetard, CreerNotificationInput } from "../domain/facture-en-retard";

/*
 * Port du repository notifications. Chaque méthode exige le TenantContext (scope tenant +
 * RLS). `notifications` possède un `artisanId` → double cloisonnement RLS + filtre.
 * Invariant anti-IDOR : marquer-lu / archiver une notification d'un autre artisan échoue
 * (false), jamais d'effet cross-tenant.
 */
export interface INotificationRepository {
  list(ctx: TenantContext, options?: ListNotificationsOptions): Promise<Notification[]>;
  countUnread(ctx: TenantContext): Promise<number>;
  /** Marque une notification comme lue — false si elle n'appartient pas au tenant. */
  markAsRead(ctx: TenantContext, id: number): Promise<boolean>;
  /** Marque toutes les notifications du tenant comme lues — renvoie le nombre affecté. */
  markAllAsRead(ctx: TenantContext): Promise<number>;
  /** Archive une notification — false si elle n'appartient pas au tenant. */
  archive(ctx: TenantContext, id: number): Promise<boolean>;

  /*
   * Factures impayées en retard du tenant (lecture seule, scopé artisanId + RLS) :
   * statut hors payee/annulee et échéance dépassée. Sert à générer des rappels.
   */
  listFacturesEnRetard(ctx: TenantContext): Promise<FactureEnRetard[]>;
  /** Une notification active (non archivée) avec ce lien existe-t-elle déjà ? (idempotence des rappels) */
  existeNotificationActive(ctx: TenantContext, lien: string): Promise<boolean>;
  /** Crée une notification pour le tenant (insert scopé artisanId). */
  creer(ctx: TenantContext, input: CreerNotificationInput): Promise<Notification>;
}
