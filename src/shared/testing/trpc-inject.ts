import superjson from "superjson";

// Helper d'injection HTTP pour les tests e2e tRPC du new-stack. ⚠️ Le serveur utilise le data
// transformer **superjson** (comme le client/legacy) : l'input doit être sérialisé (`{json,meta}`)
// et la réponse `result.data` désérialisée. Ce helper encapsule ces deux étapes et renvoie un objet
// compatible avec l'API `LightMyRequestResponse` minimale utilisée par les tests : `statusCode`,
// `body`, et `json()` qui rend l'enveloppe tRPC AVEC `result.data` déjà désérialisé (les call sites
// `res.json().result.data.X` restent inchangés).

interface AppLike {
  inject(opts: { method: string; url: string; headers: Record<string, string>; payload?: string }): Promise<{
    statusCode: number;
    body: string;
    json: () => unknown;
  }>;
}

export interface InjectResult {
  statusCode: number;
  body: string;
  json: () => any;
}

function unwrap(raw: unknown): any {
  let env: any = raw;
  if (Array.isArray(env)) env = env[0]; // tolérant au format batch (1 appel)
  if (env && typeof env === "object" && env.result && "data" in env.result) {
    return { ...env, result: { ...env.result, data: superjson.deserialize(env.result.data) } };
  }
  return env; // enveloppe d'erreur (ou forme inattendue) : passthrough
}

export async function injectTrpc(
  app: AppLike,
  method: "GET" | "POST",
  path: string,
  input: unknown,
  token?: string,
): Promise<InjectResult> {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `token=${token}`;
  let res;
  if (method === "POST") {
    res = await app.inject({
      method: "POST",
      url: `/api/trpc/${path}`,
      headers: { ...headers, "content-type": "application/json" },
      payload: JSON.stringify(superjson.serialize(input)),
    });
  } else {
    const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(superjson.serialize(input)))}`;
    res = await app.inject({ method: "GET", url: `/api/trpc/${path}${qs}`, headers });
  }
  const raw = res.json();
  return { statusCode: res.statusCode, body: res.body, json: () => unwrap(raw) };
}
