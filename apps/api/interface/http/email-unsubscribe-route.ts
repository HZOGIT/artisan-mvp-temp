import type { FastifyInstance } from "fastify";
import type { IEmailOptoutRepository } from "../../modules/emails/application/email-optout-repository";
import { verifyUnsubscribeToken } from "../../shared/email/unsubscribe-token";

export interface EmailUnsubscribeRouteDeps {
  readonly optoutRepo: IEmailOptoutRepository;
  readonly unsubscribeSecret: string;
}

const CONFIRM_HTML = (email: string) =>
  `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Désinscription</title></head>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#374151;">
  <h1 style="font-size:22px;">Désinscription confirmée</h1>
  <p>L'adresse <strong>${email.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c)}</strong> ne recevra plus d'emails marketing de notre part.</p>
</body></html>`;

const ALREADY_HTML = (email: string) =>
  `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Désinscription</title></head>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#374151;">
  <h1 style="font-size:22px;">Déjà désinscrit</h1>
  <p>L'adresse <strong>${email.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c)}</strong> est déjà désinscrite.</p>
</body></html>`;

/**
 * Routes publiques de désinscription email (lifecycle/marketing).
 *
 * GET  /api/emails/unsubscribe?token=...  — page de confirmation (affiche le résultat)
 * POST /api/emails/unsubscribe?token=...  — one-click RFC 8058 (email client automatique)
 * POST /api/emails/unsubscribe            — formulaire utilisateur (body: token=...)
 */
export function registerEmailUnsubscribeRoute(app: FastifyInstance, deps: EmailUnsubscribeRouteDeps): void {
  /*
   * RFC 8058 one-click : le client email poste application/x-www-form-urlencoded (List-Unsubscribe=One-Click).
   * Le token est dans l'URL (query string) — le body n'est pas utilisé.
   */
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  const resolveToken = (req: { query: unknown; body: unknown }): string | null => {
    const qs = (req.query as Record<string, unknown> | undefined) ?? {};
    if (typeof qs["token"] === "string") return qs["token"];
    const b = (req.body as Record<string, unknown> | undefined) ?? {};
    if (typeof b["token"] === "string") return b["token"];
    return null;
  };

  app.get("/api/emails/unsubscribe", async (req, reply) => {
    const token = resolveToken({ query: req.query, body: null });
    if (!token) return reply.code(400).type("text/html").send("<h1>Token manquant</h1>");
    const email = verifyUnsubscribeToken(token, deps.unsubscribeSecret);
    if (!email) return reply.code(400).type("text/html").send("<h1>Lien invalide ou expiré</h1>");
    const alreadyDone = await deps.optoutRepo.isOptedOut(email);
    if (alreadyDone) return reply.type("text/html").send(ALREADY_HTML(email));
    await deps.optoutRepo.addOptout(email, "user_link");
    req.log.info({ event: "email_unsubscribe", email }, "Opt-out email enregistré");
    return reply.type("text/html").send(CONFIRM_HTML(email));
  });

  app.post("/api/emails/unsubscribe", async (req, reply) => {
    const token = resolveToken({ query: req.query, body: req.body });
    if (!token) return reply.code(400).send({ error: "Token manquant" });
    const email = verifyUnsubscribeToken(token, deps.unsubscribeSecret);
    if (!email) return reply.code(400).send({ error: "Token invalide" });
    await deps.optoutRepo.addOptout(email, "one_click");
    req.log.info({ event: "email_unsubscribe_oneclick", email }, "Opt-out one-click RFC 8058 enregistré");
    return reply.code(200).send({ ok: true });
  });
}
