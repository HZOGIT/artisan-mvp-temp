import type { TenantContext } from "../../../shared/tenant";
import { round2 } from "../../../shared/money";
import type { INotificationRepository } from "./notification-repository";

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

export interface GenererRappelsResult {
  readonly rappelsCreated: number;
}

/*
 * Génère des notifications de rappel pour les factures impayées en retard du tenant
 * (parité legacy generateOverdueReminders). Lecture seule sur les factures ; les
 * notifications sont créées scopées tenant. **Idempotent** : un rappel n'est pas recréé
 * si une notification active (non archivée) pointe déjà vers la même facture (`lien`).
 * `maintenant` injectable pour des tests déterministes.
 */
export async function genererRappelsFacturesEnRetard(
  repo: INotificationRepository,
  ctx: TenantContext,
  maintenant: () => Date = () => new Date(),
): Promise<GenererRappelsResult> {
  const factures = await repo.listFacturesEnRetard(ctx);
  const now = maintenant().getTime();
  let rappelsCreated = 0;

  for (const f of factures) {
    const lien = `/factures/${f.id}`;
    /** anti-doublon */
    if (await repo.existeNotificationActive(ctx, lien)) continue;
    const joursRetard = Math.max(0, Math.floor((now - f.dateEcheance.getTime()) / MS_PAR_JOUR));
    const montant = round2(Number(f.totalTTC) || 0).toFixed(2);
    await repo.creer(ctx, {
      type: "rappel",
      titre: `Facture ${f.numero ?? ""} en retard`,
      message: `La facture ${f.numero ?? ""} de ${f.clientNom ?? "Client"} est en retard de ${joursRetard} jour(s). Montant: ${montant} €`,
      lien,
    });
    rappelsCreated++;
  }

  return { rappelsCreated };
}
