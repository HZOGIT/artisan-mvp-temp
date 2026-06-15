import { describe, it, expect, beforeEach } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import type { EmailMessage, EmailPort } from "../../../shared/ports/email";
import { NotFoundError } from "../../../shared/errors";
import {
  FakeSignatureRepository,
  FakeSignatureContextReader,
  FakeSignatureNotificationWriter,
} from "../infra/signature-repository-fake";
import type { SignatureDevisContext } from "./signature-repository";
import type { SignatureDeps } from "./use-cases";
import { getSignatureByDevis, createSignatureLink } from "./use-cases";

class CapturingEmail implements EmailPort {
  public sent: EmailMessage[] = [];
  async send(m: EmailMessage): Promise<void> {
    this.sent.push(m);
  }
}

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

const devisContext = (overrides: Partial<SignatureDevisContext> = {}): SignatureDevisContext => ({
  devis: { id: 10, clientId: 5, numero: "DEV-2026-001", objet: "Réfection toiture", totalTTC: 1200 },
  client: { email: "client@example.com", prenom: "Jean", nom: "Dupont" },
  artisan: { nomEntreprise: "Toiture Pro", email: "pro@example.com" },
  ...overrides,
});

function build(seedCtx?: SignatureDevisContext) {
  const repo = new FakeSignatureRepository();
  const contextReader = new FakeSignatureContextReader();
  const email = new CapturingEmail();
  const notifications = new FakeSignatureNotificationWriter();
  if (seedCtx) contextReader.seed(1, seedCtx);
  const deps: SignatureDeps = {
    repo,
    contextReader,
    email,
    notifications,
    appUrl: "https://app.test",
    maintenant: () => new Date("2026-06-15T12:00:00Z"),
  };
  return { deps, repo, contextReader, email, notifications };
}

describe("signature use-cases", () => {
  describe("getSignatureByDevis", () => {
    it("renvoie null si le devis n'appartient pas au tenant (anti-IDOR parent)", async () => {
      const { deps } = build(devisContext());
      // tenant 2 n'a pas semé ce devis → null, jamais la signature d'autrui
      expect(await getSignatureByDevis(deps, ctx(2), 10)).toBeNull();
    });

    it("renvoie la signature du devis possédé", async () => {
      const { deps, repo } = build(devisContext());
      await repo.create({ devisId: 10, token: "tok", expiresAt: new Date("2026-07-15") });
      const sig = await getSignatureByDevis(deps, ctx(1), 10);
      expect(sig?.devisId).toBe(10);
    });

    it("renvoie null s'il n'existe pas encore de signature", async () => {
      const { deps } = build(devisContext());
      expect(await getSignatureByDevis(deps, ctx(1), 10)).toBeNull();
    });
  });

  describe("createSignatureLink", () => {
    it("rejette (404) si le devis n'appartient pas au tenant", async () => {
      const { deps } = build(devisContext());
      await expect(createSignatureLink(deps, ctx(2), 10)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("crée le lien (token 64 hex, +30j), envoie l'email client et notifie l'artisan", async () => {
      const { deps, email, notifications } = build(devisContext());
      const sig = await createSignatureLink(deps, ctx(1), 10);
      expect(sig.token).toHaveLength(64);
      expect(sig.token).toMatch(/^[0-9a-f]{64}$/);
      expect(sig.expiresAt.toISOString()).toBe("2026-07-15T12:00:00.000Z");
      expect(sig.statut).toBe("en_attente");
      expect(email.sent).toHaveLength(1);
      expect(email.sent[0].to).toBe("client@example.com");
      expect(email.sent[0].subject).toContain("DEV-2026-001");
      expect(email.sent[0].body).toContain("https://app.test/devis-public/");
      expect(notifications.emitted).toHaveLength(1);
      expect(notifications.emitted[0].artisanId).toBe(1);
    });

    it("est idempotent : ne recrée pas / ne renotifie pas si une signature existe déjà", async () => {
      const { deps, repo, email, notifications } = build(devisContext());
      const existing = await repo.create({ devisId: 10, token: "deja", expiresAt: new Date("2026-07-01") });
      const sig = await createSignatureLink(deps, ctx(1), 10);
      expect(sig.token).toBe(existing.token);
      expect(email.sent).toHaveLength(0);
      expect(notifications.emitted).toHaveLength(0);
    });

    it("ne plante pas si le client n'a pas d'email (lien créé, pas d'email)", async () => {
      const { deps, email } = build(devisContext({ client: { email: null, prenom: "X", nom: "Y" } }));
      const sig = await createSignatureLink(deps, ctx(1), 10);
      expect(sig.token).toHaveLength(64);
      expect(email.sent).toHaveLength(0);
    });
  });
});
