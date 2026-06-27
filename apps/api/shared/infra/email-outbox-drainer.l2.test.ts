import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../db";
import { runEmailOutboxDrain } from "./email-outbox-drainer";
import type { EmailMessage } from "../ports/email";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const EMAIL_PREFIX = "test-l2-skip-locked-";

describe.skipIf(!URL)("emailOutboxDrainer — FOR UPDATE SKIP LOCKED (L2, anti-régression P1)", () => {
  const admin = new Pool({ connectionString: URL });
  const h1 = createDbClient(APP_URL!);
  const h2 = createDbClient(APP_URL!);

  const cleanup = async () => {
    await admin.query("DELETE FROM email_outbox WHERE to_email LIKE $1", [`${EMAIL_PREFIX}%`]);
  };

  beforeAll(async () => {
    await cleanup();
    for (let i = 0; i < 4; i++) {
      await admin.query(
        "INSERT INTO email_outbox (to_email, subject, html) VALUES ($1, $2, $3)",
        [`${EMAIL_PREFIX}${i}@example.com`, `Sujet ${i}`, "<p>test</p>"],
      );
    }
  });

  afterAll(async () => {
    await cleanup();
    await admin.end();
    await h1.close();
    await h2.close();
  });

  it("deux drains concurrents n'envoient chaque email qu'une seule fois", async () => {
    const sent1: string[] = [];
    const sent2: string[] = [];

    /* drain1 utilise un sender lent pour maintenir la transaction ouverte et garder les SKIP LOCKED */
    const slowSender = {
      send: async (msg: EmailMessage) => {
        await new Promise<void>((r) => setTimeout(r, 30));
        sent1.push(msg.to);
      },
    };
    const fastSender = {
      send: async (msg: EmailMessage) => { sent2.push(msg.to); },
    };

    /* drain2 démarre 5 ms après drain1 — overlap garanti → SKIP LOCKED doit bloquer drain2 */
    await Promise.all([
      runEmailOutboxDrain(h1.db, slowSender),
      new Promise<void>((resolve) =>
        setTimeout(() => runEmailOutboxDrain(h2.db, fastSender).then(() => resolve()), 5),
      ),
    ]);

    const allSent = [...sent1, ...sent2];
    expect(allSent).toHaveLength(4);
    expect(new Set(allSent).size).toBe(4);
    expect(sent2).toHaveLength(0);
  });
});
