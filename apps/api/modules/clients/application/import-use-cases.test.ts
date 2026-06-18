import { describe, it, expect } from "vitest";
import { importerClients } from "./import-use-cases";
import { FakeClientRepository } from "../infra/client-repository-fake";
import type { TenantContext } from "../../../shared/tenant";
import type { CreateClientInput } from "../domain/client";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = 3310001;
const B = 3310002;

describe("importerClients (import en masse best-effort, fake)", () => {
  it("toutes les lignes valides → imported = N, skipped = 0, clients créés", async () => {
    const repo = new FakeClientRepository();
    const rows: CreateClientInput[] = [{ nom: "Durand" }, { nom: "Martin", email: "m@test.com" }];
    const res = await importerClients(repo, ctx(A), rows);
    expect(res).toEqual({ imported: 2, skipped: 0 });
    expect((await repo.list(ctx(A))).length).toBe(2);
  });

  it("best-effort : les lignes invalides sont ignorées (skipped), l'import ne s'interrompt jamais", async () => {
    const repo = new FakeClientRepository();
    const rows: CreateClientInput[] = [
      { nom: "OK1" },
      { nom: "" }, // nom vide → ValidationError → skipped
      { nom: "  " }, // espaces seuls → skipped
      { nom: "BadMail", email: "pas-un-email" }, // email invalide → skipped
      { nom: "OK2", email: "ok@test.com" },
    ];
    const res = await importerClients(repo, ctx(A), rows);
    expect(res).toEqual({ imported: 2, skipped: 3 }); // OK1 + OK2 ; vides×2 + email invalide
    expect((await repo.list(ctx(A))).map((c) => c.nom).sort()).toEqual(["OK1", "OK2"]);
  });

  it("tableau vide → { imported: 0, skipped: 0 }", async () => {
    const repo = new FakeClientRepository();
    expect(await importerClients(repo, ctx(A), [])).toEqual({ imported: 0, skipped: 0 });
  });

  it("scope tenant : les clients sont créés sous l'artisan du contexte", async () => {
    const repo = new FakeClientRepository();
    await importerClients(repo, ctx(A), [{ nom: "ChezA" }]);
    expect((await repo.list(ctx(A))).length).toBe(1);
    expect(await repo.list(ctx(B))).toEqual([]); // rien ne fuit vers un autre tenant
  });
});
