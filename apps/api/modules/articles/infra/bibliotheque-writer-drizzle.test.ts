import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { BibliothequeWriterDrizzle } from "./bibliotheque-writer-drizzle";
import { BibliothequeReaderDrizzle } from "./bibliotheque-reader-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const TAG = "ZZBIBWTEST";

describe.skipIf(!URL)("BibliothequeWriterDrizzle (table partagée, writes admin)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const writer = new BibliothequeWriterDrizzle(app.db);
  const reader = new BibliothequeReaderDrizzle(app.db);

  const cleanup = () => admin.query("delete from bibliotheque_articles where nom like $1", [`${TAG}%`]);
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  const baseInput = {
    nom: `${TAG} Article`,
    unite: "u",
    prixBase: "30.00",
    categorie: "sanitaire",
    sousCategorie: "robinetterie",
    metier: "plombier",
  };

  it("create → présent en lecture (défauts PG) ; update partiel ; delete idempotent", async () => {
    const created = await writer.create(baseInput);
    expect(created.id).toBeGreaterThan(0);
    expect(created.tauxTVA).toBe("20.00"); // défaut PG
    expect(created.visible).toBe(true);
    expect((await reader.list({ metier: "plombier" })).some((a) => a.id === created.id)).toBe(true);

    const maj = await writer.update(created.id, { prixBase: "35.50", nom: `${TAG} Article MAJ` });
    expect(maj?.prixBase).toBe("35.50");
    expect(maj?.nom).toBe(`${TAG} Article MAJ`);
    expect(maj?.unite).toBe("u"); // préservé

    expect(await writer.delete(created.id)).toBe(true);
    expect(await writer.delete(created.id)).toBe(false); // idempotent
  });

  it("update id inexistant → null", async () => {
    expect(await writer.update(987654321, { nom: "x" })).toBeNull();
  });

  it("importMany → insère en masse et renvoie le compte", async () => {
    const n = await writer.importMany([
      { ...baseInput, nom: `${TAG} Imp1` },
      { ...baseInput, nom: `${TAG} Imp2`, metier: "electricien" },
    ]);
    expect(n).toBe(2);
    expect((await reader.list()).filter((a) => a.nom.startsWith(`${TAG} Imp`)).length).toBe(2);
    expect(await writer.importMany([])).toBe(0);
  });
});
