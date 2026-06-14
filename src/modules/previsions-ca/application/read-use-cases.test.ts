import { describe, it, expect } from "vitest";
import { FakePrevisionCARepository } from "../infra/prevision-ca-repository-fake";
import { listPrevisions, previsionsParAnnee, getPrevision } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("previsions-ca — read use-cases", () => {
  it("listPrevisions renvoie les prévisions du tenant", async () => {
    const repo = new FakePrevisionCARepository();
    await repo.create(A, { mois: 3, annee: 2026 });
    expect(await listPrevisions(repo, A)).toHaveLength(1);
    expect(await listPrevisions(repo, B)).toEqual([]);
  });

  it("previsionsParAnnee filtre sur l'année ; [] si aucune", async () => {
    const repo = new FakePrevisionCARepository();
    await repo.create(A, { mois: 1, annee: 2026 });
    await repo.create(A, { mois: 2, annee: 2025 });
    expect((await previsionsParAnnee(repo, A, 2026)).map((p) => p.mois)).toEqual([1]);
    expect(await previsionsParAnnee(repo, A, 2099)).toEqual([]);
  });

  it("getPrevision → NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await repo.create(A, { mois: 3, annee: 2026 });
    expect((await getPrevision(repo, A, p.id)).mois).toBe(3);
    await expect(getPrevision(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPrevision(repo, B, p.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
