import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { createDbClient } from "../../../shared/db";
import { EcritureRepositoryDrizzle } from "./ecriture-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";
import type { CreateEcritureInput } from "../domain/ecriture";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

/** Plage d'artisanIds unique à ce fichier (anti-collision run parallèle). */
const A = 9941001;
const B = 9941002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

const pieceVente = (factureId: number): CreateEcritureInput[] => {
  const d = new Date("2026-06-14T00:00:00Z");
  return [
    { dateEcriture: d, journal: "VE", numeroCompte: "411000", libelle: "Facture F1", pieceRef: "FAC-00001", debit: "120.00", factureId },
    { dateEcriture: d, journal: "VE", numeroCompte: "706000", libelle: "Facture F1", pieceRef: "FAC-00001", credit: "100.00", factureId },
    { dateEcriture: d, journal: "VE", numeroCompte: "445711", libelle: "Facture F1", pieceRef: "FAC-00001", credit: "20.00", factureId },
  ];
};

/** IDs des factures créées en beforeAll (réels, requis par la FK). */
let fIds: number[] = [];

describe.skipIf(!URL)("EcritureRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new EcritureRepositoryDrizzle(app.db);

  const cleanupEcritures = async () => {
    await admin.query('DELETE FROM ecritures_comptables WHERE "artisanId" IN ($1,$2)', [A, B]);
  };

  const cleanupFactures = async () => {
    if (fIds.length > 0) {
      await admin.query(`DELETE FROM factures WHERE id = ANY($1::int[])`, [fIds]);
    }
  };

  beforeAll(async () => {
    await cleanupEcritures();
    /* Créer des factures de test réelles pour satisfaire la FK fk_ecritures_facture_id. */
    const now = new Date();
    const res = await admin.query<{ id: number }>(`
      INSERT INTO factures ("artisanId", "clientId", "dateFacture", "createdAt", "updatedAt")
      SELECT $1, 1, $2, $2, $2 FROM generate_series(1, 8)
      RETURNING id
    `, [A, now]);
    fIds = res.rows.map((r) => r.id);
  });

  afterAll(async () => {
    await cleanupEcritures();
    await cleanupFactures();
    await app.close();
    await admin.end();
  });

  it("createMany (pièce équilibrée) + list/listByFacture scopés au tenant ; artisanId forcé", async () => {
    const created = await repo.createMany(ctx(A), pieceVente(fIds[0]));
    expect(created.length).toBe(3);
    expect(created.every((e) => e.artisanId === A)).toBe(true);
    const sumD = created.reduce((s, e) => s + Number(e.debit), 0);
    const sumC = created.reduce((s, e) => s + Number(e.credit), 0);
    expect(sumD).toBeCloseTo(sumC, 2);
    expect((await repo.listByFacture(ctx(A), fIds[0])).length).toBe(3);
    expect((await repo.list(ctx(A))).some((e) => e.factureId === fIds[0])).toBe(true);
  });

  it("défauts : debit/credit '0.00' quand omis ; pointage false", async () => {
    const [e] = await repo.createMany(ctx(A), [
      { dateEcriture: new Date(), journal: "OD", numeroCompte: "471000", libelle: "Attente", factureId: fIds[1] },
    ]);
    expect(e.debit).toBe("0.00");
    expect(e.credit).toBe("0.00");
    expect(e.pointage).toBe(false);
  });

  it("isolation cross-tenant : B ne lit pas les écritures de A ; deleteByFacture(B) = 0", async () => {
    await repo.createMany(ctx(A), pieceVente(fIds[2]));
    expect(await repo.listByFacture(ctx(B), fIds[2])).toEqual([]);
    expect((await repo.list(ctx(B))).some((e) => e.factureId === fIds[2])).toBe(false);
    expect(await repo.deleteByFacture(ctx(B), fIds[2])).toBe(0);
    expect((await repo.listByFacture(ctx(A), fIds[2])).length).toBe(3);
  });

  it("deleteByFacture idempotent : supprime la pièce puis re-crée proprement", async () => {
    await repo.createMany(ctx(A), pieceVente(fIds[3]));
    expect(await repo.deleteByFacture(ctx(A), fIds[3])).toBe(3);
    expect(await repo.listByFacture(ctx(A), fIds[3])).toEqual([]);
    expect(await repo.deleteByFacture(ctx(A), fIds[3])).toBe(0);
    const recree = await repo.createMany(ctx(A), pieceVente(fIds[3]));
    expect(recree.length).toBe(3);
  });

  it("validateByFacture + hasValidatedEcritures : inaltérabilité (écritures → validée)", async () => {
    await repo.createMany(ctx(A), pieceVente(fIds[4]));
    expect(await repo.hasValidatedEcritures(ctx(A), fIds[4])).toBe(false);
    const count = await repo.validateByFacture(ctx(A), fIds[4]);
    expect(count).toBe(3);
    expect(await repo.hasValidatedEcritures(ctx(A), fIds[4])).toBe(true);
    const rows = await repo.listByFacture(ctx(A), fIds[4]);
    expect(rows.every((e) => e.statut === "validee")).toBe(true);
  });

  it("hasValidatedEcritures isolation tenant : B ne voit pas les validées de A", async () => {
    await repo.createMany(ctx(A), pieceVente(fIds[5]));
    await repo.validateByFacture(ctx(A), fIds[5]);
    expect(await repo.hasValidatedEcritures(ctx(B), fIds[5])).toBe(false);
  });

  /* ── FK fk_ecritures_facture_id (OPE-758) ── */

  it("FK RESTRICT — DELETE facture avec écritures → refusé par la base", async () => {
    await repo.createMany(ctx(A), pieceVente(fIds[6]));
    await expect(
      admin.query(`DELETE FROM factures WHERE id = $1`, [fIds[6]]),
    ).rejects.toThrow(/foreign key/i);
    expect((await repo.listByFacture(ctx(A), fIds[6])).length).toBe(3);
  });

  it("FK — INSERT écriture avec factureId inexistant → refusé par la base", async () => {
    const fakeId = 999_999_999;
    await expect(
      admin.query(
        `INSERT INTO ecritures_comptables ("artisanId", "dateEcriture", journal, "numeroCompte", libelle, "factureId", statut)
         VALUES ($1, now(), 'VE', '411000', 'Test FK', $2, 'brouillon')`,
        [A, fakeId],
      ),
    ).rejects.toThrow(/foreign key/i);
  });
});
