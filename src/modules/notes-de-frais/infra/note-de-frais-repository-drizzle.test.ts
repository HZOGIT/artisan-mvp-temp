import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { NoteDeFraisRepositoryDrizzle } from "./note-de-frais-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 994001;
const B = 994002;
const UA = 994101;
const UB = 994102;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
let seq = 0;
const numero = () => `NDF-${A}-${++seq}`;

describe.skipIf(!URL)("NoteDeFraisRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new NoteDeFraisRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from notes_de_frais where artisan_id in ($1,$2)', [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    // user_id est NOT NULL : on seed un utilisateur réel par tenant.
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const n = await repo.create(ctx(A), { userId: UA, numero: numero(), titre: "Frais juin", periodeDebut: "2026-06-01", periodeFin: "2026-06-30", montantTotal: "150.00" });
    expect(n.id).toBeGreaterThan(0);
    expect(n.artisanId).toBe(A);
    expect(n.statut).toBe("brouillon"); // défaut PG
    expect(n.montantTotal).toBe("150.00");
    expect((await repo.getById(ctx(A), n.id))?.titre).toBe("Frais juin");
    expect((await repo.list(ctx(A))).some((x) => x.id === n.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas la note de A", async () => {
    const n = await repo.create(ctx(A), { userId: UA, numero: numero(), titre: "Secret", periodeDebut: "2026-07-01", periodeFin: "2026-07-31" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), n.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === n.id)).toBe(false);
    expect(await repo.update(ctx(B), n.id, { titre: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), n.id)).toBe(false);
    expect((await repo.getById(ctx(A), n.id))?.titre).toBe("Secret");
  });

  it("update : métadonnées seulement ; statut inchangé, champs non fournis préservés", async () => {
    const n = await repo.create(ctx(A), { userId: UA, numero: numero(), titre: "Avant", periodeDebut: "2026-08-01", periodeFin: "2026-08-31", montantTotal: "100.00" });
    const maj = await repo.update(ctx(A), n.id, { titre: "Après" });
    expect(maj?.titre).toBe("Après");
    expect(maj?.statut).toBe("brouillon"); // workflow non touché par update
    expect(maj?.montantTotal).toBe("100.00"); // champ non fourni préservé
  });

  it("delete : supprime la note, scopé", async () => {
    const n = await repo.create(ctx(A), { userId: UA, numero: numero(), titre: "ASupprimer", periodeDebut: "2026-09-01", periodeFin: "2026-09-30" });
    expect(await repo.delete(ctx(A), n.id)).toBe(true);
    expect(await repo.getById(ctx(A), n.id)).toBeNull();
  });
});
