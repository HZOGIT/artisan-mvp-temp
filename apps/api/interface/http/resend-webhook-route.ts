import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Counter } from "prom-client";
import type { IEmailLogWriter } from "../../modules/emails/application/email-log-writer";
import type { INotificationRepository } from "../../modules/notifications/application/notification-repository";

const resendWebhookCounter = new Counter({
  name: "resend_webhook_total",
  help: "Resend webhook events par type",
  labelNames: ["type"],
});

function verifyResendSignature(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
): boolean {
  const svixId = headers["svix-id"] as string | undefined;
  const svixTimestamp = headers["svix-timestamp"] as string | undefined;
  const svixSignature = headers["svix-signature"] as string | undefined;
  if (!svixId || !svixTimestamp || !svixSignature) return false;
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString()}`;
  const expected = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"))
    .update(signedContent)
    .digest("base64");
  const signatures = svixSignature.split(" ").map((s) => s.replace(/^v\d+,/, ""));
  return signatures.some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
      return false;
    }
  });
}

const STATUT_MAP = {
  "email.delivered": "delivre",
  "email.bounced": "bounce",
  "email.complained": "plainte",
} as const;

type TrackedEventType = keyof typeof STATUT_MAP;

function isTrackedEvent(type: string): type is TrackedEventType {
  return type in STATUT_MAP;
}

export interface ResendWebhookDeps {
  readonly resendWebhookSecret: string;
  /** Writer cross-tenant pour MAJ statut (requiert connexion superuser). */
  readonly emailLogWriter?: IEmailLogWriter;
  /** Pour créer une notification artisan sur bounce/plainte. */
  readonly notificationRepo?: INotificationRepository;
}

export function registerResendWebhookRoute(
  app: FastifyInstance,
  deps: ResendWebhookDeps,
): void {
  app.register((instance) => {
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => done(null, body),
    );
    instance.post("/api/resend/webhook", async (req, reply) => {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(typeof req.body === "string" ? req.body : "");
      if (!verifyResendSignature(rawBody, req.headers as Record<string, string | string[] | undefined>, deps.resendWebhookSecret)) {
        req.log.warn({ event: "resend_webhook_invalid_signature" }, "Resend webhook: signature invalide");
        return reply.code(400).send({ error: "invalid signature" });
      }
      const payload = JSON.parse(rawBody.toString()) as { type: string; data: Record<string, unknown> };
      const { type, data } = payload;
      resendWebhookCounter.inc({ type });

      if (isTrackedEvent(type)) {
        const resendId = typeof data["email_id"] === "string" ? data["email_id"] : undefined;
        const newStatut = STATUT_MAP[type];
        const isAlerte = type === "email.bounced" || type === "email.complained";

        if (isAlerte) {
          req.log.warn(
            { event: "resend_email_alert", type, to: data["to"], emailId: resendId },
            `Resend: ${type}`,
          );
        } else {
          req.log.info(
            { event: "resend_webhook", type, emailId: resendId },
            `Resend: ${type}`,
          );
        }

        if (resendId && deps.emailLogWriter) {
          try {
            const updated = await deps.emailLogWriter.updateStatutByResendId(resendId, newStatut);
            if (updated?.artisanId && isAlerte && deps.notificationRepo) {
              const motif = type === "email.bounced" ? "bounce" : "plainte";
              await deps.notificationRepo.creer(
                { artisanId: updated.artisanId, userId: 0 },
                {
                  type: "alerte",
                  titre: "Email non délivré",
                  message: `L'email à ${updated.destinataire} a échoué (${motif}) — vérifiez l'adresse.`,
                  lien: "/emails",
                },
              );
            }
          } catch (err) {
            req.log.error(
              { event: "resend_webhook_update_error", resendId, error: String(err) },
              "Erreur MAJ statut email_log",
            );
          }
        }
      } else {
        req.log.info(
          { event: "resend_webhook", type, emailId: data["email_id"] },
          `Resend: ${type}`,
        );
      }

      return reply.code(200).send({ ok: true });
    });
  });
}
