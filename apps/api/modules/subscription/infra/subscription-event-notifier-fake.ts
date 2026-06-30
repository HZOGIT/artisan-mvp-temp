import type { SignatureNotificationType } from "../../signature/application/signature-repository";
import type { EmailAttachment } from "../../../shared/ports/email";
import type { SubscriptionEventNotifier } from "../application/subscription-event-notifier";

/** Notifier fake (in-memory) pour les tests des use-cases webhook abonnement. */
export class FakeSubscriptionEventNotifier implements SubscriptionEventNotifier {
  public notifs: Array<{ artisanId: number; type: SignatureNotificationType; titre: string }> = [];
  public emails: Array<{ artisanId: number; subject: string; attachments: readonly EmailAttachment[] }> = [];

  async notifyArtisan(artisanId: number, notif: { type: SignatureNotificationType; titre: string; message: string; lien: string }): Promise<void> {
    this.notifs.push({ artisanId, type: notif.type, titre: notif.titre });
  }
  async emailArtisanOwner(artisanId: number, subject: string, _html?: string, attachments?: readonly EmailAttachment[]): Promise<void> {
    this.emails.push({ artisanId, subject, attachments: attachments ?? [] });
  }
}
