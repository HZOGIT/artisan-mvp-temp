import { describe, it, expect } from "vitest";
import { createSearchModule } from "./search.module";
import { FakeSearchReader } from "./infra/search-reader-fake";

describe("search.module", () => {
  it("createSearchModule câble le reader injecté", () => {
    const reader = new FakeSearchReader();
    const module = createSearchModule({ reader });
    expect(module.deps.reader).toBe(reader);
  });

  it("expose le routeur tRPC (global)", () => {
    const module = createSearchModule({ reader: new FakeSearchReader() });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["global"]);
  });
});
