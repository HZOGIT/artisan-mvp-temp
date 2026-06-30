import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { TechnicienRepositoryDrizzle } from "./technicien-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9940021;
const B = 9940022;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("TechnicienRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new TechnicienRepositoryDrizzle(app.db);

  const cleanup = async () => {
    const ids = `(select id from techniciens where "artisanId" in ($1,$2))`;
    for (const t of [
      "historique_deplacements", "habilitations_techniciens", "push_subscriptions",
      "preferences_notifications", "historique_notifications_push",
      "positions_techniciens", "disponibilites_techniciens",
      "badges_techniciens", "objectifs_techniciens", "classement_techniciens",
    ]) {
      await admin.query(`delete from ${t} where "technicienId" in ${ids}`, [A, B]);
    }
    await admin.query('delete from techniciens where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const t = await repo.create(ctx(A), { nom: "Martin", prenom: "Léa", coutHoraire: "35.00" });
    expect(t.id).toBeGreaterThan(0);
    expect(t.artisanId).toBe(A);
    expect((await repo.getById(ctx(A), t.id))?.nom).toBe("Martin");
    expect((await repo.list(ctx(A))).some((x) => x.id === t.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le technicien de A", async () => {
    const t = await repo.create(ctx(A), { nom: "Secret" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), t.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === t.id)).toBe(false);
    expect(await repo.update(ctx(B), t.id, { nom: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), t.id)).toBe(false);
    expect((await repo.getById(ctx(A), t.id))?.nom).toBe("Secret");
  });

  it("update : modifie les champs scopés au tenant", async () => {
    const t = await repo.create(ctx(A), { nom: "AvantMaj", statut: "actif" });
    const maj = await repo.update(ctx(A), t.id, { statut: "conge", specialite: "Plomberie" });
    expect(maj?.statut).toBe("conge");
    expect(maj?.specialite).toBe("Plomberie");
  });

  it("delete : purge le technicien + ses sous-ressources (cascade), scopé tenant", async () => {
    const t = await repo.create(ctx(A), { nom: "ASupprimer" });
    await admin.query(
      'insert into disponibilites_techniciens ("technicienId","jourSemaine","heureDebut","heureFin") values ($1,$2,$3,$4)',
      [t.id, 1, "08:00", "17:00"],
    );
    await admin.query(
      'insert into positions_techniciens ("technicienId", latitude, longitude) values ($1,$2,$3)',
      [t.id, "48.85", "2.35"],
    );
    expect(await repo.delete(ctx(A), t.id)).toBe(true);
    expect(await repo.getById(ctx(A), t.id)).toBeNull();
    const dispos = await admin.query('select count(*)::int as n from disponibilites_techniciens where "technicienId"=$1', [t.id]);
    const pos = await admin.query('select count(*)::int as n from positions_techniciens where "technicienId"=$1', [t.id]);
    expect(dispos.rows[0].n).toBe(0);
    expect(pos.rows[0].n).toBe(0);
  });

  it("delete RGPD : purge GPS, habilitations, push-subscriptions et historique notifications (OPE-815)", async () => {
    const t = await repo.create(ctx(A), { nom: "TechRGPD" });
    await admin.query(
      'insert into historique_deplacements ("technicienId","dateDebut") values ($1,now())',
      [t.id],
    );
    await admin.query(
      'insert into habilitations_techniciens ("technicienId","artisanId",type) values ($1,$2,$3)',
      [t.id, A, "Habilitation électrique"],
    );
    await admin.query(
      "insert into push_subscriptions (\"technicienId\",endpoint,p256dh,auth) values ($1,'https://push.example.com/x','key','auth')",
      [t.id],
    );
    await admin.query(
      'insert into preferences_notifications ("technicienId") values ($1)',
      [t.id],
    );
    await admin.query(
      "insert into historique_notifications_push (\"technicienId\",type,titre) values ($1,'assignation','Nouvelle mission')",
      [t.id],
    );

    expect(await repo.delete(ctx(A), t.id)).toBe(true);
    expect(await repo.getById(ctx(A), t.id)).toBeNull();

    const counts = await Promise.all([
      admin.query('select count(*)::int n from historique_deplacements where "technicienId"=$1', [t.id]),
      admin.query('select count(*)::int n from habilitations_techniciens where "technicienId"=$1', [t.id]),
      admin.query('select count(*)::int n from push_subscriptions where "technicienId"=$1', [t.id]),
      admin.query('select count(*)::int n from preferences_notifications where "technicienId"=$1', [t.id]),
      admin.query('select count(*)::int n from historique_notifications_push where "technicienId"=$1', [t.id]),
    ]);
    for (const r of counts) expect(r.rows[0].n).toBe(0);
  });
});
