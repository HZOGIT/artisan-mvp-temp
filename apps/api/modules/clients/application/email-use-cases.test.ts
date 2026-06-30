import { describe, it, expect, vi } from "vitest";
import { FakeClientRepository } from "../infra/client-repository-fake";
import { EmailOptoutRepositoryFake } from "../../emails/infra/email-optout-repository-fake";
import { creerClient } from "./write-use-cases";
import { envoyerMessageClients } from "./email-use-cases";
import { ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { EmailPort, EmailMessage } from "../../../shared/ports/email";
import type { DbClient } from "../../../shared/db";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

/** Double email qui enregistre les messages envoyés. */
class FakeEmailPort implements EmailPort {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
  }
}

/** Double DbClient minimal : withTenant lance fn(this), artisans retourne vide. */
function fakeDb(): DbClient {
  const db = {
    transaction: async (fn: (tx: DbClient) => Promise<unknown>) => fn(db as unknown as DbClient),
    execute: async () => ({ rows: [] }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
    insert: () => ({
      values: async () => {},
    }),
  } as unknown as DbClient;
  return db;
}

describe("envoyerMessageClients (L1 fakes)", () => {
  it("envoie à chaque client avec email (skip ceux sans email)", async () => {
    const repo = new FakeClientRepository();
    const optout = new EmailOptoutRepositoryFake();
    const email = new FakeEmailPort();
    const c1 = await creerClient(repo, A, { nom: "Durand", email: "durand@a.fr" });
    const c2 = await creerClient(repo, A, { nom: "Sans email" });
    const c3 = await creerClient(repo, A, { nom: "Leblanc", email: "leblanc@a.fr" });

    const result = await envoyerMessageClients(repo, optout, email, fakeDb(), A, {
      clientIds: [c1.id, c2.id, c3.id],
      sujet: "Entretien annuel",
      corps: "<p>Bonjour</p>",
      appUrl: "https://test.operioz.com",
      unsubscribeSecret: "secret",
    });

    expect(result.envoyes).toBe(2);
    expect(result.skips).toBe(0);
    expect(result.errors).toBe(0);
    expect(email.sent).toHaveLength(2);
    expect(email.sent.map((m) => m.to)).toEqual(["durand@a.fr", "leblanc@a.fr"]);
  });

  it("OPE-930 — unsubscribeUrl pointe vers le backend (appUrl /api/emails/unsubscribe)", async () => {
    const repo = new FakeClientRepository();
    const optout = new EmailOptoutRepositoryFake();
    const email = new FakeEmailPort();
    const c1 = await creerClient(repo, A, { nom: "Test", email: "test@a.fr" });

    await envoyerMessageClients(repo, optout, email, fakeDb(), A, {
      clientIds: [c1.id],
      sujet: "Test URL",
      corps: "<p>OK</p>",
      appUrl: "https://api.backend.test",
      unsubscribeSecret: "s",
    });

    expect(email.sent[0].unsubscribeUrl).toContain("https://api.backend.test/api/emails/unsubscribe");
  });

  it("skippe les clients en opt-out", async () => {
    const repo = new FakeClientRepository();
    const optout = new EmailOptoutRepositoryFake();
    const email = new FakeEmailPort();
    const c1 = await creerClient(repo, A, { nom: "Durand", email: "durand@a.fr" });
    const c2 = await creerClient(repo, A, { nom: "OptOut", email: "optout@a.fr" });
    optout.seed("optout@a.fr");

    const result = await envoyerMessageClients(repo, optout, email, fakeDb(), A, {
      clientIds: [c1.id, c2.id],
      sujet: "Test",
      corps: "<p>Message</p>",
      appUrl: "https://test.operioz.com",
      unsubscribeSecret: "secret",
    });

    expect(result.envoyes).toBe(1);
    expect(result.skips).toBe(1);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("durand@a.fr");
  });

  it("RLS : un artisan n'écrit qu'à SES clients (clientIds d'un autre tenant ignorés)", async () => {
    const repo = new FakeClientRepository();
    const optout = new EmailOptoutRepositoryFake();
    const email = new FakeEmailPort();
    const cA = await creerClient(repo, A, { nom: "ClientA", email: "a@a.fr" });
    const cB = await creerClient(repo, B, { nom: "ClientB", email: "b@b.fr" });

    /* A essaie d'envoyer au client de B — doit être ignoré (repo.list scopé tenant) */
    const result = await envoyerMessageClients(repo, optout, email, fakeDb(), A, {
      clientIds: [cA.id, cB.id],
      sujet: "Test",
      corps: "<p>Msg</p>",
      appUrl: "https://test.operioz.com",
      unsubscribeSecret: "secret",
    });

    expect(result.envoyes).toBe(1);
    expect(email.sent[0].to).toBe("a@a.fr");
  });

  it("liste vide → ValidationError", async () => {
    const repo = new FakeClientRepository();
    const optout = new EmailOptoutRepositoryFake();
    const email = new FakeEmailPort();
    await expect(
      envoyerMessageClients(repo, optout, email, fakeDb(), A, {
        clientIds: [],
        sujet: "Test",
        corps: "<p>Msg</p>",
        appUrl: "https://test.operioz.com",
        unsubscribeSecret: "secret",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("sujet vide → ValidationError", async () => {
    const repo = new FakeClientRepository();
    const optout = new EmailOptoutRepositoryFake();
    const email = new FakeEmailPort();
    const c = await creerClient(repo, A, { nom: "Durand", email: "d@a.fr" });
    await expect(
      envoyerMessageClients(repo, optout, email, fakeDb(), A, {
        clientIds: [c.id],
        sujet: "  ",
        corps: "<p>Msg</p>",
        appUrl: "https://test.operioz.com",
        unsubscribeSecret: "secret",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("L'email envoyé inclut une URL de désinscription", async () => {
    const repo = new FakeClientRepository();
    const optout = new EmailOptoutRepositoryFake();
    const email = new FakeEmailPort();
    const c = await creerClient(repo, A, { nom: "Durand", email: "durand@a.fr" });

    await envoyerMessageClients(repo, optout, email, fakeDb(), A, {
      clientIds: [c.id],
      sujet: "Test",
      corps: "<p>Bonjour</p>",
      appUrl: "https://test.operioz.com",
      unsubscribeSecret: "secret",
    });

    expect(email.sent[0].unsubscribeUrl).toContain("https://test.operioz.com/api/emails/unsubscribe?token=");
  });

  it("erreur d'envoi isolée : un email qui fail n'arrête pas les suivants", async () => {
    const repo = new FakeClientRepository();
    const optout = new EmailOptoutRepositoryFake();
    let calls = 0;
    const email: EmailPort = {
      async send() {
        calls++;
        if (calls === 1) throw new Error("réseau");
      },
    };
    const c1 = await creerClient(repo, A, { nom: "Fail", email: "fail@a.fr" });
    const c2 = await creerClient(repo, A, { nom: "OK", email: "ok@a.fr" });

    const result = await envoyerMessageClients(repo, optout, email, fakeDb(), A, {
      clientIds: [c1.id, c2.id],
      sujet: "Test",
      corps: "<p>Msg</p>",
      appUrl: "https://test.operioz.com",
      unsubscribeSecret: "secret",
    });

    expect(result.envoyes).toBe(1);
    expect(result.errors).toBe(1);
  });
});
