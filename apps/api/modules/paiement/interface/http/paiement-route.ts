import type { FastifyInstance } from "fastify";
import type { PortalPaymentReader } from "../../application/portal-payment-reader";
import type { PortalPaymentWriter } from "../../application/portal-payment-writer";
import type { StripePort } from "../../../../shared/ports/stripe";
import type { RateLimiterPort } from "../../../../shared/ports/rate-limiter";
import { getPaiementStatut, createInvoiceCheckout } from "../../application/use-cases";
import { extractClientIp } from "../../../../interface/http/client-ip";

export interface PaiementRouteDeps {
  readonly reader: PortalPaymentReader;
  readonly writer: PortalPaymentWriter;
  readonly stripe: StripePort;
  readonly rateLimiter: RateLimiterPort;
  readonly appUrl: string;
}

/*
 * Route PUBLIQUE par token de portail `GET /api/paiement/status/:factureId?token=…` : statut de
 * paiement d'une facture (vue portail client). Le token EST la capacité (pas de cookie). Anti-IDOR :
 * la facture doit appartenir au client de l'accès portail. Parité legacy.
 */
export function registerPaiementRoute(app: FastifyInstance, deps: PaiementRouteDeps): void {
  app.get("/api/paiement/status/:factureId", async (req, reply) => {
    const token = (req.query as { token?: string } | undefined)?.token;
    const factureId = parseInt(String((req.params as { factureId?: string }).factureId ?? ""), 10);
    if (!Number.isFinite(factureId)) return reply.code(404).send({ error: "Facture non trouvée" });

    let outcome;
    try {
      outcome = await getPaiementStatut(deps.reader, { token, factureId });
    } catch (e) {
      req.log.error({ err: e instanceof Error ? e : new Error(String(e)) }, 'paiement_status_error');
      return reply.code(500).send({ error: "Erreur lors de la vérification du statut" });
    }
    switch (outcome.kind) {
      case "bad-request":
        return reply.code(400).send({ error: "Token requis" });
      case "forbidden":
        return reply.code(403).send({ error: "Accès portail non autorisé ou expiré" });
      case "not-found":
        return reply.code(404).send({ error: "Facture non trouvée" });
      case "ok":
        req.log.info({ status: outcome.payload.statutFacture }, 'paiement_status_checked');
        return reply.send(outcome.payload);
    }
  });

  /** POST : ouvre un Checkout Stripe (mode payment) pour payer une facture (public par token portail). */
  app.post("/api/paiement/create-checkout-session", async (req, reply) => {
    const ip = extractClientIp((req.headers ?? {}) as Record<string, unknown>, req.ip ?? null);
    if (!(await deps.rateLimiter.check(`paiement:${ip}`))) {
      return reply.code(429).send({ error: "Trop de requêtes, réessayez dans une minute" });
    }
    const body = (req.body ?? {}) as { factureId?: unknown; token?: unknown };
    const factureId = typeof body.factureId === "number" ? body.factureId : parseInt(String(body.factureId ?? ""), 10);
    const token = typeof body.token === "string" ? body.token : undefined;
    const origin = deps.appUrl;

    let outcome;
    try {
      outcome = await createInvoiceCheckout(deps, { factureId: Number.isFinite(factureId) ? factureId : undefined, token, origin });
    } catch {
      return reply.code(500).send({ error: "Le paiement en ligne est momentanément indisponible. Veuillez réessayer plus tard ou contacter votre artisan." });
    }
    switch (outcome.kind) {
      case "bad-request":
        return reply.code(400).send({ error: outcome.message });
      case "forbidden":
        return reply.code(403).send({ error: "Accès portail non autorisé ou expiré" });
      case "not-found":
        return reply.code(404).send({ error: "Facture non trouvée" });
      case "ok":
        return reply.send({ url: outcome.url, sessionId: outcome.sessionId });
    }
  });
}
