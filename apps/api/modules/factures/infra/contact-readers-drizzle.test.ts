import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ClientReaderDrizzle } from "./client-reader-drizzle";
import { ArtisanReaderDrizzle } from "./artisan-reader-drizzle";
import { DevisReaderDrizzle } from "./devis-reader-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9963341;
const UID_B = 9963342;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : readers « contact » de la facturation (émetteur artisan + destinataire client + conversion
// devis→facture). Tous scopés tenant (RLS + filtre artisanId). On vérifie le round-trip sous A et
// l'anti-IDOR cross-tenant (B ne lit PAS les données de A → null/[]).
describe.skipIf(!URL)("factures contact-readers Drizzle (RLS round-trip + anti-IDOR)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const clientReader = new ClientReaderDrizzle(app.db);
  const artisanReader = new ArtisanReaderDrizzle(app.db);
  const devisReader = new DevisReaderDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let devisA = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    await admin.query('delete from devis_lignes where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId" = any($1)))', [uids]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise",email) values ($1,$2,$3) returning id', [UID_A, "Facto A", "a@facto.fr"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Facto B"])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom,prenom,email) values ($1,$2,$3,$4) returning id', [artisanA, "Martin", "Paul", "paul@cli.fr"])).rows[0].id;
    devisA = (await admin.query('insert into devis ("artisanId","clientId",numero,statut,objet,"totalTTC") values ($1,$2,$3,$4,$5,$6) returning id', [artisanA, clientA, "FCR-A", "accepte", "Rénovation", "960.00"])).rows[0].id;
    await admin.query('insert into devis_lignes ("devisId",designation,"prixUnitaireHT",ordre) values ($1,$2,$3,$4),($1,$5,$6,$7)', [devisA, "Ligne 1", "100.00", 1, "Ligne 2", "200.00", 0]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("ClientReader : round-trip sous A ; anti-IDOR (B → null)", async () => {
    const c = await clientReader.getClient(ctx(artisanA), clientA);
    expect(c?.email).toBe("paul@cli.fr");
    expect(c?.nom).toBe("Martin");
    expect(await clientReader.getClient(ctx(artisanB), clientA)).toBeNull();
    expect(await clientReader.getClient(ctx(artisanA), 987654321)).toBeNull();
  });

  it("ArtisanReader : renvoie l'artisan du contexte (émetteur courant)", async () => {
    const a = await artisanReader.getArtisan(ctx(artisanA));
    expect(a?.id).toBe(artisanA);
    expect(a?.email).toBe("a@facto.fr");
    const b = await artisanReader.getArtisan(ctx(artisanB));
    expect(b?.id).toBe(artisanB);
    expect(b?.email).toBeNull();
  });

  it("DevisReader.getDevis : round-trip sous A ; anti-IDOR (B → null)", async () => {
    const d = await devisReader.getDevis(ctx(artisanA), devisA);
    expect(d?.numero).toBe("FCR-A");
    expect(d?.statut).toBe("accepte");
    expect(d?.totalTTC).toBe("960.00");
    expect(await devisReader.getDevis(ctx(artisanB), devisA)).toBeNull();
  });

  it("DevisReader.getLignes : triées par ordre asc, scopées via le devis parent ; B → []", async () => {
    const lignes = await devisReader.getLignes(ctx(artisanA), devisA);
    expect(lignes.map((l) => l.designation)).toEqual(["Ligne 2", "Ligne 1"]); // ordre 0 puis 1
    expect(await devisReader.getLignes(ctx(artisanB), devisA)).toEqual([]);
  });
});
