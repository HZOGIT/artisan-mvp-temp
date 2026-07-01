import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Garde anti-régression : aucun secret vault-backed ne doit être lu via `process.env.<KEY>` dans le
 * code applicatif. La SEULE source autoritaire est le résolveur de secrets (getSecret/getSecretSync).
 * Les creds d'amorçage du coffre (BWS_, OVH_, SECRETS_PROVIDER), NODE_ENV et l'infra DB restent lus
 * via process.env — ils ne figurent donc PAS dans cette liste.
 */
const VAULT_BACKED_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "JWT_SECRET",
  "APP_URL",
  "BACKEND_PUBLIC_URL",
  "CORS_ORIGIN",
  "GEMINI_API_KEY",
  "GEMINI_TEXT_MODEL",
  "GEMINI_LIVE_MODEL",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "NOTION_TOKEN",
  "NOTION_FEEDBACK_DATABASE_ID",
  "SUPERPDP_CLIENT_ID",
  "SUPERPDP_CLIENT_SECRET",
  "SUPERPDP_BASE_URL",
  "SUPERPDP_REDIRECT_URI",
  "SCHEDULER_SECRET",
  "RESEND_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "EMAIL_UNSUBSCRIBE_SECRET",
];

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Fichiers légitimement autorisés à référencer process.env (magasin ProcessDotEnv, tests). */
function isExempt(path: string): boolean {
  return (
    path.endsWith(".test.ts") ||
    path.includes(join("shared", "config", "providers")) ||
    path.endsWith(join("shared", "config", "secrets.ts"))
  );
}

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...walkTsFiles(full));
    } else if (entry.name.endsWith(".ts") && !isExempt(full)) {
      out.push(full);
    }
  }
  return out;
}

describe("no direct process.env access for vault-backed secrets", () => {
  it("aucun process.env.<secret vault-backed> résiduel dans apps/api", () => {
    const files = walkTsFiles(API_ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const key of VAULT_BACKED_KEYS) {
        if (src.includes(`process.env.${key}`)) {
          offenders.push(`${file.slice(API_ROOT.length + 1)} → process.env.${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
