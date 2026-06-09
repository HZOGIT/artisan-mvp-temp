// Cloudflare Pages Function — proxy transparent /api/* -> backend staging.
// Le front est servi par Pages (meme origine), donc les cookies d'auth (host-only,
// SameSite=Lax) fonctionnent sans CORS. Le backend reste joignable via le tunnel.
const BACKEND = "https://staging-backend.operioz.com";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = BACKEND + url.pathname + url.search;

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
  return fetch(target, init);
}
