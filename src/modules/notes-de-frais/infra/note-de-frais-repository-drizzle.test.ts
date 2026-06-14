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
    await admin.query('delete from notes_frais_depenses where note_id in (select id from notes_de_frais where artisan_id in ($1,$2))', [A, B]);
    await admin.query("delete from depenses where artisan_id in ($1,$2)", [A, B]);
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

  it("addDepenseLink/removeDepenseLink : anti-IDOR + recalcul montant_total (remboursables seules)", async () => {
    const seedDep = async (artisanId: number, userId: number, ttc: string, remboursable: boolean) =>
      (
        await admin.query(
          "insert into depenses (artisan_id,user_id,numero,date_depense,categorie,montant_ht,montant_ttc,remboursable) values ($1,$2,$3,now(),$4,$5,$6,$7) returning id",
          [artisanId, userId, `DEP-${artisanId}-${Math.random().toString(36).slice(2, 8)}`, "repas", "100.00", ttc, remboursable],
        )
      ).rows[0].id as number;

    const note = await repo.create(ctx(A), { userId: UA, numero: numero(), titre: "Liens", periodeDebut: "2026-10-01", periodeFin: "2026-10-31" });
    const dRemb = await seedDep(A, UA, "120.00", true);
    const dNonRemb = await seedDep(A, UA, "300.00", false);
    const dB = await seedDep(B, UB, "999.00", true); // dépense d'un autre tenant

    // dépense remboursable du tenant → liée, total recalculé
    await repo.addDepenseLink(ctx(A), note.id, dRemb);
    expect((await repo.getById(ctx(A), note.id))?.montantTotal).toBe("120.00");
    // idempotent (contrainte unique)
    await repo.addDepenseLink(ctx(A), note.id, dRemb);
    expect((await repo.getById(ctx(A), note.id))?.montantTotal).toBe("120.00");
    // dépense NON remboursable → ignorée (total inchangé)
    await repo.addDepenseLink(ctx(A), note.id, dNonRemb);
    expect((await repo.getById(ctx(A), note.id))?.montantTotal).toBe("120.00");
    // anti-IDOR : dépense d'un AUTRE tenant → ignorée
    await repo.addDepenseLink(ctx(A), note.id, dB);
    expect((await repo.getById(ctx(A), note.id))?.montantTotal).toBe("120.00");
    // anti-IDOR : B ne peut pas lier à la note de A (note pas à B) → skip
    await repo.addDepenseLink(ctx(B), note.id, dB);
    expect((await repo.getById(ctx(A), note.id))?.montantTotal).toBe("120.00");
    // retrait → recalcul à 0
    await repo.removeDepenseLink(ctx(A), note.id, dRemb);
    expect((await repo.getById(ctx(A), note.id))?.montantTotal).toBe("0.00");
  });
});
