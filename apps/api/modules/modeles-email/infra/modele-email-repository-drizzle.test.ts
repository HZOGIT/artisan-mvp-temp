import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ModeleEmailRepositoryDrizzle } from "./modele-email-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9944301;
const B = 9944302;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
let seq = 0;
const nom = () => `Modele-${A}-${++seq}`;

describe.skipIf(!URL)("ModeleEmailRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ModeleEmailRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from modeles_email where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  const base = (over = {}) => ({ nom: nom(), type: "envoi_devis" as const, sujet: "Votre devis", contenu: "Bonjour, voici votre devis.", ...over });

  it("create + getById + list scopés au tenant ; défaut isDefault false", async () => {
    const m = await repo.create(ctx(A), base());
    expect(m.artisanId).toBe(A);
    expect(m.isDefault).toBe(false); // défaut PG
    expect(m.type).toBe("envoi_devis");
    expect((await repo.getById(ctx(A), m.id))?.sujet).toBe("Votre devis");
    expect((await repo.list(ctx(A))).some((x) => x.id === m.id)).toBe(true);
  });

  it("listByType : filtre par type, scopé tenant", async () => {
    await repo.create(ctx(A), base({ type: "relance_devis", nom: "R1" }));
    await repo.create(ctx(A), base({ type: "rappel_paiement", nom: "P1" }));
    const relances = await repo.listByType(ctx(A), "relance_devis");
    expect(relances.every((m) => m.type === "relance_devis")).toBe(true);
    expect(relances.some((m) => m.nom === "R1")).toBe(true);
    expect(await repo.listByType(ctx(A), "autre")).toEqual([]);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le modèle de A", async () => {
    const m = await repo.create(ctx(A), base({ sujet: "Secret" }));
    await expectCrossTenantDenied(() => repo.getById(ctx(B), m.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === m.id)).toBe(false);
    expect(await repo.update(ctx(B), m.id, { sujet: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), m.id)).toBe(false);
    expect((await repo.getById(ctx(A), m.id))?.sujet).toBe("Secret");
  });

  it("update : seuls les champs fournis changent ; les autres préservés", async () => {
    const m = await repo.create(ctx(A), base({ sujet: "Avant", contenu: "C", isDefault: true }));
    const maj = await repo.update(ctx(A), m.id, { sujet: "Après" });
    expect(maj?.sujet).toBe("Après");
    expect(maj?.contenu).toBe("C"); // préservé
    expect(maj?.isDefault).toBe(true); // préservé
  });

  it("delete : supprime le modèle, scopé", async () => {
    const m = await repo.create(ctx(A), base());
    expect(await repo.delete(ctx(A), m.id)).toBe(true);
    expect(await repo.getById(ctx(A), m.id)).toBeNull();
  });
});
