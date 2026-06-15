// Extraction de l'IP cliente à **valeur probante** (signature de devis) : on priorise
// `cf-connecting-ip` (posé par Cloudflare, non falsifiable par le client) plutôt que
// `x-forwarded-for[0]` (que le signataire peut usurper). On ne garde qu'UNE IP (pas toute la chaîne
// XFF) et on borne à 45 caractères (colonne `signatures_devis.ipAddress` VARCHAR(45) → évite un
// dépassement à l'écriture). Parité legacy (server/routers.ts `signDevis`/`refuseDevis`).
const IP_MAX = 45;

function header(headers: Record<string, unknown>, name: string): string | null {
  const v = headers[name];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

export function extractClientIp(headers: Record<string, unknown>, fallback?: string | null): string {
  const cf = header(headers, "cf-connecting-ip")?.trim();
  const xff = header(headers, "x-forwarded-for")?.split(",")[0]?.trim();
  const ip = cf || xff || (fallback ?? "").trim() || "unknown";
  return ip.slice(0, IP_MAX);
}

export function extractUserAgent(headers: Record<string, unknown>): string {
  const ua = header(headers, "user-agent");
  return (ua && ua.trim()) || "unknown";
}
