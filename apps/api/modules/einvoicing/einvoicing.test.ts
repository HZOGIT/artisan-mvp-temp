import { describe, it, expect } from "vitest";
import { isTerminal } from "../../../../drizzle/schema/einvoicing";
import { isValidSiret } from "../../../../packages/contract/validation";
import type { AppContext } from "../../interface/trpc/context";
import type { TenantContext } from "../../shared/tenant";
import type { DbClient } from "../../shared/db";
import { FakePaAdapter } from "./infra/fake-pa-adapter";
import { ensureArtisanEntity } from "./application/ensure-artisan-entity";
import { createEinvoicingRouter } from "./interface/trpc/einvoicing.router";

const fakeLog = { child: () => fakeLog, info: () => {}, warn: () => {}, error: () => {} } as unknown as AppContext["log"];
const tenant = (artisanId = 1): TenantContext => ({ artisanId, userId: 99 });
const ctx = (artisanId = 1): AppContext => ({
  claims: { userId: 99, email: "t@t.fr" },
  tenant: tenant(artisanId),
  role: null,
  permissions: [],
  res: null,
  clientIp: "unknown",
  userAgent: "unknown",
  log: fakeLog,
});

function makeSelectChain(rows: unknown[]) {
  const chain = { from: () => chain, where: () => chain, limit: () => Promise.resolve(rows) };
  return chain;
}

function makeFakeTx(selectRows: unknown[] = [], onInsert?: () => void) {
  const chain = makeSelectChain(selectRows);
  return {
    execute: () => Promise.resolve({ rows: [] }),
    select: () => chain,
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => { onInsert?.(); return Promise.resolve(); },
      }),
    }),
  };
}

describe("isTerminal", () => {
  it("refusee et rejetee sont terminaux", () => {
    expect(isTerminal("refusee")).toBe(true);
    expect(isTerminal("rejetee")).toBe(true);
  });

  it("autres statuts ne sont pas terminaux", () => {
    expect(isTerminal("non_soumise")).toBe(false);
    expect(isTerminal("deposee")).toBe(false);
    expect(isTerminal("approuvee")).toBe(false);
    expect(isTerminal("encaissee")).toBe(false);
  });
});

describe("isValidSiret", () => {
  it("SIRET Luhn valide retourne true", () => {
    expect(isValidSiret("83814693700027")).toBe(true);
  });
  it("SIRET Luhn invalide retourne false", () => {
    expect(isValidSiret("12345678901234")).toBe(false);
  });
  it("chaîne trop courte retourne false", () => {
    expect(isValidSiret("1234567890")).toBe(false);
  });
});

describe("einvoicing.emettre", () => {
  it("lève PRECONDITION_FAILED si aucune entité PA active en base", async () => {
    const db = {
      transaction: (fn: (tx: unknown) => unknown) => fn(makeFakeTx([])),
    } as unknown as DbClient;
    const r = createEinvoicingRouter(new FakePaAdapter(), db);
    await expect(r.createCaller(ctx()).emettre({ factureId: 1 }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("soumet la facture si une entité PA active existe", async () => {
    const db = {
      transaction: (fn: (tx: unknown) => unknown) => fn(makeFakeTx([{ paEntityId: "fake-entity-abc" }])),
    } as unknown as DbClient;
    const r = createEinvoicingRouter(new FakePaAdapter(), db);
    const result = await r.createCaller(ctx()).emettre({ factureId: 42 });
    expect(result.paDocumentId).toBeDefined();
    expect(result.statut).toBe("soumis");
  });
});

describe("ensureArtisanEntity", () => {
  it("lève une erreur si l'artisan n'a pas de SIRET", async () => {
    const db = {
      select: () => makeSelectChain([{ siret: null, nomEntreprise: "Test", email: "t@t.fr" }]),
    } as unknown as DbClient;
    await expect(ensureArtisanEntity(db, new FakePaAdapter(), tenant()))
      .rejects.toThrow("SIRET manquant");
  });

  it("retourne paEntityId et kybStatut via FakePaAdapter et upserte pa_entites", async () => {
    let upserted = false;
    const db = {
      select: () => makeSelectChain([{ siret: "83814693700027", nomEntreprise: "ACME", email: "a@a.fr" }]),
      transaction: (fn: (tx: unknown) => unknown) => fn(makeFakeTx([], () => { upserted = true; })),
    } as unknown as DbClient;
    const result = await ensureArtisanEntity(db, new FakePaAdapter(), tenant());
    expect(result.paEntityId).toBe("fake-entity-83814693700027");
    expect(result.kybStatut).toBe("validé");
    expect(upserted).toBe(true);
  });
});
