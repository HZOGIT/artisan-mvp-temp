// Assainit un message d'erreur d'un appel IA avant de le renvoyer au client : ne JAMAIS exposer la
// clé API, des payloads base64 (images) ou des blobs longs. Pur — partagé par tous les use-cases IA.
export function sanitizeIaError(e: unknown, fallback = "Erreur IA"): string {
  let msg = String((e as { message?: unknown })?.message ?? e ?? fallback);
  msg = msg.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, "[image]");
  msg = msg.replace(/[A-Za-z0-9+/=]{200,}/g, "[…]");
  if (msg.length > 200) msg = msg.slice(0, 200) + "…";
  return msg;
}
