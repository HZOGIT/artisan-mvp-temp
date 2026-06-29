import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { EcritureRepositoryDrizzle } from "./ecriture-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";
import type { CreateEcritureInput } from "../domain/ecriture";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9941001;
const B = 9941002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

// Pièce de vente ÉQUILIBRÉE (411 débit 120 / 706 crédit 100 / 445 crédit 20) liée à une facture.
const pieceVente = (factureId: number): CreateEcritureInput[] => {
  const d = new Date("2026-06-14T00:00:00Z");
  return [
    { dateEcriture: d, journal: "VE", numeroCompte: "411000", libelle: "Facture F1", pieceRef: "FAC-00001", debit: "120.00", factureId },
    { dateEcriture: d, journal: "VE", numeroCompte: "706000", libelle: "Facture F1", pieceRef: "FAC-00001", credit: "100.00", factureId },
    { dateEcriture: d, journal: "VE", numeroCompte: "445711", libelle: "Facture F1", pieceRef: "FAC-00001", credit: "20.00", factureId },
  ];
};

describe.skipIf(!URL)("EcritureRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new EcritureRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from ecritures_comptables where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("createMany (pièce équilibrée) + list/listByFacture scopés au tenant ; artisanId forcé", async () => {
    const created = await repo.createMany(ctx(A), pieceVente(501));
    expect(created.length).toBe(3);
    expect(created.every((e) => e.artisanId === A)).toBe(true);
    // Équilibre Σdébit = Σcrédit (l'invariant porté par le use-case, vérifié sur la pièce seedée).
    const sumD = created.reduce((s, e) => s + Number(e.debit), 0);
    const sumC = created.reduce((s, e) => s + Number(e.credit), 0);
    expect(sumD).toBeCloseTo(sumC, 2);
    expect((await repo.listByFacture(ctx(A), 501)).length).toBe(3);
    expect((await repo.list(ctx(A))).some((e) => e.factureId === 501)).toBe(true);
  });

  it("défauts : debit/credit '0.00' quand omis ; pointage false", async () => {
    const [e] = await repo.createMany(ctx(A), [
      { dateEcriture: new Date(), journal: "OD", numeroCompte: "471000", libelle: "Attente", factureId: 502 },
    ]);
    expect(e.debit).toBe("0.00");
    expect(e.credit).toBe("0.00");
    expect(e.pointage).toBe(false);
  });

  it("isolation cross-tenant : B ne lit pas les écritures de A ; deleteByFacture(B) = 0", async () => {
    await repo.createMany(ctx(A), pieceVente(503));
    expect((await repo.listByFacture(ctx(B), 503))).toEqual([]);
    expect((await repo.list(ctx(B))).some((e) => e.factureId === 503)).toBe(false);
    expect(await repo.deleteByFacture(ctx(B), 503)).toBe(0); // B ne supprime pas la pièce de A
    expect((await repo.listByFacture(ctx(A), 503)).length).toBe(3); // A intacte
  });

  it("deleteByFacture idempotent (delete-then-insert) : supprime la pièce puis re-crée proprement", async () => {
    await repo.createMany(ctx(A), pieceVente(504));
    expect(await repo.deleteByFacture(ctx(A), 504)).toBe(3);
    expect((await repo.listByFacture(ctx(A), 504))).toEqual([]);
    expect(await repo.deleteByFacture(ctx(A), 504)).toBe(0); // déjà vide → idempotent
    const recree = await repo.createMany(ctx(A), pieceVente(504));
    expect(recree.length).toBe(3);
  });

  it("validateByFacture + hasValidatedEcritures : inaltérabilité OPE-118 (écritures → validée)", async () => {
    await repo.createMany(ctx(A), pieceVente(510));
    expect(await repo.hasValidatedEcritures(ctx(A), 510)).toBe(false);
    const count = await repo.validateByFacture(ctx(A), 510);
    expect(count).toBe(3);
    expect(await repo.hasValidatedEcritures(ctx(A), 510)).toBe(true);
    const rows = await repo.listByFacture(ctx(A), 510);
    expect(rows.every((e) => e.statut === "validee")).toBe(true);
  });

  it("hasValidatedEcritures isolation tenant : B ne voit pas les validées de A", async () => {
    await repo.createMany(ctx(A), pieceVente(511));
    await repo.validateByFacture(ctx(A), 511);
    expect(await repo.hasValidatedEcritures(ctx(B), 511)).toBe(false);
  });
});
