import { describe, it, expect, beforeEach } from "vitest";
import { FakeNotificationRepository } from "../infra/notification-repository-fake";
import { listNotifications, compterNonLues } from "./read-use-cases";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("notifications — use-cases lecture (repo mocké)", () => {
  let repo: FakeNotificationRepository;

  beforeEach(() => {
    repo = new FakeNotificationRepository();
    repo.seed({ artisanId: 1, titre: "N1" });
    repo.seed({ artisanId: 1, titre: "N2", lu: true });
    repo.seed({ artisanId: 1, titre: "N3", archived: true });
    repo.seed({ artisanId: 2, titre: "B1" });
  });

  it("listNotifications : scopé tenant, exclut les archivées par défaut", async () => {
    expect((await listNotifications(repo, A)).map((n) => n.titre).sort()).toEqual(["N1", "N2"]);
    expect((await listNotifications(repo, B)).map((n) => n.titre)).toEqual(["B1"]);
  });

  it("listNotifications : filtres non lues / includeArchived", async () => {
    expect((await listNotifications(repo, A, { nonLuesUniquement: true })).map((n) => n.titre)).toEqual(["N1"]);
    expect((await listNotifications(repo, A, { includeArchived: true })).length).toBe(3);
  });

  it("listNotifications : pagination bornée", async () => {
    const repo2 = new FakeNotificationRepository();
    for (let i = 0; i < 5; i++) repo2.seed({ artisanId: 1, titre: `P${i}` });
    expect((await listNotifications(repo2, A, { limit: 2, page: 1 })).length).toBe(2);
    expect((await listNotifications(repo2, A, { limit: 2, page: 3 })).length).toBe(1);
    expect((await listNotifications(repo2, A, { limit: 9999 })).length).toBe(5); // clamp
  });

  it("compterNonLues : non lues + non archivées du tenant", async () => {
    expect(await compterNonLues(repo, A)).toBe(1); // N1 (N2 lue, N3 archivée)
    expect(await compterNonLues(repo, B)).toBe(1);
  });
});
