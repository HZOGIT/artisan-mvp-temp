import { describe, it, expect } from "vitest";
import { createEmailsModule } from "./emails.module";
import { FakeEmailLogReader } from "./infra/email-log-reader-fake";

describe("emails.module", () => {
  it("createEmailsModule câble le reader injecté", () => {
    const reader = new FakeEmailLogReader();
    const module = createEmailsModule({ reader });
    expect(module.deps.reader).toBe(reader);
  });

  it("expose le routeur tRPC (list)", () => {
    const module = createEmailsModule({ reader: new FakeEmailLogReader() });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["list"]);
  });
});
