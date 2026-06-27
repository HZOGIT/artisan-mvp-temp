import { describe, it, expect, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createDbClient } from "./client";
import { withTenant } from "./with-tenant";

const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)("cascade deletes (FK ON DELETE CASCADE)", () => {
  const handle = createDbClient(URL!);
  afterAll(() => handle.close());

  const ctx = { artisanId: 888, userId: 1 };

  it("DELETE contrat → supprime factures_recurrentes en cascade", async () => {
    const result = await withTenant(handle.db, ctx, async (tx) => {
      const clientId = 1;
      const now = new Date();

      const insertContrat = await tx.execute<{ id: number }>(sql`
        INSERT INTO contrats_maintenance (
          "artisanId", "clientId", reference, titre, "montantHT", periodicite, "dateDebut", "createdAt", "updatedAt"
        ) VALUES (
          ${ctx.artisanId}, ${clientId}, 'TEST-CASCADE-001', 'Test Cascade', 100, 'mensuel', ${now}, ${now}, ${now}
        ) RETURNING id
      `);

      const contratId = insertContrat.rows[0].id;

      const insertFacture = await tx.execute<{ id: number }>(sql`
        INSERT INTO factures_recurrentes ("contratId", "factureId", "periodeDebut", "periodeFin", "createdAt")
        VALUES (${contratId}, 1, ${now}, ${new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)}, ${now})
        RETURNING id
      `);

      const factureId = insertFacture.rows[0].id;

      await tx.execute(sql`DELETE FROM contrats_maintenance WHERE id = ${contratId}`);

      const remaining = await tx.execute<{ id: number }>(sql`SELECT id FROM factures_recurrentes WHERE id = ${factureId}`);

      return remaining.rows.length === 0;
    });

    expect(result).toBe(true);
  });

  it("DELETE intervention → supprime interventions_mobile + demandes_avis en cascade", async () => {
    const result = await withTenant(handle.db, ctx, async (tx) => {
      const clientId = 1;
      const now = new Date();

      const insertIntervention = await tx.execute<{ id: number }>(sql`
        INSERT INTO interventions (
          "artisanId", "clientId", titre, "dateDebut", "createdAt", "updatedAt"
        ) VALUES (
          ${ctx.artisanId}, ${clientId}, 'Test Intervention', ${now}, ${now}, ${now}
        ) RETURNING id
      `);

      const interventionId = insertIntervention.rows[0].id;

      const insertMobile = await tx.execute<{ id: number }>(sql`
        INSERT INTO interventions_mobile ("interventionId", "artisanId", "createdAt", "updatedAt")
        VALUES (${interventionId}, ${ctx.artisanId}, ${now}, ${now})
        RETURNING id
      `);

      const mobileId = insertMobile.rows[0].id;

      const insertAvis = await tx.execute<{ id: number }>(sql`
        INSERT INTO demandes_avis (
          "artisanId", "clientId", "interventionId", "tokenDemande", "expiresAt", "createdAt"
        ) VALUES (
          ${ctx.artisanId}, ${clientId}, ${interventionId}, 'test-token-' || random()::text, ${new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)}, ${now}
        ) RETURNING id
      `);

      const avisId = insertAvis.rows[0].id;

      await tx.execute(sql`DELETE FROM interventions WHERE id = ${interventionId}`);

      const remainingMobile = await tx.execute<{ id: number }>(sql`SELECT id FROM interventions_mobile WHERE id = ${mobileId}`);
      const remainingAvis = await tx.execute<{ id: number }>(sql`SELECT id FROM demandes_avis WHERE id = ${avisId}`);

      return remainingMobile.rows.length === 0 && remainingAvis.rows.length === 0;
    });

    expect(result).toBe(true);
  });

  it("DELETE interventions_mobile → supprime photos_interventions en cascade", async () => {
    const result = await withTenant(handle.db, ctx, async (tx) => {
      const clientId = 1;
      const now = new Date();

      const insertIntervention = await tx.execute<{ id: number }>(sql`
        INSERT INTO interventions (
          "artisanId", "clientId", titre, "dateDebut", "createdAt", "updatedAt"
        ) VALUES (
          ${ctx.artisanId}, ${clientId}, 'Test Photos', ${now}, ${now}, ${now}
        ) RETURNING id
      `);

      const interventionId = insertIntervention.rows[0].id;

      const insertMobile = await tx.execute<{ id: number }>(sql`
        INSERT INTO interventions_mobile ("interventionId", "artisanId", "createdAt", "updatedAt")
        VALUES (${interventionId}, ${ctx.artisanId}, ${now}, ${now})
        RETURNING id
      `);

      const mobileId = insertMobile.rows[0].id;

      const insertPhoto = await tx.execute<{ id: number }>(sql`
        INSERT INTO photos_interventions ("interventionMobileId", url, "takenAt", "createdAt")
        VALUES (${mobileId}, 'https://example.com/photo.jpg', ${now}, ${now})
        RETURNING id
      `);

      const photoId = insertPhoto.rows[0].id;

      await tx.execute(sql`DELETE FROM interventions_mobile WHERE id = ${mobileId}`);

      const remainingPhotos = await tx.execute<{ id: number }>(sql`SELECT id FROM photos_interventions WHERE id = ${photoId}`);

      return remainingPhotos.rows.length === 0;
    });

    expect(result).toBe(true);
  });
});
