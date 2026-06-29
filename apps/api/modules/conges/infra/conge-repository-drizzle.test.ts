import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { CongeRepositoryDrizzle } from "./conge-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";
import { getSoldeConge, listSoldesConges } from "../application/read-use-cases";
import { exerciceCourant } from "../application/solde";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 995001;
const B = 995002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("CongeRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new CongeRepositoryDrizzle(app.db);
  let techA = 0;
  let techB = 0;

  const cleanup = async () => {
    await admin.query('delete from conges where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from techniciens where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(async () => {
    await cleanup();
    // technicienId est NOT NULL : on seed un technicien réel par tenant pour respecter la FK.
    techA = (await admin.query('insert into techniciens ("artisanId",nom) values ($1,$2) returning id', [A, "Tech A"])).rows[0].id;
    techB = (await admin.query('insert into techniciens ("artisanId",nom) values ($1,$2) returning id', [B, "Tech B"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const c = await repo.create(ctx(A), { technicienId: techA, type: "conge_paye", dateDebut: "2026-07-01", dateFin: "2026-07-05", motif: "Vacances" });
    expect(c.id).toBeGreaterThan(0);
    expect(c.artisanId).toBe(A);
    expect(c.statut).toBe("en_attente"); // défaut PG
    expect(c.validePar).toBeNull();
    expect((await repo.getById(ctx(A), c.id))?.motif).toBe("Vacances");
    expect((await repo.list(ctx(A))).some((x) => x.id === c.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas la demande de A", async () => {
    const c = await repo.create(ctx(A), { technicienId: techA, type: "rtt", dateDebut: "2026-08-01", dateFin: "2026-08-01" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), c.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === c.id)).toBe(false);
    expect(await repo.update(ctx(B), c.id, { motif: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), c.id)).toBe(false);
    expect((await repo.getById(ctx(A), c.id))?.type).toBe("rtt");
  });

  it("update : métadonnées seulement ; statut/validePar inchangés, champs non fournis préservés", async () => {
    const c = await repo.create(ctx(A), { technicienId: techA, type: "maladie", dateDebut: "2026-09-01", dateFin: "2026-09-03", motif: "Avant" });
    const maj = await repo.update(ctx(A), c.id, { motif: "Après" });
    expect(maj?.motif).toBe("Après");
    expect(maj?.statut).toBe("en_attente"); // workflow non touché par update
    expect(maj?.validePar).toBeNull();
    expect(maj?.type).toBe("maladie"); // champ non fourni préservé
  });

  it("delete : supprime la demande, scopé", async () => {
    const c = await repo.create(ctx(A), { technicienId: techA, type: "autre", dateDebut: "2026-10-01", dateFin: "2026-10-01" });
    expect(await repo.delete(ctx(A), c.id)).toBe(true);
    expect(await repo.getById(ctx(A), c.id)).toBeNull();
  });

  it("ownsTechnicien (anti-IDOR-FK) : un technicien reconnu pour son tenant, pas pour un autre", async () => {
    expect(await repo.ownsTechnicien(ctx(A), techA)).toBe(true);
    expect(await repo.ownsTechnicien(ctx(B), techA)).toBe(false); // technicien de A, vu depuis B
    expect(await repo.ownsTechnicien(ctx(A), 987654321)).toBe(false); // inexistant
  });

  it("getTechnicienDateEmbauche : retourne createdAt du technicien, null si cross-tenant", async () => {
    const date = await repo.getTechnicienDateEmbauche(ctx(A), techA);
    expect(date).toBeInstanceOf(Date);
    expect(await repo.getTechnicienDateEmbauche(ctx(B), techA)).toBeNull(); /* isolation RLS */
  });

  it("getSoldeConge (use-case) : joursAcquis calculés depuis createdAt, non nuls", async () => {
    /* techA créé en beforeAll (environ now) — au moins 0 mois acquis, toujours ≥ 0 */
    const periodeDebut = `${Number(exerciceCourant().split("-")[0])}-06-01`;
    const rows = await getSoldeConge(repo, ctx(A), techA, periodeDebut);
    const cp = rows.find((r) => r.type === "conge_paye");
    expect(cp).toBeDefined();
    expect(typeof cp!.joursAcquis).toBe("number");
    expect(cp!.joursAcquis).toBeGreaterThanOrEqual(0);
    expect(cp!.soldeRestant).toBe(cp!.joursAcquis); // aucun congé pris → solde = acquis
  });

  it("listSoldesConges (use-case) : retourne une entrée par technicien du tenant A", async () => {
    const periodeDebut = `${Number(exerciceCourant().split("-")[0])}-06-01`;
    const soldes = await listSoldesConges(repo, ctx(A), periodeDebut);
    expect(soldes.some((s) => s.technicienId === techA)).toBe(true);
    const cpA = soldes.find((s) => s.technicienId === techA);
    expect(cpA!.joursAcquis).toBeGreaterThanOrEqual(0);
    /* technicien de B absent du résultat de A */
    expect(soldes.some((s) => s.technicienId === techB)).toBe(false);
  });
});
