import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { UtilisateurRepositoryDrizzle } from "./utilisateur-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9941001;
const B = 9941002;
const OWNER_A = 9941003;
const COLLAB_A = 9941004;
const OWNER_B = 9941005;
const COLLAB_B = 9941006;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("UtilisateurRepositoryDrizzle (PG, tables HORS RLS → scope artisanId explicite)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new UtilisateurRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from permissions_utilisateur where "userId" in ($1,$2,$3,$4)', [OWNER_A, COLLAB_A, OWNER_B, COLLAB_B]);
    await admin.query("delete from artisans where id in ($1,$2)", [A, B]);
    await admin.query("delete from users where id in ($1,$2,$3,$4)", [OWNER_A, COLLAB_A, OWNER_B, COLLAB_B]);
  };

  beforeAll(async () => {
    await cleanup();
    // Owners (rattachés via artisans.userId, sans users.artisanId) + collaborateurs (users.artisanId).
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [OWNER_A, `o${OWNER_A}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [OWNER_B, `o${OWNER_B}@t.fr`]);
    await admin.query('insert into artisans (id, "userId", "nomEntreprise") values ($1,$2,$3)', [A, OWNER_A, "Entreprise A"]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [B, OWNER_B]);
    await admin.query('insert into users (id, email, password, role, "artisanId") values ($1,$2,\'x\',\'secretaire\',$3)', [COLLAB_A, `c${COLLAB_A}@t.fr`, A]);
    await admin.query('insert into users (id, email, password, role, "artisanId") values ($1,$2,\'x\',\'technicien\',$3)', [COLLAB_B, `c${COLLAB_B}@t.fr`, B]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("list : owner + collaborateurs de A uniquement (B exclu)", async () => {
    const rows = await repo.list(ctx(A));
    expect(rows.map((u) => u.id).sort((a, b) => a - b)).toEqual([OWNER_A, COLLAB_A].sort((a, b) => a - b));
    expect(rows.find((u) => u.id === OWNER_A)?.isOwner).toBe(true);
    expect(rows.find((u) => u.id === COLLAB_A)?.isOwner).toBe(false);
  });

  it("anti-IDOR : A ne peut PAS modifier le collaborateur de B (hors-RLS → scope explicite)", async () => {
    expect(await repo.updateRole(ctx(A), COLLAB_B, "secretaire")).toBeNull();
    expect(await repo.toggleActif(ctx(A), COLLAB_B, false)).toBeNull();
    expect(await repo.setPermissions(ctx(A), COLLAB_B, ["devis.voir"])).toBe(false);
    expect(await repo.getManageableUser(ctx(A), COLLAB_B)).toBeNull();
    // Le user de B est intact (role/actif inchangés).
    const [b] = (await admin.query('select role, actif from users where id=$1', [COLLAB_B])).rows;
    expect(b).toMatchObject({ role: "technicien", actif: true });
  });

  it("updateRole + setPermissions sur le collaborateur de A : OK et persistés", async () => {
    expect(await repo.updateRole(ctx(A), COLLAB_A, "technicien")).toEqual({ id: COLLAB_A, role: "technicien" });
    expect(await repo.setPermissions(ctx(A), COLLAB_A, ["devis.voir", "factures.voir"])).toBe(true);
    expect((await repo.getPermissions(COLLAB_A)).sort()).toEqual(["devis.voir", "factures.voir"]);
    // Réécriture (delete+insert) : pas de doublon.
    await repo.setPermissions(ctx(A), COLLAB_A, ["clients.voir"]);
    expect(await repo.getPermissions(COLLAB_A)).toEqual(["clients.voir"]);
  });

  it("getManageableUser inclut l'OWNER de A ; emailExists global ; nomEntreprise", async () => {
    expect(await repo.getManageableUser(ctx(A), OWNER_A)).toEqual({ id: OWNER_A, role: "artisan" });
    expect(await repo.emailExists(`c${COLLAB_A}@t.fr`)).toBe(true);
    expect(await repo.emailExists("inconnu@nowhere.fr")).toBe(false);
    expect(await repo.getNomEntreprise(ctx(A))).toBe("Entreprise A");
  });

  it("createCollaborateur : scopé tenant A, apparaît dans la liste", async () => {
    const created = await repo.createCollaborateur(ctx(A), { email: "fresh-collab@t.fr", name: "Nouveau", role: "secretaire", passwordHash: "hash" });
    try {
      expect(created.email).toBe("fresh-collab@t.fr");
      expect((await repo.list(ctx(A))).some((u) => u.id === created.id)).toBe(true);
      expect((await repo.list(ctx(B))).some((u) => u.id === created.id)).toBe(false);
    } finally {
      await admin.query("delete from users where id=$1", [created.id]);
    }
  });
});
