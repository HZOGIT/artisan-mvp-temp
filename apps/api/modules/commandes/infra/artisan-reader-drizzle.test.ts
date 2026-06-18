import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ArtisanReaderDrizzle } from "./artisan-reader-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9959301;
const UID_B = 9959302;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : reader de l'artisan émetteur (email + PDF bon de commande). Scopé `ctx.artisanId` (RLS) —
// chaque tenant ne lit QUE sa propre ligne `artisans`. Ferme la colonne commandes L2.
describe.skipIf(!URL)("commandes ArtisanReaderDrizzle (RLS émetteur courant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new ArtisanReaderDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId" = any($1)', [[UID_A, UID_B]]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise",email) values ($1,$2,$3) returning id', [UID_A, "Cmd A", "a@cmd.fr"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Cmd B"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getArtisan : renvoie la ligne brute de l'artisan du contexte (A puis B)", async () => {
    const a = await reader.getArtisan(ctx(artisanA));
    expect(a?.id).toBe(artisanA);
    expect(a?.nomEntreprise).toBe("Cmd A");
    expect(a?.email).toBe("a@cmd.fr");
    const b = await reader.getArtisan(ctx(artisanB));
    expect(b?.id).toBe(artisanB);
    expect(b?.nomEntreprise).toBe("Cmd B");
    expect(b?.email).toBeNull();
  });

  it("contexte sans artisan correspondant → null", async () => {
    expect(await reader.getArtisan(ctx(987654321))).toBeNull();
  });
});
