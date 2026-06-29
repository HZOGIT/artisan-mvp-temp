import { eq } from "drizzle-orm";
import { artisans, emailsLog } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { EmailPort } from "../../../shared/ports/email";
import type { IEmailOptoutRepository } from "../../emails/application/email-optout-repository";
import type { IClientRepository } from "./client-repository";
import type { TenantContext } from "../../../shared/tenant";
import { signUnsubscribeToken } from "../../../shared/email/unsubscribe-token";
import { ValidationError } from "../../../shared/errors";

const MAX_DESTINATAIRES = 200;

export interface EnvoyerMessageInput {
  readonly clientIds: number[];
  readonly sujet: string;
  readonly corps: string;
  readonly appUrl: string;
  readonly unsubscribeSecret: string;
}

export interface EnvoyerMessageResult {
  readonly envoyes: number;
  readonly skips: number;
  readonly errors: number;
}

/**
 * Envoie un email marketing à une sélection de clients du tenant.
 * Respecte l'opt-out (email_optouts) : les désinscrits sont skippés silencieusement.
 * Logge chaque envoi réussi dans emails_log. Best-effort : un échec par client n'arrête pas la boucle.
 * Max 200 destinataires par envoi (anti-abus / délivrabilité).
 */
export async function envoyerMessageClients(
  repo: IClientRepository,
  optoutRepo: IEmailOptoutRepository,
  emailPort: EmailPort,
  db: DbClient,
  ctx: TenantContext,
  input: EnvoyerMessageInput,
): Promise<EnvoyerMessageResult> {
  if (input.clientIds.length === 0) throw new ValidationError("Aucun client sélectionné");
  if (input.clientIds.length > MAX_DESTINATAIRES)
    throw new ValidationError(`Maximum ${MAX_DESTINATAIRES} destinataires par envoi`);
  if (!input.sujet.trim()) throw new ValidationError("Le sujet est requis");
  if (!input.corps.trim()) throw new ValidationError("Le corps du message est requis");

  /* artisans n'a pas de RLS — lecture directe par artisanId */
  const [artisan] = await db
    .select({ nomEntreprise: artisans.nomEntreprise, email: artisans.email })
    .from(artisans)
    .where(eq(artisans.id, ctx.artisanId))
    .limit(1);

  const fromName = artisan?.nomEntreprise ?? undefined;
  const replyTo = artisan?.email ?? undefined;

  /* repo.list est scopé tenant (RLS + filtre artisanId) → pas de fuite cross-tenant */
  const allClients = await repo.list(ctx);
  const idSet = new Set(input.clientIds);
  const cibles = allClients.filter((c) => idSet.has(c.id) && c.email);

  let envoyes = 0;
  let skips = 0;
  let errors = 0;

  for (const client of cibles) {
    if (!client.email) continue;
    try {
      if (await optoutRepo.isOptedOut(client.email)) {
        skips++;
        continue;
      }
      const token = signUnsubscribeToken(client.email, input.unsubscribeSecret);
      await emailPort.send({
        to: client.email,
        subject: input.sujet,
        body: input.corps,
        fromName,
        replyTo,
        unsubscribeUrl: `${input.appUrl}/api/emails/unsubscribe?token=${token}`,
      });
      envoyes++;
      /* log best-effort : un échec de log ne recompte pas l'envoi en erreur */
      await withTenant(db, ctx, (tx) =>
        tx.insert(emailsLog).values({
          artisanId: ctx.artisanId,
          destinataire: client.email ?? "",
          sujet: input.sujet,
          type: "marketing",
          statut: "sent",
          entiteType: "client",
          entiteId: client.id,
        }),
      ).catch(() => { /* ignored */ });
    } catch {
      errors++;
    }
  }

  return { envoyes, skips, errors };
}
