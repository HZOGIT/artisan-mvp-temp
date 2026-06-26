import type { TenantContext } from "../../../shared/tenant";
import type { ICommandeRepository } from "./commande-repository";
import type { INotificationRepository } from "../../notifications/application/notification-repository";

export async function genererAlertesRetardLivraison(
  commandeRepo: ICommandeRepository,
  notificationRepo: INotificationRepository,
  ctx: TenantContext,
): Promise<{ alertsCreated: number }> {
  const enRetard = await commandeRepo.listEnRetard(ctx);
  const nonAlertes = enRetard.filter((c) => !c.alerteRetardEnvoyee);
  let alertsCreated = 0;
  for (const c of nonAlertes) {
    const jours = c.dateLivraisonPrevue
      ? Math.max(0, Math.floor((Date.now() - c.dateLivraisonPrevue.getTime()) / 86_400_000))
      : 0;
    await notificationRepo.creer(ctx, {
      type: "alerte",
      titre: "Commande en retard de livraison",
      message: `La commande ${c.numero ?? c.id} est en retard de ${jours} jour(s) — relancez votre fournisseur.`,
      lien: `/commandes/${c.id}`,
    });
    await commandeRepo.markAlerteSent(ctx, c.id);
    alertsCreated++;
  }
  return { alertsCreated };
}
