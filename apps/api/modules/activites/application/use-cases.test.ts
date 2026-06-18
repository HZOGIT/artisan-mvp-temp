import { describe, it, expect } from "vitest";
import { ForbiddenError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { FakeActiviteRepository } from "../infra/activite-repository-fake";
import { basculerFait, creerActivite, listActivites, supprimerActivite } from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = 1;
const B = 2;

describe("activites use-cases", () => {
  it("listActivites : scopé tenant, à-faire d'abord puis échéance croissante", async () => {
    const repo = new FakeActiviteRepository();
    repo.seed({ artisanId: A, titre: "Fait tôt", echeance: "2026-01-01", fait: true });
    repo.seed({ artisanId: A, titre: "À faire tard", echeance: "2026-03-01" });
    repo.seed({ artisanId: A, titre: "À faire tôt", echeance: "2026-02-01" });
    repo.seed({ artisanId: B, titre: "Autre tenant", echeance: "2026-01-01" });
    const list = await listActivites(repo, ctx(A));
    expect(list.map((a) => a.titre)).toEqual(["À faire tôt", "À faire tard", "Fait tôt"]);
  });

  it("creerActivite : normalise l'échéance (YYYY-MM-DD) et crée", async () => {
    const repo = new FakeActiviteRepository();
    const a = await creerActivite(repo, ctx(A), { type: "appel", titre: "Rappeler client", echeance: "2026-06-14T10:30:00Z" });
    expect(a.echeance).toBe("2026-06-14");
    expect(a.type).toBe("appel");
    expect(a.entiteType).toBe("aucun");
  });

  it("creerActivite : échéance invalide → ValidationError", async () => {
    const repo = new FakeActiviteRepository();
    await expect(creerActivite(repo, ctx(A), { type: "autre", titre: "X", echeance: "pas-une-date" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerActivite : rattachement entité possédée → OK ; entité d'un autre tenant → ForbiddenError", async () => {
    const repo = new FakeActiviteRepository();
    repo.registerEntite(A, "client", 50);
    repo.registerEntite(B, "client", 60);
    const ok = await creerActivite(repo, ctx(A), { type: "relance", titre: "Relancer", echeance: "2026-06-14", entiteType: "client", entiteId: 50 });
    expect(ok.entiteId).toBe(50);
    await expect(
      creerActivite(repo, ctx(A), { type: "relance", titre: "Hack", echeance: "2026-06-14", entiteType: "client", entiteId: 60 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creerActivite : entiteId fourni sans type cohérent (aucun) → rattachement neutralisé", async () => {
    const repo = new FakeActiviteRepository();
    const a = await creerActivite(repo, ctx(A), { type: "autre", titre: "X", echeance: "2026-06-14", entiteType: "aucun", entiteId: 99 });
    expect(a.entiteId).toBeNull();
    expect(a.entiteType).toBe("aucun");
  });

  it("basculerFait : succès idempotent (parité legacy) même cross-tenant ; n'affecte pas la cible", async () => {
    const repo = new FakeActiviteRepository();
    const a = repo.seed({ artisanId: A, titre: "T", echeance: "2026-06-14" });
    expect(await basculerFait(repo, ctx(A), a.id, true)).toEqual({ success: true });
    expect((await listActivites(repo, ctx(A)))[0].fait).toBe(true);
    // Cross-tenant : succès renvoyé mais aucune modification de la ligne de A.
    expect(await basculerFait(repo, ctx(B), a.id, false)).toEqual({ success: true });
    expect((await listActivites(repo, ctx(A)))[0].fait).toBe(true);
  });

  it("supprimerActivite : succès idempotent ; cross-tenant ne supprime pas la cible", async () => {
    const repo = new FakeActiviteRepository();
    const a = repo.seed({ artisanId: A, titre: "T", echeance: "2026-06-14" });
    expect(await supprimerActivite(repo, ctx(B), a.id)).toEqual({ success: true });
    expect(await listActivites(repo, ctx(A))).toHaveLength(1);
    expect(await supprimerActivite(repo, ctx(A), a.id)).toEqual({ success: true });
    expect(await listActivites(repo, ctx(A))).toHaveLength(0);
  });
});
