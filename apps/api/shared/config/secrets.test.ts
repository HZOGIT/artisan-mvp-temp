import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** État mutable du mock Bitwarden (partagé par le module mocké et les tests). */
const bwState: { secrets: Record<string, string>; hangGet: boolean } = { secrets: {}, hangGet: false };

vi.mock("@bitwarden/sdk-napi", () => {
  class BitwardenClient {
    auth() {
      return { loginAccessToken: () => Promise.resolve(undefined) };
    }
    secrets() {
      return {
        list: (_org: string) =>
          Promise.resolve({ data: Object.keys(bwState.secrets).map((key) => ({ id: `id-${key}`, key })) }),
        getByIds: (ids: string[]) =>
          Promise.resolve({ data: ids.map((id) => ({ key: id.slice(3), value: bwState.secrets[id.slice(3)] })) }),
        get: (id: string) =>
          bwState.hangGet
            ? new Promise<{ value: string }>(() => undefined)
            : Promise.resolve({ value: bwState.secrets[id.slice(3)] }),
        create: (_org: string, key: string, value: string) => {
          bwState.secrets[key] = value;
          return Promise.resolve({});
        },
        update: (_org: string, _id: string, key: string, value: string) => {
          bwState.secrets[key] = value;
          return Promise.resolve({});
        },
      };
    }
  }
  return { BitwardenClient };
});

/** Store en mémoire simulant un secret KV2 agrégé OVH (data + version). */
const ovhStore: { data: Record<string, string>; version: number } = { data: {}, version: 0 };

function stubOvhFetch(): void {
  vi.stubGlobal("fetch", (_url: string, init?: { method?: string; body?: string }) => {
    if ((init?.method ?? "GET") === "GET") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { data: ovhStore.data, metadata: { version: ovhStore.version } } }),
      } as Response);
    }
    const parsed = JSON.parse(init?.body ?? "{}") as { data: Record<string, string> };
    ovhStore.data = parsed.data;
    ovhStore.version += 1;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
  });
}

const ENV_KEYS = [
  "SECRETS_PROVIDER", "SECRET_GET_TIMEOUT_MS",
  "BWS_ACCESS_TOKEN", "BWS_ORGANIZATION_ID", "BWS_PROJECT_ID",
  "OVH_SECRET_MANAGER_ENDPOINT", "OVH_SECRET_MANAGER_TOKEN", "OVH_SECRET_MANAGER_PATH",
  "STRIPE_SECRET_KEY", "RESEND_API_KEY", "GEMINI_API_KEY", "NEW_KEY", "EPHEMERAL_KEY", "JWT_SECRET", "NOTION_TOKEN",
];

