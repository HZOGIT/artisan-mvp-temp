import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository } from "./contrat-repository";
import type { INotificationRepository } from "../../notifications/application/notification-repository";

export async function genererAlertesReconductionContrats(
  contratRepo: IContratRepository,
  notificationRepo: INotificationRepository,
  ctx: TenantContext,
): Promise<{ alertsCreated: number }> {
  const contrats = await contratRepo.listProchaineReconduction(ctx);
  let alertsCreated = 0;
  for (const c of contrats) {
    const dateTerme = c.dateFin;
    const dateResiliation = dateTerme
      ? new Date(dateTerme.getTime() - (c.preavisResiliation ?? 1) * 30 * 86_400_000)
      : null;
    const msg = dateTerme
      ? `Votre contrat d'entretien se reconduit tacitement le ${dateTerme.toLocaleDateString("fr-FR")}. Vous pouvez le résilier jusqu'au ${(dateResiliation ?? dateTerme).toLocaleDateString("fr-FR")}.`
      : `Votre contrat d'entretien arrive à échéance — pensez à confirmer ou résilier.`;
    await notificationRepo.creer(ctx, {
      type: "alerte",
      titre: "Reconduction tacite de contrat (loi Chatel)",
      message: msg,
      lien: `/contrats/${c.id}`,
    });
    await contratRepo.markAlertReconductionSent(ctx, c.id);
    alertsCreated++;
  }
  return { alertsCreated };
}
