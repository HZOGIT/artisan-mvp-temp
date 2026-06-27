import { describe, it, expect, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient } from "../../shared/db/client";
import { FakePaAdapter } from "./infra/fake-pa-adapter";
import { pollInbound } from "../../shared/infra/pa-inbound-poller";
import type { InboundInvoice, InboundInvoiceFull } from "./domain/einvoicing";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ??
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

describe.skipIf(!URL)("pollInbound — RLS (L2)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanId = 0;

  afterAll(async () => {
    if (artisanId) {
      await admin.query(`delete from factures_entrantes where "artisanId" = $1`, [artisanId]).catch(() => {});
      await admin.query(`delete from pa_entites where "artisanId" = $1`, [artisanId]).catch(() => {});
      await admin.query("delete from artisans where id = $1", [artisanId]).catch(() => {});
    }
    await app.close().catch(() => {});
    await admin.end();
  });

  it("setup : crée artisan avec pa_entites done", async () => {
    const uId = (await admin.query("insert into users default values returning id")).rows[0].id as number;
    artisanId = (
      await admin.query(
        `insert into artisans ("userId", siret, "nomEntreprise") values ($1, '83814693700027', 'InboundTest') returning id`,
        [uId],
      )
    ).rows[0].id as number;
    await admin.query(
      `insert into pa_entites ("artisanId", fournisseur, "paEntityId", "statutProvisioning") values ($1, 'fake', 'entity-inbound', 'done')`,
      [artisanId],
    );
    expect(artisanId).toBeGreaterThan(0);
  });

  it("pollInbound avec FakePA → 1 doc → facture_entrante insérée sous RLS", async () => {
    const paWithDoc: typeof FakePaAdapter.prototype = Object.create(FakePaAdapter.prototype);
    const doc: InboundInvoice = { paDocumentId: "doc-l2-test", emetteurSiret: "00000000000000", montantTTC: "99.00", date: new Date("2026-01-01") };
    const full: InboundInvoiceFull = { ...doc, facturxBase64: "base64data" };
    paWithDoc.listInbound = (_id: string, _since: Date) => Promise.resolve([doc]);
    paWithDoc.fetchInbound = (_id: string) => Promise.resolve(full);

    const fetched = await pollInbound(paWithDoc, app.db);
    expect(fetched).toBe(1);

    const { rows } = await admin.query(
      `select count(*)::int as n from factures_entrantes where "artisanId" = $1 and "paDocumentId" = 'doc-l2-test'`,
      [artisanId],
    );
    expect((rows[0] as { n: number }).n).toBe(1);
  });

  it("idempotent — deuxième poll avec le même doc ne crée pas de doublon", async () => {
    const paWithDoc: typeof FakePaAdapter.prototype = Object.create(FakePaAdapter.prototype);
    const doc: InboundInvoice = { paDocumentId: "doc-l2-test", emetteurSiret: "00000000000000", montantTTC: "99.00", date: new Date("2026-01-01") };
    const full: InboundInvoiceFull = { ...doc, facturxBase64: "base64data" };
    paWithDoc.listInbound = () => Promise.resolve([doc]);
    paWithDoc.fetchInbound = () => Promise.resolve(full);

    await pollInbound(paWithDoc, app.db);

    const { rows } = await admin.query(
      `select count(*)::int as n from factures_entrantes where "artisanId" = $1 and "paDocumentId" = 'doc-l2-test'`,
      [artisanId],
    );
    expect((rows[0] as { n: number }).n).toBe(1);
  });
});