describe("secrets resolver (multi-providers, async)", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const k of ENV_KEYS) delete process.env[k];
    bwState.secrets = {};
    bwState.hangGet = false;
    ovhStore.data = {};
    ovhStore.version = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ProcessDotEnv (défaut) : lit process.env de façon live", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_env_stripe";
    const { hydrateSecrets, getSecret } = await import("./secrets");
    await hydrateSecrets();
    expect(await getSecret("STRIPE_SECRET_KEY")).toBe("sk_env_stripe");
  });

  it("Bitwarden prioritaire sur .env quand configuré", async () => {
    process.env.BWS_ACCESS_TOKEN = "token_test";
    process.env.BWS_ORGANIZATION_ID = "org_test";
    process.env.STRIPE_SECRET_KEY = "sk_env_stripe";
    bwState.secrets = { STRIPE_SECRET_KEY: "sk_bw_stripe", RESEND_API_KEY: "re_bw_resend" };
    const { hydrateSecrets, getSecret } = await import("./secrets");
    await hydrateSecrets();
    expect(await getSecret("STRIPE_SECRET_KEY")).toBe("sk_bw_stripe");
    expect(await getSecret("RESEND_API_KEY")).toBe("re_bw_resend");
  });

  it("fail-closed : absent du provider + cache → undefined, ne lit PAS process.env", async () => {
    process.env.BWS_ACCESS_TOKEN = "token_test";
    process.env.BWS_ORGANIZATION_ID = "org_test";
    process.env.GEMINI_API_KEY = "gemini_env_LEAK";
    bwState.secrets = {};
    const { hydrateSecrets, getSecret } = await import("./secrets");
    await hydrateSecrets();
    expect(await getSecret("GEMINI_API_KEY")).toBeUndefined();
  });

  it("undefined si absent de toutes les sources", async () => {
    const { hydrateSecrets, getSecret } = await import("./secrets");
    await hydrateSecrets();
    expect(await getSecret("ABSENT_KEY")).toBeUndefined();
  });

  it("round-trip set()→get() Bitwarden (create puis lecture live)", async () => {
    process.env.BWS_ACCESS_TOKEN = "token_test";
    process.env.BWS_ORGANIZATION_ID = "org_test";
    process.env.BWS_PROJECT_ID = "proj_test";
    const { setSecret, getSecret } = await import("./secrets");
    await setSecret("NEW_KEY", "new_val");
    expect(await getSecret("NEW_KEY")).toBe("new_val");
    expect(bwState.secrets.NEW_KEY).toBe("new_val");
  });

  it("Bitwarden set() sans BWS_PROJECT_ID → fail-closed clair", async () => {
    process.env.BWS_ACCESS_TOKEN = "token_test";
    process.env.BWS_ORGANIZATION_ID = "org_test";
    const { setSecret } = await import("./secrets");
    await expect(setSecret("NEW_KEY", "v")).rejects.toThrow(/BWS_PROJECT_ID/);
  });

  it("round-trip set()→get() OVH Secret Manager (KV2 mocké)", async () => {
    process.env.SECRETS_PROVIDER = "ovh";
    process.env.OVH_SECRET_MANAGER_ENDPOINT = "https://eu-west.okms.ovh.net/api/okms-id";
    process.env.OVH_SECRET_MANAGER_TOKEN = "pat_test";
    stubOvhFetch();
    const { setSecret, getSecret } = await import("./secrets");
    await setSecret("NEW_KEY", "ovh_val");
    expect(await getSecret("NEW_KEY")).toBe("ovh_val");
    expect(ovhStore.data.NEW_KEY).toBe("ovh_val");
  });

  it("ProcessDotEnv set() = no-op provider (write-through cache, rien persisté)", async () => {
    const { setSecret, getSecret } = await import("./secrets");
    await setSecret("EPHEMERAL_KEY", "v");
    expect(await getSecret("EPHEMERAL_KEY")).toBe("v");
    expect(process.env.EPHEMERAL_KEY).toBeUndefined();
  });

  it("getSecretSync (composition root) lit le cache hydraté du vault, jamais process.env", async () => {
    process.env.BWS_ACCESS_TOKEN = "token_test";
    process.env.BWS_ORGANIZATION_ID = "org_test";
    process.env.JWT_SECRET = "jwt_env_LEAK";
    bwState.secrets = { JWT_SECRET: "jwt_vault" };
    const { hydrateSecrets, getSecretSync } = await import("./secrets");
    await hydrateSecrets();
    expect(getSecretSync("JWT_SECRET")).toBe("jwt_vault");
  });

  it("getSecretSync résout un secret vault-only ABSENT de process.env", async () => {
    process.env.BWS_ACCESS_TOKEN = "token_test";
    process.env.BWS_ORGANIZATION_ID = "org_test";
    bwState.secrets = { NOTION_TOKEN: "ntn_vault_only" };
    const { hydrateSecrets, getSecretSync } = await import("./secrets");
    await hydrateSecrets();
    expect(process.env.NOTION_TOKEN).toBeUndefined();
    expect(getSecretSync("NOTION_TOKEN")).toBe("ntn_vault_only");
  });

  it("timeout live-get → renvoie le CACHE (jamais process.env)", async () => {
    process.env.BWS_ACCESS_TOKEN = "token_test";
    process.env.BWS_ORGANIZATION_ID = "org_test";
    process.env.SECRET_GET_TIMEOUT_MS = "20";
    process.env.STRIPE_SECRET_KEY = "sk_env_LEAK";
    bwState.secrets = { STRIPE_SECRET_KEY: "sk_cache" };
    const { hydrateSecrets, getSecret } = await import("./secrets");
    await hydrateSecrets();
    bwState.hangGet = true;
    expect(await getSecret("STRIPE_SECRET_KEY")).toBe("sk_cache");
  });
});
