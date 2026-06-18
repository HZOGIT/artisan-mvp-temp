import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { NotificationRepositoryDrizzle } from "./notification-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9950011;
const B = 9950012;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("NotificationRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new NotificationRepositoryDrizzle(app.db);

  const cleanup = () => admin.query('delete from notifications where "artisanId" in ($1,$2)', [A, B]);
  const seed = async (artisanId: number, titre: string, opts?: { lu?: boolean; archived?: boolean }) => {
    const { rows } = await admin.query(
      'insert into notifications ("artisanId", titre, lu, archived, "createdAt") values ($1,$2,$3,$4,now()) returning id',
      [artisanId, titre, opts?.lu ?? false, opts?.archived ?? false],
    );
    return rows[0].id as number;
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("list scopée + filtres (archived / non lues) + countUnread", async () => {
    await cleanup();
    await seed(A, "N1");
    await seed(A, "N2", { lu: true });
    await seed(A, "N3-arch", { archived: true });
    await seed(B, "B1"); // autre tenant

    // par défaut : non archivées du tenant A → N1, N2 (pas N3-arch, pas B1)
    const list = await repo.list(ctx(A));
    expect(list.map((n) => n.titre).sort()).toEqual(["N1", "N2"]);
    // non lues uniquement → N1
    expect((await repo.list(ctx(A), { nonLuesUniquement: true })).map((n) => n.titre)).toEqual(["N1"]);
    // includeArchived → N1, N2, N3-arch
    expect((await repo.list(ctx(A), { includeArchived: true })).length).toBe(3);
    // countUnread (non lue + non archivée) → 1 (N1)
    expect(await repo.countUnread(ctx(A))).toBe(1);
  });

  it("pagination bornée (limit/offset poussés en SQL)", async () => {
    await cleanup();
    for (let i = 0; i < 5; i++) await seed(A, `P${i}`);
    expect((await repo.list(ctx(A), { limit: 2, page: 1 })).length).toBe(2);
    expect((await repo.list(ctx(A), { limit: 2, page: 3 })).length).toBe(1);
    // limit > 100 borné à 100 (pas d'erreur)
    expect((await repo.list(ctx(A), { limit: 9999 })).length).toBe(5);
  });

  it("isolation cross-tenant : B ne marque/archive pas la notif de A", async () => {
    await cleanup();
    const idA = await seed(A, "Secret");
    await expectCrossTenantDenied(async () => {
      const ok = await repo.markAsRead(ctx(B), idA);
      if (!ok) throw new (await import("../../../shared/errors")).NotFoundError();
    });
    expect(await repo.markAsRead(ctx(B), idA)).toBe(false);
    expect(await repo.archive(ctx(B), idA)).toBe(false);
    // A intacte
    const [a] = await repo.list(ctx(A));
    expect(a.lu).toBe(false);
    expect(a.archived).toBe(false);
  });

  it("markAllAsRead ne touche que le tenant", async () => {
    await cleanup();
    await seed(A, "A1");
    await seed(A, "A2");
    const idB = await seed(B, "B1");
    expect(await repo.markAllAsRead(ctx(A))).toBe(2);
    expect(await repo.countUnread(ctx(A))).toBe(0);
    // B intact
    expect(await repo.countUnread(ctx(B))).toBe(1);
    expect(await repo.markAsRead(ctx(B), idB)).toBe(true);
  });
});
