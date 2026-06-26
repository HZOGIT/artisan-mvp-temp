import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Counter } from "prom-client";

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
  const expected = createHmac("sha256", Buffer.from(secret, "base64"))
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

export function registerResendWebhookRoute(
  app: FastifyInstance,
  deps: { resendWebhookSecret: string },
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
      if (type === "email.bounced" || type === "email.complained") {
        req.log.warn(
          { event: "resend_email_alert", type, to: data["to"], emailId: data["email_id"] },
          `Resend: ${type}`,
        );
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
