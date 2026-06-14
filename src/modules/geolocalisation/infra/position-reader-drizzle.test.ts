import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { TechnicienPositionReaderDrizzle } from "./position-reader-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9938001;
const B = 9938002;
const UA = 9938003;
const UB = 9938004;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("TechnicienPositionReaderDrizzle (PG, RLS techniciens + dernière position via parent)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new TechnicienPositionReaderDrizzle(app.db);
  let techA1 = 0;
  let techA2 = 0;
  let techB1 = 0;

  const cleanup = async () => {
    await admin.query('delete from positions_techniciens where "technicienId" in (select id from techniciens where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from techniciens where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from artisans where id in ($1,$2)", [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [A, UA]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [B, UB]);
    techA1 = (await admin.query('insert into techniciens ("artisanId",nom,prenom,specialite) values ($1,$2,$3,$4) returning id', [A, "Alpha", "Jean", "plomberie"])).rows[0].id;
    techA2 = (await admin.query('insert into techniciens ("artisanId",nom) values ($1,$2) returning id', [A, "Beta"])).rows[0].id;
    techB1 = (await admin.query('insert into techniciens ("artisanId",nom) values ($1,$2) returning id', [B, "Gamma"])).rows[0].id;
    const pos = (techId: number, lat: string, lng: string, ts: string, batt: number) =>
      admin.query('insert into positions_techniciens ("technicienId",latitude,longitude,"timestamp",batterie) values ($1,$2,$3,$4,$5)', [techId, lat, lng, ts, batt]);
    // techA1 : deux positions → on attend la plus récente (2026-01-02).
    await pos(techA1, "48.10000000", "2.10000000", "2026-01-01T10:00:00Z", 50);
    await pos(techA1, "48.20000000", "2.20000000", "2026-01-02T10:00:00Z", 70);
    // techA2 : aucune position. techB1 : une position (ne doit jamais apparaître pour A).
    await pos(techB1, "43.00000000", "5.00000000", "2026-01-03T10:00:00Z", 90);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getPositions(A) : techniciens de A + dernière position (la plus récente), techB exclu", async () => {
    const res = await reader.getPositions(ctx(A));
    expect(res.map((t) => t.id).sort((a, b) => a - b)).toEqual([techA1, techA2].sort((a, b) => a - b));
    const a1 = res.find((t) => t.id === techA1)!;
    expect(a1.prenom).toBe("Jean");
    expect(a1.position?.latitude).toBe("48.20000000"); // la plus récente
    expect(a1.position?.batterie).toBe(70);
    const a2 = res.find((t) => t.id === techA2)!;
    expect(a2.position).toBeNull();
  });

  it("isolation : B ne voit que son technicien et sa position", async () => {
    const res = await reader.getPositions(ctx(B));
    expect(res.map((t) => t.id)).toEqual([techB1]);
    expect(res[0].position?.latitude).toBe("43.00000000");
  });
});
