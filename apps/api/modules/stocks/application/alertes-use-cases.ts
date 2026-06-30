import type { TenantContext } from "../../../shared/tenant";
import type { IStockRepository } from "./stock-repository";
import type { INotificationRepository } from "../../notifications/application/notification-repository";

/*
 * Génération des alertes de stock bas (cross-domaine stocks → notifications, scopé tenant).
 *
 * Déduplication par article : chaque stock a un lien dédié `/stocks?id=<id>` qui permet de
 * tester `existeNotificationActive` et d'archiver via `archiveByLien`.
 * Réarmement : quand un article repasse au-dessus du seuil, son alerte est archivée — la
 * prochaine descente sous le seuil réémettra une alerte fraîche.
 */
export interface GenererAlertesResult {
  readonly alertsCreated: number;
}

export async function genererAlertesStock(
  stockRepo: IStockRepository,
  notificationRepo: INotificationRepository,
  ctx: TenantContext,
): Promise<GenererAlertesResult> {
  const allStocks = await stockRepo.list(ctx);
  let alertsCreated = 0;
  for (const s of allStocks) {
    const lien = `/stocks?id=${s.id}`;
    const estBas = Number(s.quantiteEnStock) <= Number(s.seuilAlerte);
    if (!estBas) {
      await notificationRepo.archiveByLien(ctx, lien);
      continue;
    }
    const dejaActif = await notificationRepo.existeNotificationActive(ctx, lien);
    if (dejaActif) continue;
    await notificationRepo.creer(ctx, {
      type: "alerte",
      titre: "Stock bas",
      message: `L'article "${s.designation}" (${s.reference}) est en stock bas: ${s.quantiteEnStock} ${s.unite} (seuil: ${s.seuilAlerte})`,
      lien,
    });
    alertsCreated++;
  }
  return { alertsCreated };
}
