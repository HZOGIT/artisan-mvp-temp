import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DepenseRepositoryDrizzle } from "./depense-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 992001;
const B = 992002;
const UA = 992101;
const UB = 992102;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
let seq = 0;
const numero = () => `DEP-${A}-${++seq}`;

describe.skipIf(!URL)("DepenseRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new DepenseRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query("delete from depenses where artisan_id in ($1,$2)", [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  const base = (over = {}) => ({
    userId: UA,
    numero: numero(),
    dateDepense: "2026-06-15",
    categorie: "fournitures",
    montantHt: "100.00",
    montantTtc: "120.00",
    ...over,
  });

  it("create + getById + list scopés au tenant (mapping snake↔camel)", async () => {
    const d = await repo.create(ctx(A), base({ montantTva: "20.00", fournisseur: "ACME" }));
    expect(d.id).toBeGreaterThan(0);
    expect(d.artisanId).toBe(A);
    expect(d.statut).toBe("brouillon"); // défaut PG
    expect(d.montantHt).toBe("100.00");
    expect(d.montantTtc).toBe("120.00");
    expect(d.fournisseur).toBe("ACME");
    expect((await repo.getById(ctx(A), d.id))?.categorie).toBe("fournitures");
    expect((await repo.list(ctx(A))).some((x) => x.id === d.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas la dépense de A", async () => {
    const d = await repo.create(ctx(A), base({ description: "Secret" }));
    await expectCrossTenantDenied(() => repo.getById(ctx(B), d.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === d.id)).toBe(false);
    expect(await repo.update(ctx(B), d.id, { description: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), d.id)).toBe(false);
    expect((await repo.getById(ctx(A), d.id))?.description).toBe("Secret");
  });

  it("update : métadonnées seulement ; statut/rembourse inchangés, champs non fournis préservés", async () => {
    const d = await repo.create(ctx(A), base({ description: "Avant", montantHt: "50.00" }));
    const maj = await repo.update(ctx(A), d.id, { description: "Après" });
    expect(maj?.description).toBe("Après");
    expect(maj?.statut).toBe("brouillon"); // workflow non touché
    expect(maj?.rembourse).toBe(false);
    expect(maj?.montantHt).toBe("50.00"); // champ non fourni préservé
  });

  it("delete : supprime la dépense, scopé", async () => {
    const d = await repo.create(ctx(A), base());
    expect(await repo.delete(ctx(A), d.id)).toBe(true);
    expect(await repo.getById(ctx(A), d.id)).toBeNull();
  });

  it("findDoublons : même montant+date+fournisseur, scopé tenant, exclut excludeId", async () => {
    // numeric(10,2) → la tolérance ABS<0.01 revient à l'égalité au centime près.
    const d1 = await repo.create(ctx(A), base({ montantTtc: "200.00", dateDepense: "2026-07-01", fournisseur: "Leroy" }));
    await repo.create(ctx(A), base({ montantTtc: "200.00", dateDepense: "2026-07-01", fournisseur: "Leroy" })); // doublon exact
    await repo.create(ctx(A), base({ montantTtc: "200.00", dateDepense: "2026-07-02", fournisseur: "Leroy" })); // date ≠
    await repo.create(ctx(B), base({ userId: UB, montantTtc: "200.00", dateDepense: "2026-07-01", fournisseur: "Leroy" })); // autre tenant
    const found = await repo.findDoublons(ctx(A), { montantTtc: 200, dateDepense: "2026-07-01", fournisseur: "Leroy" });
    expect(found.length).toBe(2); // d1 + le ±0.01
    const sansD1 = await repo.findDoublons(ctx(A), { montantTtc: 200, dateDepense: "2026-07-01", fournisseur: "Leroy", excludeId: d1.id });
    expect(sansD1.every((d) => d.id !== d1.id)).toBe(true);
  });

  it("coeffDeductibilite persiste et applique le défaut 100", async () => {
    const d80 = await repo.create(ctx(A), base({ montantTva: "20.00", coeffDeductibilite: "80" }));
    expect(d80.coeffDeductibilite).toBe("80.00");
    const d100 = await repo.create(ctx(A), base({ montantTva: "20.00" })); /* sans coeff → défaut 100 */
    expect(d100.coeffDeductibilite).toBe("100.00");
    const updated = await repo.update(ctx(A), d80.id, { coeffDeductibilite: "50" });
    expect(updated?.coeffDeductibilite).toBe("50.00");
  });

  it("getStats : agrège le mois (total/nb/catégories), scopé tenant", async () => {
    await repo.create(ctx(A), base({ montantTtc: "100.00", dateDepense: "2026-08-05", categorie: "carburant", fournisseur: "Total" }));
    await repo.create(ctx(A), base({ montantTtc: "300.00", dateDepense: "2026-08-20", categorie: "materiaux", fournisseur: "Point P" }));
    await repo.create(ctx(B), base({ userId: UB, montantTtc: "999.00", dateDepense: "2026-08-10", categorie: "carburant" })); // autre tenant
    const stats = await repo.getStats(ctx(A), "2026-08");
    expect(stats.mois).toBe("2026-08");
    expect(stats.totalMois).toBe(400);
    expect(stats.nbDepensesMois).toBe(2);
    expect(stats.parCategorie.map((c) => c.categorie).sort()).toEqual(["carburant", "materiaux"]);
    expect(stats.topDepenses[0].montant_ttc).toBe("300.00");
    expect(stats.topFournisseurs.some((f) => f.fournisseur === "Point P")).toBe(true);
    expect(stats.totalMois).not.toBe(1399); // la dépense de B exclue
  });
});
