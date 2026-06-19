import { eq } from "drizzle-orm";
import { artisans, users, notifications } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { EmailPort } from "../../../shared/ports/email";
import type { SignatureNotificationType } from "../../signature/application/signature-repository";
import type { SubscriptionEventNotifier } from "../application/subscription-event-notifier";

/*
 * Notifs/emails abonnement (webhook). `notifyArtisan` insère sous le tenant (RLS) ; `emailArtisanOwner`
 * résout `artisans.userId → users.email` (tables identité HORS RLS) puis envoie via l'EmailPort. Les
 * deux sont appelés en best-effort par le use-case (jamais bloquant).
 */
export class SubscriptionEventNotifierDrizzle implements SubscriptionEventNotifier {
  constructor(
    private readonly db: DbClient,
    private readonly email: EmailPort,
  ) {}

  notifyArtisan(artisanId: number, notif: { type: SignatureNotificationType; titre: string; message: string; lien: string }): Promise<void> {
    return withTenant(this.db, { artisanId, userId: 0 }, async (tx) => {
      await tx.insert(notifications).values({ artisanId, type: notif.type, titre: notif.titre, message: notif.message, lien: notif.lien });
    });
  }

  async emailArtisanOwner(artisanId: number, subject: string, html: string): Promise<void> {
    const [a] = await this.db.select({ userId: artisans.userId }).from(artisans).where(eq(artisans.id, artisanId)).limit(1);
    if (!a?.userId) return;
    const [u] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, a.userId)).limit(1);
    if (!u?.email) return;
    await this.email.send({ to: u.email, subject, body: html });
  }
}
