import { describe, it, expect } from "vitest";
import { drainEmailEntry, MAX_TENTATIVES } from "../infra/email-outbox-drainer";

const fakeEntry = (overrides: Partial<{ id: number; toEmail: string; subject: string; html: string; fromName: string | null; replyTo: string | null; attachments: unknown; tentatives: number }> = {}) => ({
  id: 1,
  toEmail: "client@example.com",
  subject: "Votre facture",
  html: "<p>Bonjour</p>",
  fromName: null,
  replyTo: null,
  attachments: null,
  tentatives: 0,
  ...overrides,
});

describe("drainEmailEntry", () => {
  it("pending → sent sur succès envoi", async () => {
    const updates: Array<{ id: number; set: Record<string, unknown> }> = [];
    const fakeSender = { send: async () => {} };
    await drainEmailEntry(
      fakeEntry(),
      fakeSender,
      async (id, set) => { updates.push({ id, set }); },
    );
    expect(updates[0]?.set.statut).toBe("sent");
    expect(updates[0]?.set.traiteeAt).toBeInstanceOf(Date);
  });

  it("idempotencyKey = `email-outbox-<id>` transmise au sender (anti-régression OPE-811)", async () => {
    const received: import("../ports/email").EmailMessage[] = [];
    const fakeSender = { send: async (m: import("../ports/email").EmailMessage) => { received.push(m); } };
    await drainEmailEntry(fakeEntry({ id: 42 }), fakeSender, async () => {});
    expect(received[0]?.idempotencyKey).toBe("email-outbox-42");
  });

  it("erreur transitoire → tentatives++ ; dead si MAX_TENTATIVES atteint", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const fakeSender = { send: async () => { throw new Error("Resend 503"); } };
    await drainEmailEntry(
      fakeEntry({ tentatives: MAX_TENTATIVES - 1 }),
      fakeSender,
      async (_id, set) => { updates.push(set); },
    );
    expect(updates[0]?.statut).toBe("dead");
    expect(updates[0]?.tentatives).toBe(MAX_TENTATIVES);
    expect(updates[0]?.derniereErreur).toBe("Resend 503");
  });

  it("première erreur → reste pending (retry autorisé)", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const fakeSender = { send: async () => { throw new Error("timeout"); } };
    await drainEmailEntry(
      fakeEntry({ tentatives: 0 }),
      fakeSender,
      async (_id, set) => { updates.push(set); },
    );
    expect(updates[0]?.statut).toBe("pending");
    expect(updates[0]?.tentatives).toBe(1);
  });
});
