import type { FastifyInstance } from "fastify";
import { ForbiddenError, NotFoundError } from "../../shared/errors";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import type { StoragePort } from "../../shared/ports/storage";
import type { DbClient } from "../../shared/db";
import { withPublicToken, withTenant } from "../../shared/db";
import { piecesJointes } from "../../../../drizzle/schema/pieces-jointes";
import { files } from "../../../../drizzle/schema/files";
import { devis } from "../../../../drizzle/schema/devis";
import { factures } from "../../../../drizzle/schema/factures";
import { eq, and } from "drizzle-orm";
import { clientPortalAccess } from "../../../../drizzle/schema.pg";
import { extractClientIp } from "./client-ip";

export interface PortailPieceJointeDeps {
  readonly db: DbClient;
  readonly storage: StoragePort;
  readonly rateLimiter: RateLimiterPort;
}

/*
 * Route PUBLIQUE `GET /api/portail/:token/pieces-jointes/:id` : téléchargement d'une pièce jointe
 * depuis le portail client. Token = capacité (pas de cookie). Anti-IDOR : pièce doit appartenir
 * au devis/facture du client porté par le token.
 */
export function registerPortailPieceJointeRoute(app: FastifyInstance, deps: PortailPieceJointeDeps): void {
  app.get("/api/portail/:token/pieces-jointes/:id", async (req, reply) => {
    const ip = extractClientIp((req.headers ?? {}) as Record<string, unknown>, req.ip ?? null);
    if (!(await deps.rateLimiter.check(`portail-pj:${ip}`))) {
      return reply.code(429).send({ error: "Trop de requêtes, réessayez dans une minute" });
    }

    const params = req.params as { token?: string; id?: string };
    const token = String(params.token ?? "");
    const id = Number(params.id);
    if (!token || !Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "Requête invalide" });

    try {
      /** 1. Résoudre le token → { clientId, artisanId }. */
      const access = await withPublicToken(deps.db, token, async (tx) => {
        const [r] = await tx
          .select({ clientId: clientPortalAccess.clientId, artisanId: clientPortalAccess.artisanId })
          .from(clientPortalAccess)
          .where(and(eq(clientPortalAccess.token, token), eq(clientPortalAccess.isActive, true)))
          .limit(1);
        return r ?? null;
      });
      if (!access) throw new ForbiddenError("Accès non autorisé ou expiré");

      const ctx = { artisanId: access.artisanId, userId: 0 };

      /** 2. Charger la pièce jointe (avec join files). */
      const rows = await withTenant(deps.db, ctx, async (tx) => {
        return tx
          .select({
            id: piecesJointes.id,
            devisId: piecesJointes.devisId,
            factureId: piecesJointes.factureId,
            storageKey: files.storageKey,
            mimeType: files.mimeType,
            filename: files.filename,
          })
          .from(piecesJointes)
          .innerJoin(files, eq(files.id, piecesJointes.fileId))
          .where(and(eq(piecesJointes.id, id), eq(piecesJointes.artisanId, access.artisanId)));
      });
      const piece = rows[0];
      if (!piece) throw new NotFoundError("Pièce jointe introuvable");

      /** 3. Anti-IDOR : vérifier que le doc appartient au client du token. */
      let ownerOk = false;
      if (piece.devisId != null) {
        const devisId = piece.devisId;
        const [d] = await withTenant(deps.db, ctx, (tx) =>
          tx.select({ clientId: devis.clientId }).from(devis).where(eq(devis.id, devisId)).limit(1),
        );
        ownerOk = d?.clientId === access.clientId;
      } else if (piece.factureId != null) {
        const factureId = piece.factureId;
        const [f] = await withTenant(deps.db, ctx, (tx) =>
          tx.select({ clientId: factures.clientId }).from(factures).where(eq(factures.id, factureId)).limit(1),
        );
        ownerOk = f?.clientId === access.clientId;
      }
      if (!ownerOk) throw new ForbiddenError("Accès refusé à cette pièce jointe");

      /** 4. Lire depuis S3 et streamer. */
      const buffer = await deps.storage.get(piece.storageKey);
      if (!buffer) throw new NotFoundError("Fichier introuvable en stockage");

      const safeFilename = (piece.filename ?? `piece-${piece.id}`).replace(/[^\w.\-]/g, "_");
      return reply
        .header("Content-Type", piece.mimeType)
        .header("Content-Disposition", `inline; filename="${safeFilename}"`)
        .send(buffer);
    } catch (e) {
      if (e instanceof ForbiddenError) return reply.code(403).send({ error: e.message });
      if (e instanceof NotFoundError) return reply.code(404).send({ error: e.message });
      req.log.error({ err: e instanceof Error ? e : new Error(String(e)) }, "portail_piece_jointe_error");
      return reply.code(500).send({ error: "Erreur lors de la récupération du fichier" });
    }
  });
}
