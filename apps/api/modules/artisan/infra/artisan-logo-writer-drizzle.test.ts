import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ArtisanLogoWriterDrizzle } from "./artisan-logo-writer-drizzle";

const URL = process.env.DATABASE_URL;
const UID_A = 9946171;
const UID_B = 9946172;

// L2 : writer du logo artisan. `artisans` = table d'IDENTITÉ HORS RLS → update par id (l'artisanId est
// résolu du JWT en amont). Vérifie set/clear du logo et que SEUL l'artisan ciblé est affecté.
describe.skipIf(!URL)("ArtisanLogoWriterDrizzle (update logo par id, hors RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(URL!);
  const writer = new ArtisanLogoWriterDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId" = any($1)', [[UID_A, UID_B]]);
  };

  const logoOf = async (id: number) => (await admin.query("select logo from artisans where id = $1", [id])).rows[0]?.logo;

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise",logo) values ($1,$2,$3) returning id', [UID_A, "Logo A", "data:old-a"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise",logo) values ($1,$2,$3) returning id', [UID_B, "Logo B", "data:keep-b"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("setLogo : met à jour le logo de l'artisan ciblé uniquement", async () => {
    await writer.setLogo(artisanA, "data:new-a");
    expect(await logoOf(artisanA)).toBe("data:new-a");
    expect(await logoOf(artisanB)).toBe("data:keep-b"); // B intact
  });

  it("setLogo(null) : efface le logo (suppression)", async () => {
    await writer.setLogo(artisanA, null);
    expect(await logoOf(artisanA)).toBeNull();
    expect(await logoOf(artisanB)).toBe("data:keep-b"); // B toujours intact
  });
});
