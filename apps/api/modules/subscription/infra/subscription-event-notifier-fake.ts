import type { SignatureNotificationType } from "../../signature/application/signature-repository";
import type { SubscriptionEventNotifier } from "../application/subscription-event-notifier";

/** Notifier fake (in-memory) pour les tests des use-cases webhook abonnement. */
export class FakeSubscriptionEventNotifier implements SubscriptionEventNotifier {
  public notifs: Array<{ artisanId: number; type: SignatureNotificationType; titre: string }> = [];
  public emails: Array<{ artisanId: number; subject: string }> = [];

  async notifyArtisan(artisanId: number, notif: { type: SignatureNotificationType; titre: string; message: string; lien: string }): Promise<void> {
    this.notifs.push({ artisanId, type: notif.type, titre: notif.titre });
  }
  async emailArtisanOwner(artisanId: number, subject: string): Promise<void> {
    this.emails.push({ artisanId, subject });
  }
}
