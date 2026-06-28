import type { EmailPort, EmailMessage } from "../ports/email";
import type { IEmailOptoutRepository } from "../../modules/emails/application/email-optout-repository";
import type { AppLogger } from "../ports/logger";
import { ConsoleLogger } from "../ports/logger";

/**
 * Envoie un email lifecycle/marketing avec garde opt-out.
 * - Si l'adresse est en opt-out → skip silencieux (log warn).
 * - Sinon → appelle email.send() avec l'unsubscribeUrl fourni dans le message.
 * Renvoie true si envoyé, false si skippé.
 */
export async function sendLifecycleEmail(
  email: EmailPort,
  optoutRepo: IEmailOptoutRepository,
  message: EmailMessage & { readonly unsubscribeUrl: string },
  log?: AppLogger,
): Promise<boolean> {
  const logger = log ?? new ConsoleLogger();
  if (await optoutRepo.isOptedOut(message.to)) {
    logger.info({ event: "lifecycle_email_skipped_optout", to: message.to }, "Email lifecycle skippé (opt-out)");
    return false;
  }
  await email.send(message);
  return true;
}
