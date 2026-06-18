import type { TenantContext } from "../../../shared/tenant";
import type { IStockRepository } from "./stock-repository";
import type { INotificationRepository } from "../../notifications/application/notification-repository";

// Génération des alertes de stock bas (parité legacy `generateAlerts`). **Cross-domaine** : lit les
// stocks sous le seuil (domaine stocks) et crée une notification « Stock bas » par item (domaine
// notifications, repo composé). Scopé tenant des deux côtés (le `TenantContext` est propagé).
//
// ⚠️ Behavior-preserving : le legacy ne déduplique PAS (lien constant `/stocks`) → un appel crée
// une notification par stock bas (`alertsCreated = nb de stocks bas`), même si on en a déjà créé.
export interface GenererAlertesResult {
  readonly alertsCreated: number;
}

export async function genererAlertesStock(
  stockRepo: IStockRepository,
  notificationRepo: INotificationRepository,
  ctx: TenantContext,
): Promise<GenererAlertesResult> {
  const stocksBas = await stockRepo.listLowStock(ctx);
  let alertsCreated = 0;
  for (const s of stocksBas) {
    await notificationRepo.creer(ctx, {
      type: "alerte",
      titre: "Stock bas",
      message: `L'article "${s.designation}" (${s.reference}) est en stock bas: ${s.quantiteEnStock} ${s.unite} (seuil: ${s.seuilAlerte})`,
      lien: "/stocks",
    });
    alertsCreated++;
  }
  return { alertsCreated };
}
