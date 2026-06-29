import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { attestationsTva } from "../../../../drizzle/schema/factures";
import type { DbClient } from "../../shared/db";
import { withTenant } from "../../shared/db";
import type { StoragePort } from "../../shared/ports/storage";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";

export interface AttestationTvaDownloadDeps extends CookieAuthDeps {
  readonly db: DbClient;
  readonly storage: StoragePort;
}

/**
 * GET /api/factures/attestations-tva/:id/download
 * Sert le PDF d'attestation TVA réduite (originale ou signée) depuis S3.
 * Auth cookie JWT. Anti-IDOR : l'attestation doit appartenir au tenant courant.
 */
export function registerAttestationTvaDownloadRoute(app: FastifyInstance, deps: AttestationTvaDownloadDeps): void {
  app.get("/api/factures/attestations-tva/:id/download", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

    const id = Number((req.params as { id?: string }).id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "Identifiant invalide" });

    const ctx = { artisanId: auth.artisanId, userId: auth.userId };

    const rows = await withTenant(deps.db, ctx, (tx) =>
      tx
        .select({ id: attestationsTva.id, s3Key: attestationsTva.s3Key, signedS3Key: attestationsTva.signedS3Key, statut: attestationsTva.statut, artisanId: attestationsTva.artisanId })
        .from(attestationsTva)
        .where(and(eq(attestationsTva.id, id), eq(attestationsTva.artisanId, auth.artisanId)))
        .limit(1),
    );

    const att = rows[0];
    if (!att) return reply.code(404).send({ error: "Attestation introuvable" });

    const key = att.statut === "signe" && att.signedS3Key ? att.signedS3Key : att.s3Key;
    const buffer = await deps.storage.get(key);
    if (!buffer) return reply.code(404).send({ error: "Fichier introuvable en stockage" });

    const filename = `attestation-tva-${id}${att.statut === "signe" ? "-signee" : ""}.pdf`;
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="${filename}"`)
      .send(buffer);
  });
}
