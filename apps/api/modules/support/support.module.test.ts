import { describe, it, expect } from "vitest";
import { FakeEmailPort } from "../../shared/ports";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { createSupportModule } from "./support.module";

const allow: RateLimiterPort = { check: async () => true };

describe("createSupportModule", () => {
  it("assemble un router avec la procédure `contact`", () => {
    const mod = createSupportModule({ email: new FakeEmailPort(), rateLimiter: allow, destinataire: "support@operioz.com" });
    expect(mod.router).toBeDefined();
    expect(typeof (mod.router as { contact?: unknown }).contact).not.toBe("undefined");
    expect(mod.deps.destinataire).toBe("support@operioz.com");
  });
});
