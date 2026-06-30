import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../db";
import { runRgpdPurgeDryRun } from "./rgpd-cron";

const OWNER_URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL;

describe.skipIf(!OWNER_URL)("runRgpdPurgeDryRun — RGPD Art.17 dry-run (PG)", () => {
  const admin = new Pool({ connectionString: OWNER_URL });
  const { db: ownerDb, close: closeOwner } = createDbClient(OWNER_URL!);

  let artisanId: number;
  const USER_ID = 9_996_001;

  const cleanup = async () => {
    if (artisanId) {
      await admin.query(`DELETE FROM llm_usage WHERE artisan_id = $1`, [artisanId]);
      await admin.query(`DELETE FROM artisans WHERE id = $1`, [artisanId]);
    }
  };

  beforeAll(async () => {
    await cleanup();
    const oldDate = new Date(Date.now() - 45 * 24 * 3600 * 1000);
    const { rows } = await admin.query(
      `INSERT INTO artisans ("userId", "franchiseTVA", "pendingDeletionAt", "createdAt", "updatedAt")
       VALUES ($1, false, $2, now(), now()) RETURNING id`,
      [USER_ID, oldDate],
    );
    artisanId = rows[0].id;

    await admin.query(
      `INSERT INTO llm_usage (artisan_id, use_case, model, prompt_tokens, text_input_tokens,
         audio_input_tokens, image_input_tokens, video_input_tokens, cached_tokens, tool_use_tokens,
         response_tokens, text_output_tokens, audio_output_tokens, thinking_tokens, total_tokens,
         duration_ms, finish_reason, created_at)
       VALUES ($1, 'test', 'test-model', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'end_turn', now())`,
      [artisanId],
    );
  });

  afterAll(async () => {
    await cleanup();
    await closeOwner();
    await admin.end();
  });

  it("avec pool owner — détecte le compte en attente et compte les lignes dépendantes (FORCE RLS bypassed)", async () => {
    const result = await runRgpdPurgeDryRun(ownerDb);

    expect(result.artisanIds).toContain(artisanId);
    const idx = result.artisanIds.indexOf(artisanId);
    expect(result.pendingDates[idx]).not.toBeNull();
    expect(result.counts.llm_usage).toBeGreaterThanOrEqual(1);
    expect(result.counts.artisans).toBeGreaterThanOrEqual(1);
  });

  it("ne supprime rien — dry-run idempotent", async () => {
    await runRgpdPurgeDryRun(ownerDb);
    await runRgpdPurgeDryRun(ownerDb);

    const { rows: artisanRows } = await admin.query(
      `SELECT id FROM artisans WHERE id = $1`,
      [artisanId],
    );
    expect(artisanRows).toHaveLength(1);

    const { rows: llmRows } = await admin.query(
      `SELECT id FROM llm_usage WHERE artisan_id = $1`,
      [artisanId],
    );
    expect(llmRows).toHaveLength(1);
  });

  it.skipIf(!APP_URL)(
    "app_tenant sans SET app.tenant — compte 0 lignes dans llm_usage (FORCE RLS no-op, anti-false-green)",
    async () => {
      const { db: appTenantDb, close: closeApp } = createDbClient(APP_URL!);
      try {
        const result = await runRgpdPurgeDryRun(appTenantDb);
        const appTenantLlmCount = result.counts.llm_usage ?? 0;
        expect(appTenantLlmCount).toBe(0);
      } finally {
        await closeApp();
      }
    },
  );
});
