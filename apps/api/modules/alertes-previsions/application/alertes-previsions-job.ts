import { dailyKey } from "../../../platform/scheduler/scheduler-types";
import type { JobDefinition } from "../../../platform/scheduler/scheduler-types";
import type { IAlertesPrevisionsRepository } from "./alertes-previsions-repository";
import { verifierEtEnvoyer } from "./use-cases";
import type { EmailPort } from "../../../shared/ports/email";
import type { SmsPort } from "../../../shared/ports/sms";

export interface AlertesPrevisionsJobDeps {
  readonly repo: IAlertesPrevisionsRepository;
  readonly email: EmailPort;
  readonly sms?: SmsPort;
  /** Renvoie tous les artisanIds à vérifier (table sans RLS). */
  readonly listArtisanIds: () => Promise<number[]>;
}

/**
 * Job idempotent de vérification des prévisions CA et envoi des alertes.
 * Clé daily — un seul tick par jour. L'anti-spam mensuel est dans `verifierEtEnvoyer`
 * (une seule alerte de chaque type par mois par artisan). Erreurs isolées par artisan.
 * Corrige le bug « alertes jamais envoyées » : l'envoi email/SMS était manquant.
 */
export function createAlertesPrevisionsJob(deps: AlertesPrevisionsJobDeps): JobDefinition {
  return {
    name: "alertes-previsions",
    periodKey: dailyKey,
    async run() {
      const artisanIds = await deps.listArtisanIds();
      for (const artisanId of artisanIds) {
        const ctx = { artisanId, userId: 0 } as const;
        try {
          const alertes = await verifierEtEnvoyer(deps.repo, ctx);
          if (alertes.length === 0) continue;
          const config = await deps.repo.getConfig(ctx);
          if (!config) continue;
          for (const alerte of alertes) {
            if ((alerte.canalEnvoi === "email" || alerte.canalEnvoi === "les_deux") && config.emailDestination) {
              await deps.email.send({ to: config.emailDestination, subject: "Alerte prévisions CA Operioz", body: alerte.message ?? "" });
            }
            if ((alerte.canalEnvoi === "sms" || alerte.canalEnvoi === "les_deux") && config.telephoneDestination && deps.sms) {
              await deps.sms.send({ to: config.telephoneDestination, message: alerte.message ?? "" });
            }
          }
        } catch {
          /* ponytail: best-effort par artisan */
        }
      }
    },
  };
}
