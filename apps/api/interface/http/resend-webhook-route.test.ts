import { createHmac } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify from "fastify";
import { buildApp } from "../../app";
import type { IEmailLogWriter } from "../../modules/emails/application/email-log-writer";
import { FakeNotificationRepository } from "../../modules/notifications/infra/notification-repository-fake";
import { registerResendWebhookRoute } from "./resend-webhook-route";

const URL = process.env.DATABASE_URL;
const RAW_SECRET = "dGVzdHNlY3JldA=="; /* base64("testsecret") */
const SECRET = `whsec_${RAW_SECRET}`;

function sign(body: string, svixId = "msg_1", svixTimestamp = "1700000000"): string {
  const content = `${svixId}.${svixTimestamp}.${body}`;
  const sig = createHmac("sha256", Buffer.from(RAW_SECRET, "base64")).update(content).digest("base64");
  return `v1,${sig}`;
}

describe.skipIf(!URL)("POST /api/resend/webhook", () => {
  let app: ReturnType<typeof buildApp>;
  const fakeNotifRepo = new FakeNotificationRepository();
  const fakeWriter: IEmailLogWriter = {
    updateStatutByResendId: vi.fn().mockResolvedValue({ artisanId: 42, destinataire: "client@t.fr" }),
  };

  beforeAll(() => {
    app = buildApp({ resendWebhookSecret: SECRET, emailLogWriter: fakeWriter, notificationRepo: fakeNotifRepo });
  });
  afterAll(async () => {
    await app?.close();
  });

  const post = (body: object, headers: Record<string, string> = {}) => {
    return app.inject({
      method: "POST",
      url: "/api/resend/webhook",
      headers: { "content-type": "application/json", ...headers },
      payload: JSON.stringify(body),
    });
  };

  const postSigned = (body: object, svixId = "msg_1") => {
    const raw = JSON.stringify(body);
    return app.inject({
      method: "POST",
      url: "/api/resend/webhook",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": "1700000000",
        "svix-signature": sign(raw, svixId),
      },
      payload: raw,
    });
  };

  it("headers Svix manquants → 400", async () => {
    const res = await post({ type: "email.sent", data: {} });
    expect(res.statusCode).toBe(400);
  });

  it("signature altérée → 400", async () => {
    const body = { type: "email.sent", data: { email_id: "e1" } };
    const res = await post(body, {
      "svix-id": "msg_1",
      "svix-timestamp": "1700000000",
      "svix-signature": "v1,invalide",
    });
    expect(res.statusCode).toBe(400);
  });

  it("signature valide → 200", async () => {
    const body = { type: "email.delivered", data: { email_id: "e2" } };
    const raw = JSON.stringify(body);
    const res = await post(body, {
      "svix-id": "msg_2",
      "svix-timestamp": "1700000000",
      "svix-signature": sign(raw, "msg_2"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("email.bounced → writer appelé avec statut bounce + notification alerte créée", async () => {
    vi.mocked(fakeWriter.updateStatutByResendId).mockResolvedValueOnce({ artisanId: 42, destinataire: "client@t.fr" });
    const res = await postSigned({ type: "email.bounced", data: { email_id: "rid-bounce-1" } }, "msg_b1");
    expect(res.statusCode).toBe(200);
    expect(fakeWriter.updateStatutByResendId).toHaveBeenCalledWith("rid-bounce-1", "bounce");
    const notifs = await fakeNotifRepo.list({ artisanId: 42, userId: 0 });
    expect(notifs.some((n) => n.type === "alerte" && n.lien === "/emails")).toBe(true);
  });

  it("email.complained → writer appelé avec statut plainte + notification créée", async () => {
    vi.mocked(fakeWriter.updateStatutByResendId).mockResolvedValueOnce({ artisanId: 42, destinataire: "client@t.fr" });
    const countBefore = (await fakeNotifRepo.list({ artisanId: 42, userId: 0 })).length;
    const res = await postSigned({ type: "email.complained", data: { email_id: "rid-plainte-1" } }, "msg_p1");
    expect(res.statusCode).toBe(200);
    expect(fakeWriter.updateStatutByResendId).toHaveBeenCalledWith("rid-plainte-1", "plainte");
    expect((await fakeNotifRepo.list({ artisanId: 42, userId: 0 })).length).toBeGreaterThan(countBefore);
  });

  it("email.delivered → writer appelé avec statut delivre, aucune notification", async () => {
    vi.mocked(fakeWriter.updateStatutByResendId).mockResolvedValueOnce({ artisanId: 42, destinataire: "client@t.fr" });
    const countBefore = (await fakeNotifRepo.list({ artisanId: 42, userId: 0 })).length;
    const res = await postSigned({ type: "email.delivered", data: { email_id: "rid-del-1" } }, "msg_d1");
    expect(res.statusCode).toBe(200);
    expect(fakeWriter.updateStatutByResendId).toHaveBeenCalledWith("rid-del-1", "delivre");
    expect((await fakeNotifRepo.list({ artisanId: 42, userId: 0 })).length).toBe(countBefore);
  });

  it("retry Svix (même svix-id, writer null car statut inchangé) → 200 sans notif dupliquée", async () => {
    vi.mocked(fakeWriter.updateStatutByResendId).mockResolvedValueOnce(null);
    const countBefore = (await fakeNotifRepo.list({ artisanId: 42, userId: 0 })).length;
    const res = await postSigned({ type: "email.bounced", data: { email_id: "rid-bounce-1" } }, "msg_b1");
    expect(res.statusCode).toBe(200);
    expect((await fakeNotifRepo.list({ artisanId: 42, userId: 0 })).length).toBe(countBefore);
  });

  it("writer retourne null (resendId inconnu) → 200 sans notification", async () => {
    vi.mocked(fakeWriter.updateStatutByResendId).mockResolvedValueOnce(null);
    const countBefore = (await fakeNotifRepo.list({ artisanId: 42, userId: 0 })).length;
    const res = await postSigned({ type: "email.bounced", data: { email_id: "rid-inconnu" } }, "msg_u1");
    expect(res.statusCode).toBe(200);
    expect((await fakeNotifRepo.list({ artisanId: 42, userId: 0 })).length).toBe(countBefore);
  });
});

const RAW_B = "c2VjcmV0Qg=="; /* base64("secretB") */
const SECRET_B = `whsec_${RAW_B}`;

function signWith(rawSecret: string, body: string, svixId = "msg_r1", svixTimestamp = "1700000001"): string {
  const content = `${svixId}.${svixTimestamp}.${body}`;
  const sig = createHmac("sha256", Buffer.from(rawSecret, "base64")).update(content).digest("base64");
  return `v1,${sig}`;
}

describe("POST /api/resend/webhook — rotation secret (getter par requête)", () => {
  let currentSecret = SECRET;
  const rotApp = Fastify();

  beforeAll(async () => {
    registerResendWebhookRoute(rotApp, { resendWebhookSecret: () => currentSecret });
    await rotApp.ready();
  });

  afterAll(() => rotApp.close());

  const inject = (body: object, svixId: string, rawSecret: string) => {
    const raw = JSON.stringify(body);
    return rotApp.inject({
      method: "POST",
      url: "/api/resend/webhook",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": "1700000001",
        "svix-signature": signWith(rawSecret, raw, svixId),
      },
      payload: raw,
    });
  };

  it("secret initial (A) → 200", async () => {
    const res = await inject({ type: "email.sent", data: {} }, "rot-1", RAW_SECRET);
    expect(res.statusCode).toBe(200);
  });

  it("rotation sans rebuild — secret B accepté, ancien A rejeté", async () => {
    currentSecret = SECRET_B;
    const resA = await inject({ type: "email.sent", data: {} }, "rot-2", RAW_SECRET);
    expect(resA.statusCode).toBe(400); /* ancien secret rejeté après rotation */
    const resB = await inject({ type: "email.sent", data: {} }, "rot-3", RAW_B);
    expect(resB.statusCode).toBe(200); /* nouveau secret accepté */
  });
});
