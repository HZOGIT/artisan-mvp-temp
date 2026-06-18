import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { FakeSearchReader } from "../infra/search-reader-fake";
import { globalSearch } from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe("search use-cases", () => {
  it("globalSearch : requête < 2 caractères (après trim) → vide SANS toucher le reader", async () => {
    const reader = new FakeSearchReader();
    expect(await globalSearch(reader, ctx(1), "a")).toEqual({ results: [] });
    expect(await globalSearch(reader, ctx(1), "  x ")).toEqual({ results: [] });
    expect(reader.callCount).toBe(0);
  });

  it("globalSearch : requête valide → trimée puis projetée", async () => {
    const reader = new FakeSearchReader();
    reader.seed(1, { clients: [{ id: 7, nom: "Test", prenom: null, email: "t@t.fr", telephone: null, ville: null }] });
    const res = await globalSearch(reader, ctx(1), "  Test  ");
    expect(reader.lastQuery).toBe("Test");
    expect(res.results).toEqual([{ id: 7, type: "client", title: "Test", subtitle: "t@t.fr", url: "/clients/7" }]);
  });

  it("globalSearch : scopé tenant (un autre tenant a ses propres correspondances)", async () => {
    const reader = new FakeSearchReader();
    reader.seed(1, { fournisseurs: [{ id: 1, nom: "ACME", email: null, telephone: null }] });
    reader.seed(2, {});
    expect((await globalSearch(reader, ctx(1), "ac")).results).toHaveLength(1);
    expect((await globalSearch(reader, ctx(2), "ac")).results).toHaveLength(0);
  });
});
