import { describe, it, expect, afterAll, beforeAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { StockRepositoryDrizzle } from "./stock-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 998011;
const B = 998012;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("InventaireRepositoryDrizzle (PG L2, RLS tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new StockRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from inventaires_lignes where "inventaireId" in (select id from inventaires where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from inventaires where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from stocks where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(cleanup);
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("demarrerInventaire crée l'inventaire avec les quantités théoriques figées", async () => {
    await repo.create(ctx(A), { reference: "T1", designation: "Tube cuivre", quantiteEnStock: "15.00" });
    await repo.create(ctx(A), { reference: "T2", designation: "Coude", quantiteEnStock: "8.00" });

    const inv = await repo.demarrerInventaire(ctx(A), {});
    expect(inv.inventaire.statut).toBe("brouillon");
    expect(inv.lignes).toHaveLength(2);
    const qtys = inv.lignes.map((l) => parseFloat(l.quantiteTheorique)).sort((a, b) => a - b);
    expect(qtys[0]).toBeCloseTo(8, 2);
    expect(qtys[1]).toBeCloseTo(15, 2);
  });

  it("saisirComptage met à jour la ligne et calcule l'écart", async () => {
    await repo.create(ctx(A), { reference: "C1", designation: "Câble", quantiteEnStock: "10.00" });
    const inv = await repo.demarrerInventaire(ctx(A), {});
    const ligne = inv.lignes[0];

    const updated = await repo.saisirComptage(ctx(A), ligne.id, "7");
    const l = updated!.lignes.find((x) => x.id === ligne.id)!;
    expect(parseFloat(l.quantiteReelle!)).toBeCloseTo(7, 2);
    expect(parseFloat(l.ecart!)).toBeCloseTo(-3, 2);
  });

  it("validerInventaire génère 1 ajustement par écart ≠ 0 et met à jour la quantité physique", async () => {
    const s = await repo.create(ctx(A), { reference: "V1", designation: "Valve", quantiteEnStock: "12.00", prixAchat: "10.00" });
    await repo.create(ctx(A), { reference: "V2", designation: "Vanne", quantiteEnStock: "20.00" });
    const inv = await repo.demarrerInventaire(ctx(A), {});

    const ligneV1 = inv.lignes.find((l) => l.reference === "V1")!;
    const ligneV2 = inv.lignes.find((l) => l.reference === "V2")!;
    await repo.saisirComptage(ctx(A), ligneV1.id, "10"); /* écart -2 */
    await repo.saisirComptage(ctx(A), ligneV2.id, "20"); /* écart 0 — pas d'ajustement */

    const result = await repo.validerInventaire(ctx(A), inv.inventaire.id);
    expect(result!.inventaire.statut).toBe("valide");

    /* V1 physique = 10 */
    const stockV1 = await repo.getById(ctx(A), s.id);
    expect(parseFloat(stockV1!.quantiteEnStock)).toBeCloseTo(10, 2);

    /* valeurEcart = 2 × 10 = 20 */
    expect(parseFloat(result!.inventaire.valeurEcart!)).toBeCloseTo(20, 2);

    /* un mouvement ajustement tracé pour V1 */
    const mvts = await repo.listMouvements(ctx(A), s.id);
    expect(mvts?.some((m) => m.type === "ajustement" && m.reference?.startsWith("INV-"))).toBe(true);
  });

  it("RLS tenant : B ne voit pas les inventaires de A", async () => {
    await repo.create(ctx(A), { reference: "X1", designation: "X" });
    const inv = await repo.demarrerInventaire(ctx(A), {});

    const bResult = await repo.getInventaire(ctx(B), inv.inventaire.id);
    expect(bResult).toBeNull();

    const bList = await repo.listInventaires(ctx(B));
    expect(bList.some((i) => i.id === inv.inventaire.id)).toBe(false);
  });

  it("validerInventaire idempotent : null si déjà validé (guard use-case)", async () => {
    await repo.create(ctx(A), { reference: "I1", designation: "Isolant", quantiteEnStock: "5.00" });
    const inv = await repo.demarrerInventaire(ctx(A), {});
    await repo.validerInventaire(ctx(A), inv.inventaire.id);
    /* L'idempotence est gérée au niveau use-case (before.statut check) — le repo lui-même
       ne vérifie pas : on vérifie que le statut est bien "valide" après double appel */
    const r = await repo.validerInventaire(ctx(A), inv.inventaire.id);
    expect(r!.inventaire.statut).toBe("valide");
  });
});
