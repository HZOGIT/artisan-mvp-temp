// Cloudflare Pages Function — dispatcher /api/* per-path : route vers le NOUVEAU STACK les domaines
// tRPC migrés ET activés par flag (NEW_STACK_DOMAINS), sinon vers le LEGACY. Défaut sûr : flags vides
// → 100% legacy (comportement identique au proxy transparent historique).
//
// Le front est servi par Pages (même origine) → cookies d'auth (host-only, SameSite=Lax) fonctionnent ;
// on forwarde les en-têtes (dont Cookie) tels quels. STREAMING-SAFE : on retourne la Response de fetch
// telle quelle (body en flux préservé → SSE de l'assistant/chat OK). Pas de canary par tenant ici
// (décision pré-auth) : bascule GLOBALE par domaine via NEW_STACK_DOMAINS.
import { decideTarget } from "../_lib/dispatch.mjs";

const LEGACY = "https://staging-backend.operioz.com";
const NEWSTACK = "https://staging-newstack.operioz.com";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const backend = decideTarget(url.pathname, env) === "new-stack" ? NEWSTACK : LEGACY;
  const target = backend + url.pathname + url.search;

  const headers = new Headers(request.headers);
  headers.delete("host"); // laisser fetch poser le bon Host pour le routage tunnel

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  const response = await fetch(target, init);
  // Observabilité de la bascule (smoke/diagnostic) : quel backend a servi. STREAMING-SAFE — on
  // ré-emballe en préservant le flux du body (SSE assistant/chat OK), on ajoute juste un en-tête.
  const outHeaders = new Headers(response.headers);
  outHeaders.set("x-operioz-backend", backend === NEWSTACK ? "new-stack" : "legacy");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
}
