import { eq } from "drizzle-orm";
import type { PaPort } from "./pa-port";
import type { DbClient } from "../../../shared/db";
import type { AppLogger } from "../../../shared/ports/logger";
import { artisans, factures as facturesTable, facturesCycleVieEvents } from "../../../../../drizzle/schema.pg";
import { withTenant } from "../../../shared/db/with-tenant";
import type { InsertFactureCycleVieEvent } from "../../../../../drizzle/schema/einvoicing";

export interface PaWebhookDeps {
  readonly pa: PaPort;
  readonly db: DbClient;
  readonly log?: AppLogger;
}

export async function processPaWebhook(
  deps: PaWebhookDeps,
  raw: { rawBody: Buffer; signature: string | undefined },
): Promise<{ http: number; body: string }> {
  let event;
  try {
    event = deps.pa.verifyWebhook(raw.rawBody, raw.signature);
  } catch {
    return { http: 400, body: "Signature invalide" };
  }

  if (event.type === "ping") return { http: 200, body: "pong" };

  if (event.type === "statut_change" && event.paDocumentId && event.statut) {
    await handleStatutChange(deps, event.paDocumentId, event.statut, event.paEventId);
  }

  return { http: 200, body: "OK" };
}

async function handleStatutChange(
  deps: PaWebhookDeps,
  paDocumentId: string,
  statut: string,
  paEventId: string | undefined,
): Promise<void> {
  /* ponytail: O(N) artisan scan — artisans has no RLS; add lookup table when N > 1k */
  const allArtisans = await deps.db.select({ id: artisans.id }).from(artisans);
  for (const { id: artisanId } of allArtisans) {
    let found = false;
    await withTenant(deps.db, { artisanId }, async (tx) => {
      const [facture] = await tx
        .select({ id: facturesTable.id })
        .from(facturesTable)
        .where(eq(facturesTable.paDocumentId, paDocumentId))
        .limit(1);
      if (!facture) return;

      await tx
        .insert(facturesCycleVieEvents)
        .values({
          artisanId,
          factureId: facture.id,
          statut: statut as InsertFactureCycleVieEvent["statut"],
          source: "pa",
          paEventId: paEventId ?? null,
          occurredAt: new Date(),
        })
        .onConflictDoNothing();
      await tx
        .update(facturesTable)
        .set({ statutCycleVie: statut as typeof facturesTable.$inferInsert["statutCycleVie"] })
        .where(eq(facturesTable.id, facture.id));
      found = true;
    });
    if (found) return;
  }
  deps.log?.warn({ event: "pa_webhook_unknown_document", paDocumentId }, "PA webhook: document inconnu");
}
