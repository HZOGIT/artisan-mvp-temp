import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { FakeEmailLogReader } from "../infra/email-log-reader-fake";
import type { EmailLogEntry } from "../domain/email-log";
import { listEmails } from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

const entry = (id: number, artisanId: number, over: Partial<EmailLogEntry> = {}): EmailLogEntry => ({
  id,
  artisanId,
  destinataire: "client@test.fr",
  sujet: `Sujet ${id}`,
  type: "transactional",
  resendId: null,
  statut: "sent",
  erreur: null,
  entiteType: null,
  entiteId: null,
  createdAt: new Date(2026, 0, id),
  ...over,
});

describe("emails use-cases", () => {
  it("listEmails : plus récents d'abord, scopé tenant", async () => {
    const reader = new FakeEmailLogReader();
    reader.seed(1, [entry(1, 1), entry(3, 1), entry(2, 1)]);
    reader.seed(2, [entry(9, 2)]);
    const list = await listEmails(reader, ctx(1));
    expect(list.map((e) => e.id)).toEqual([3, 2, 1]);
    expect(await listEmails(reader, ctx(2))).toHaveLength(1);
  });

  it("listEmails : filtre par entité (entiteType + entiteId)", async () => {
    const reader = new FakeEmailLogReader();
    reader.seed(1, [
      entry(1, 1, { entiteType: "devis", entiteId: 10 }),
      entry(2, 1, { entiteType: "facture", entiteId: 20 }),
      entry(3, 1, { entiteType: "devis", entiteId: 11 }),
    ]);
    expect((await listEmails(reader, ctx(1), { entiteType: "devis" })).map((e) => e.id)).toEqual([3, 1]);
    expect((await listEmails(reader, ctx(1), { entiteType: "facture", entiteId: 20 })).map((e) => e.id)).toEqual([2]);
  });

  it("listEmails : limite bornée", async () => {
    const reader = new FakeEmailLogReader();
    reader.seed(1, Array.from({ length: 10 }, (_, i) => entry(i + 1, 1)));
    expect(await listEmails(reader, ctx(1), { limit: 3 })).toHaveLength(3);
  });
});
