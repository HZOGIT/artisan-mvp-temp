import { and, desc, eq } from "drizzle-orm";
import { artisans, clients, clientPortalAccess } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { EmailPort } from "../../../shared/ports/email";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { TenantContext } from "../../../shared/tenant";
import type { Conversation } from "../domain/chat";
import { buildNewMessageEmail } from "../domain/chat";
import type { ChatClientNotifier } from "../application/chat-repository";

/*
 * Notifie le client par email lors d'un nouveau message artisan (parité legacy `sendMessage`).
 * Best-effort + non bloquant : lit le client (scopé tenant), le lien portail actif, applique le
 * rate-limit anti-spam (`chat:<artisanId>`, 20/15 min), puis envoie via l'EmailPort. ⚠️ L'EmailPort
 * du new-stack ne porte pas fromName/replyTo (parité acceptable, comme les autres emails migrés).
 */
export class ChatClientNotifierDrizzle implements ChatClientNotifier {
  constructor(
    private readonly db: DbClient,
    private readonly email: EmailPort,
    private readonly rateLimiter: RateLimiterPort,
    private readonly appUrl: string,
  ) {}

  async notifyNewMessage(ctx: TenantContext, conversation: Conversation, contenu: string): Promise<void> {
    const data = await withTenant(this.db, ctx, async (tx) => {
      const [client] = await tx
        .select({ email: clients.email, prenom: clients.prenom, nom: clients.nom })
        .from(clients)
        .where(and(eq(clients.id, conversation.clientId), eq(clients.artisanId, ctx.artisanId)))
        .limit(1);
      if (!client?.email) return null;
      const [artisan] = await tx.select({ nomEntreprise: artisans.nomEntreprise }).from(artisans).where(eq(artisans.id, ctx.artisanId)).limit(1);
      const [portal] = await tx
        .select({ token: clientPortalAccess.token })
        .from(clientPortalAccess)
        .where(and(eq(clientPortalAccess.clientId, conversation.clientId), eq(clientPortalAccess.artisanId, ctx.artisanId), eq(clientPortalAccess.isActive, true)))
        .orderBy(desc(clientPortalAccess.createdAt))
        .limit(1);
      return {
        email: client.email,
        clientName: client.prenom || client.nom || "",
        artisanName: artisan?.nomEntreprise ?? "",
        portalLink: portal?.token ? `${this.appUrl}/portail/${portal.token}` : null,
      };
    });
    /** pas d'email client → rien à envoyer */
    if (!data) return;

    /** Anti-spam : au-delà du quota, on saute l'email (le message in-app reste créé). Parité legacy. */
    if (!(await this.rateLimiter.check(`chat:${ctx.artisanId}`))) return;

    const { subject, body } = buildNewMessageEmail({ clientName: data.clientName, artisanName: data.artisanName, contenu, portalLink: data.portalLink });
    await this.email.send({ to: data.email, subject, body });
  }
}
