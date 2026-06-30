import { describe, it, expect, beforeEach } from "vitest";
import { FakeNotificationRepository } from "../infra/notification-repository-fake";
import { marquerLue, marquerToutesLues, archiver } from "./write-use-cases";
import { compterNonLues } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("notifications — use-cases écriture (repo mocké)", () => {
  let repo: FakeNotificationRepository;
  let notifA: number;

  beforeEach(() => {
    repo = new FakeNotificationRepository();
    notifA = repo.seed({ artisanId: 1, titre: "N1" }).id;
    repo.seed({ artisanId: 1, titre: "N2" });
    repo.seed({ artisanId: 2, titre: "B1" });
  });

  it("marquerLue : OK pour le propriétaire / cross-tenant → NotFound (anti-IDOR)", async () => {
    await marquerLue(repo, A, notifA);
    expect(await compterNonLues(repo, A)).toBe(1); // reste N2
    await expect(marquerLue(repo, B, notifA)).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => marquerLue(repo, B, notifA));
  });

  it("marquerToutesLues : IDs du tenant + ne touche pas l'autre", async () => {
    const ids = await marquerToutesLues(repo, A);
    expect(ids).toHaveLength(2);
    expect(await compterNonLues(repo, A)).toBe(0);
    expect(await compterNonLues(repo, B)).toBe(1); // B intact
  });

  it("archiver : OK pour le propriétaire / cross-tenant → NotFound", async () => {
    await archiver(repo, A, notifA);
    // archivée → exclue de la liste par défaut
    expect((await repo.list(A)).some((n) => n.id === notifA)).toBe(false);
    await expect(archiver(repo, B, notifA)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("marquerLue / archiver sur un id inexistant → NotFound", async () => {
    await expect(marquerLue(repo, A, 99999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiver(repo, A, 99999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
