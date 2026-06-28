import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@bitwarden/sdk-napi", () => {
  function BitwardenClient() {}
  BitwardenClient.prototype.auth = function () {
    return { loginAccessToken: vi.fn().mockResolvedValue(undefined) };
  };
  BitwardenClient.prototype.secrets = function () {
    return {
      list: vi.fn().mockResolvedValue({
        data: [
          { id: "id-stripe", key: "STRIPE_SECRET_KEY" },
          { id: "id-resend", key: "RESEND_API_KEY" },
        ],
      }),
      getByIds: vi.fn().mockResolvedValue({
        data: [
          { key: "STRIPE_SECRET_KEY", value: "sk_bw_stripe" },
          { key: "RESEND_API_KEY", value: "re_bw_resend" },
        ],
      }),
    };
  };
  return { BitwardenClient };
});

describe("secrets resolver", async () => {
  beforeEach(async () => {
    vi.resetModules();
    delete process.env.BWS_ACCESS_TOKEN;
    delete process.env.BWS_ORGANIZATION_ID;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it("mode .env pur si BWS_ACCESS_TOKEN absent", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_env_stripe";
    const { hydrateSecrets, getSecret } = await import("./secrets");
    await hydrateSecrets();
    expect(getSecret("STRIPE_SECRET_KEY")).toBe("sk_env_stripe");
  });

  it("BW prioritaire sur .env si BWS configuré", async () => {
    process.env.BWS_ACCESS_TOKEN = "token_test";
    process.env.BWS_ORGANIZATION_ID = "org_test";
    process.env.STRIPE_SECRET_KEY = "sk_env_stripe";
    const { hydrateSecrets, getSecret } = await import("./secrets");
    await hydrateSecrets();
    expect(getSecret("STRIPE_SECRET_KEY")).toBe("sk_bw_stripe");
    expect(getSecret("RESEND_API_KEY")).toBe("re_bw_resend");
  });

  it("fallback .env si clé absente de BW", async () => {
    process.env.BWS_ACCESS_TOKEN = "token_test";
    process.env.BWS_ORGANIZATION_ID = "org_test";
    process.env.GEMINI_API_KEY = "gemini_env";
    const { hydrateSecrets, getSecret } = await import("./secrets");
    await hydrateSecrets();
    expect(getSecret("GEMINI_API_KEY")).toBe("gemini_env");
  });

  it("undefined si absent des deux sources", async () => {
    const { hydrateSecrets, getSecret } = await import("./secrets");
    await hydrateSecrets();
    expect(getSecret("ABSENT_KEY")).toBeUndefined();
  });
});
