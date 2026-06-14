import type { FastifyInstance } from "fastify";
import { resolveDispatchTarget } from "./dispatch";
import { parseFlagsFromEnv } from "./flags";

// Front-door du nouveau stack : il sert localement les domaines migrés ET activés par flag, et
// **reverse-proxie tout le reste vers le legacy** (fetch natif Node ≥18, pas de dépendance). Avec
// tous les flags OFF, 100 % du trafic est proxifié → comportement identique au legacy ; on bascule
// ensuite domaine par domaine via NEW_STACK_DOMAINS / NEW_STACK_CANARY_*.

const TRPC_PREFIX = "/api/trpc/";

// Cible d'une URL entrante. `local` = servi par le nouveau stack ; `legacy` = proxifié.
// Décision par flag GLOBAL (tenantId indéfini) : suffisant pour une bascule progressive par domaine
// en staging ; le canary par tenant (nécessite l'auth) viendra avec un dispatcher post-auth.
export function targetForUrl(url: string, env: NodeJS.ProcessEnv = process.env): "local" | "legacy" {
  // Sonde de santé du conteneur (nouveau stack) — toujours locale.
  if (url === "/health" || url.startsWith("/health?")) return "local";
  if (url.startsWith(TRPC_PREFIX)) {
    const path = url.slice(TRPC_PREFIX.length).split("?")[0]; // "articles.list"
    return resolveDispatchTarget(path, undefined, parseFlagsFromEnv(env)) === "new-stack" ? "local" : "legacy";
  }
  // Tout le reste (autres routes, front résiduel) → legacy : le nouveau stack ne connaît que ses domaines tRPC.
  return "legacy";
}

// En-têtes à ne pas recopier tels quels lors du proxy (hop-by-hop / recalculés).
const SKIP_REQ_HEADERS = new Set(["host", "content-length", "connection"]);
const SKIP_RES_HEADERS = new Set(["content-encoding", "transfer-encoding", "content-length", "connection"]);

// Enregistre le hook front-door. Idempotent par instance (à appeler une fois dans buildApp).
export function registerGatewayProxy(app: FastifyInstance, opts: { legacyBaseUrl: string }): void {
  const base = opts.legacyBaseUrl.replace(/\/$/, "");
  app.addHook("onRequest", async (req, reply) => {
    if (targetForUrl(req.url) === "local") return; // laisse le routeur local (tRPC) gérer

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined || SKIP_REQ_HEADERS.has(k.toLowerCase())) continue;
      headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
    }
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const upstream = await fetch(base + req.url, {
      method: req.method,
      headers,
      body: hasBody ? (req.raw as unknown as ReadableStream) : undefined,
      // @ts-expect-error duplex requis par fetch Node pour un body en flux
      duplex: hasBody ? "half" : undefined,
      redirect: "manual",
    });

    reply.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!SKIP_RES_HEADERS.has(key.toLowerCase())) reply.header(key, value);
    });
    reply.send(Buffer.from(await upstream.arrayBuffer()));
  });
}
