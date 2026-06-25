import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { pushSubscriptions } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../db";

export interface PushPort {
  subscribe(artisanId: number, endpoint: string, keys: { p256dh: string; auth: string }): Promise<void>;
  unsubscribe(artisanId: number, endpoint: string): Promise<void>;
  sendToUser(artisanId: number, payload: { title: string; body: string }): Promise<void>;
  getPublicKey(): string | null;
}

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? null;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? null;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:support@operioz.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/*
 * Adapter web-push. `technicienId` dans la table legacy = artisanId dans le new-stack
 * (table jamais alimentée jusqu'ici, réutilisation sémantique sans migration).
 * Envoi best-effort via `Promise.allSettled` : un échec d'une sub n'en bloque pas d'autres.
 * No-op silencieux si VAPID non configuré (dev/staging sans clés).
 */
export class WebPushAdapter implements PushPort {
  constructor(private readonly db: DbClient) {}

  getPublicKey(): string | null {
    return VAPID_PUBLIC_KEY;
  }

  async subscribe(artisanId: number, endpoint: string, keys: { p256dh: string; auth: string }): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.technicienId, artisanId), eq(pushSubscriptions.endpoint, endpoint)));
    await this.db.insert(pushSubscriptions).values({ technicienId: artisanId, endpoint, p256dh: keys.p256dh, auth: keys.auth });
  }

  async unsubscribe(artisanId: number, endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.technicienId, artisanId), eq(pushSubscriptions.endpoint, endpoint)));
  }

  async sendToUser(artisanId: number, payload: { title: string; body: string }): Promise<void> {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
    const subs = await this.db
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.technicienId, artisanId), eq(pushSubscriptions.actif, true)));
    await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload)),
      ),
    );
  }
}
