import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient, withTenant } from "../../../shared/db";
import { avisClients } from "../../../../../drizzle/schema.pg";
import { PublicDemandeContextReaderDrizzle } from "./public-demande-context-reader-drizzle";
import { PublicAvisWriterDrizzle } from "./public-avis-writer-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9961321;
const UID_B = 9961322;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : flux PUBLIC de soumission d'avis (token client). Une fois le tenant résolu, la lecture du
// contexte (noms) et l'écriture (avis publié + demande complétée + notif) se font SOUS RLS. On vérifie
// le round-trip/écriture sous A, l'anti-IDOR cross-tenant (B ne lit pas les entités de A) et la
// transaction du writer (3 effets) + cohérence with-check artisanId du contexte.
describe.skipIf(!URL)("avis flux public Drizzle (context-reader + writer, RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new PublicDemandeContextReaderDrizzle(app.db);
  const writer = new PublicAvisWriterDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let interventionA = 0;
  let demandeA = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    const sub = 'in (select id from artisans where "userId" = any($1))';
    await admin.query(`delete from avis_clients where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from demandes_avis where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from notifications where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from interventions where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from clients where "artisanId" ${sub}`, [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Avis A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Avis B"])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Bernard"])).rows[0].id;
    interventionA = (await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,$4) returning id', [artisanA, clientA, "Dépannage chaudière", "2026-06-01T08:00:00Z"])).rows[0].id;
    demandeA = (await admin.query('insert into demandes_avis ("artisanId","clientId","interventionId","tokenDemande","expiresAt",statut) values ($1,$2,$3,$4,$5,$6) returning id', [artisanA, clientA, interventionA, "dmd-9961321", new Date(Date.now() + 30 * 86400000), "envoyee"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getContext (tenant A) : noms artisan/client/intervention", async () => {
    const r = await reader.getContext(ctx(artisanA), clientA, interventionA);
    expect(r.artisanNomEntreprise).toBe("Avis A");
    expect(r.clientNom).toBe("Bernard");
    expect(r.interventionTitre).toBe("Dépannage chaudière");
    expect(r.interventionDateDebut).not.toBeNull();
  });

  it("anti-IDOR : sous tenant B, client/intervention de A → null (artisan = B lui-même)", async () => {
    const r = await reader.getContext(ctx(artisanB), clientA, interventionA);
    expect(r.artisanNomEntreprise).toBe("Avis B");
    expect(r.clientNom).toBeNull();
    expect(r.interventionTitre).toBeNull();
  });

  it("soumettre : insère l'avis publié + marque la demande completee + notifie (transaction, sous A)", async () => {
    await writer.soumettre(ctx(artisanA), {
      demandeId: demandeA,
      clientId: clientA,
      interventionId: interventionA,
      note: 5,
      commentaire: "Top",
      tokenAvis: "avis-9961321",
    });
    const avis = (await admin.query('select note, statut, "tokenAvis", "artisanId" from avis_clients where "clientId"=$1', [clientA])).rows;
    expect(avis).toHaveLength(1);
    expect(avis[0]).toMatchObject({ note: 5, statut: "publie", tokenAvis: "avis-9961321", artisanId: artisanA });
    const dmd = (await admin.query('select statut, "avisRecuAt" from demandes_avis where id=$1', [demandeA])).rows[0];
    expect(dmd.statut).toBe("completee");
    expect(dmd.avisRecuAt).not.toBeNull();
    const notif = (await admin.query('select count(*)::int n from notifications where "artisanId"=$1 and titre=$2', [artisanA, "Nouvel avis client"])).rows[0];
    expect(notif.n).toBe(1);
  });

  it("isolation RLS : l'avis de A n'est pas visible sous le tenant B", async () => {
    const seenByB = await withTenant(app.db, ctx(artisanB), (tx) =>
      tx.select().from(avisClients).where(eq(avisClients.clientId, clientA)),
    );
    expect(seenByB).toEqual([]);
    const seenByA = await withTenant(app.db, ctx(artisanA), (tx) =>
      tx.select().from(avisClients).where(and(eq(avisClients.clientId, clientA), eq(avisClients.artisanId, artisanA))),
    );
    expect(seenByA.length).toBe(1);
  });
});
