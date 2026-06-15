// Cloudflare Pages Function — proxy /api/* vers le NOUVEAU STACK (Fastify). L'extinction du legacy
// est terminée : il n'existe plus qu'UN backend (le legacy Express + son hostname staging-backend ont
// été supprimés). Tout `/api/*` est forwardé au new-stack ; le SPA `/` + `/assets` est servi en
// statique par Pages (hors Function). Un chemin inconnu est 404 proprement côté Fastify.
//
// Le front est servi par Pages (même origine) → cookies d'auth (host-only, SameSite=Lax) fonctionnent ;
// on forwarde les en-têtes (dont Cookie) tels quels. STREAMING-SAFE : on retourne la Response de fetch
// telle quelle (body en flux préservé → SSE de l'assistant/chat OK).

const NEWSTACK = "https://staging-newstack.operioz.com";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = NEWSTACK + url.pathname + url.search;

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
  // Observabilité (smoke/diagnostic) : quel backend a servi. STREAMING-SAFE — on ré-emballe en
  // préservant le flux du body (SSE assistant/chat OK), on ajoute juste un en-tête.
  const outHeaders = new Headers(response.headers);
  outHeaders.set("x-operioz-backend", "new-stack");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
}
