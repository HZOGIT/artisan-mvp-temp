import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { INotificationRepository } from "./notification-repository";

/*
 * Use-cases d'écriture — purs, repository injecté. Le tenant est porté par le ctx ; une
 * opération sur une notification hors tenant (repo → false) lève NotFoundError (anti-IDOR).
 */

export async function marquerLue(repo: INotificationRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.markAsRead(ctx, id);
  if (!ok) throw new NotFoundError("Notification introuvable");
}

/** Marque toutes les notifications du tenant comme lues ; renvoie le nombre affecté. */
export function marquerToutesLues(repo: INotificationRepository, ctx: TenantContext): Promise<number> {
  return repo.markAllAsRead(ctx);
}

export async function archiver(repo: INotificationRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.archive(ctx, id);
  if (!ok) throw new NotFoundError("Notification introuvable");
}
