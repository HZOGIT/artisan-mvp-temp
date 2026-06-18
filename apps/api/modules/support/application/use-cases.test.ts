import { describe, it, expect } from "vitest";
import { TooManyRequestsError } from "../../../shared/errors";
import { FakeEmailPort } from "../../../shared/ports";
import { SlidingWindowRateLimiter, type RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { TenantContext } from "../../../shared/tenant";
import { contacterSupport, type SupportDeps } from "./use-cases";

const ctx: TenantContext = { artisanId: 7, userId: 42 };
const allow: RateLimiterPort = { check: async () => true };
const deny: RateLimiterPort = { check: async () => false };

function build(over: Partial<SupportDeps> = {}): { deps: SupportDeps; email: FakeEmailPort } {
  const email = new FakeEmailPort();
  return { deps: { email, rateLimiter: allow, destinataire: "support@operioz.com", ...over }, email };
}

const INPUT = { nom: "Jean Dupont", email: "jean@client.fr", sujet: "technique" as const, message: "Bonjour, j'ai un souci avec mes factures." };

describe("contacterSupport", () => {
  it("succès → email envoyé à la boîte support, sujet préfixé, corps HTML échappé", async () => {
    const { deps, email } = build();
    const res = await contacterSupport(deps, ctx, INPUT);
    expect(res).toEqual({ success: true });
    expect(email.sent).toHaveLength(1);
    const msg = email.sent[0];
    expect(msg.to).toBe("support@operioz.com");
    expect(msg.subject).toBe("[Support Operioz] Problème technique — Jean Dupont");
    expect(msg.body).toContain("jean@client.fr");
    expect(msg.body).toContain("42 (artisanId 7)");
    expect(msg.body).toContain("Bonjour, j&#39;ai un souci"); // apostrophe échappée
  });

  it("HTML malveillant dans le message → échappé (pas d'injection)", async () => {
    const { deps, email } = build();
    await contacterSupport(deps, ctx, { ...INPUT, message: "<script>alert(1)</script> coucou" });
    expect(email.sent[0].body).toContain("&lt;script&gt;");
    expect(email.sent[0].body).not.toContain("<script>");
  });

  it("rate-limit atteint → TooManyRequestsError, aucun email envoyé", async () => {
    const { deps, email } = build({ rateLimiter: deny });
    await expect(contacterSupport(deps, ctx, INPUT)).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(email.sent).toHaveLength(0);
  });

  it("anti-flood par utilisateur via le vrai SlidingWindowRateLimiter (limite 5 / fenêtre)", async () => {
    const limiter = new SlidingWindowRateLimiter(5, 60_000);
    const { deps, email } = build({ rateLimiter: limiter });
    for (let i = 0; i < 5; i++) await contacterSupport(deps, ctx, INPUT);
    await expect(contacterSupport(deps, ctx, INPUT)).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(email.sent).toHaveLength(5);
    // un autre utilisateur n'est pas affecté (clé par userId)
    await expect(contacterSupport(deps, { artisanId: 7, userId: 99 }, INPUT)).resolves.toEqual({ success: true });
  });
});
