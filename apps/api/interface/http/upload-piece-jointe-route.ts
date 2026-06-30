import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";
import type { StoragePort } from "../../shared/ports/storage";
import type { DbClient } from "../../shared/db";
import type { IPiecesJointesRepository } from "../../modules/pieces-jointes/application/pieces-jointes-repository";
import { attacherPieceDevis, attacherPieceFacture } from "../../modules/pieces-jointes/application/pieces-jointes-use-cases";

const MAX_PIECE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export interface UploadPieceJointeDeps extends CookieAuthDeps {
  readonly storage: StoragePort;
  readonly db: DbClient;
  readonly piecesJointesRepo: IPiecesJointesRepository;
}

/*
 * Route HORS-tRPC `POST /api/pieces-jointes` : upload multipart d'une pièce jointe (plan, photo,
 * attestation) sur un devis ou une facture. Auth cookie JWT. Taille max 10MB, types autorisés :
 * PDF, JPEG, PNG, WEBP. `devisId` ou `factureId` requis en field multipart.
 */
export function registerUploadPieceJointeRoute(app: FastifyInstance, deps: UploadPieceJointeDeps): void {
  app.register((instance) => {
    instance.register(multipart, { limits: { fileSize: MAX_PIECE_BYTES, files: 1 } });

    instance.post("/api/pieces-jointes", async (req, reply) => {
      const auth = await authArtisanFromCookie(req, deps);
      if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
      if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

      const ctx = { artisanId: auth.artisanId, userId: auth.userId };

      const parts: Record<string, string> = {};
      let fileBuffer: Buffer | null = null;
      let fileMime = "";
      let fileOriginalName = "";

      for await (const part of req.parts()) {
        if (part.type === "file") {
          if (!ALLOWED_MIME.has(part.mimetype)) {
            return reply.code(400).send({ error: "Type de fichier non supporté (PDF, JPEG, PNG, WEBP)" });
          }
          fileMime = part.mimetype;
          fileOriginalName = part.filename ?? "fichier";
          try {
            fileBuffer = await part.toBuffer();
          } catch (_) {
            /* ponytail: best-effort — toBuffer overflow → 400 */
            return reply.code(400).send({ error: "Fichier trop volumineux (max 10MB)" });
          }
          if ((part as unknown as { file: { truncated: boolean } }).file.truncated) {
            return reply.code(400).send({ error: "Fichier trop volumineux (max 10MB)" });
          }
        } else {
          parts[part.fieldname] = (part as unknown as { value: string }).value;
        }
      }

      if (!fileBuffer) return reply.code(400).send({ error: "Aucun fichier envoyé" });

      const devisId = parts["devisId"] ? parseInt(parts["devisId"]) : undefined;
      const factureId = parts["factureId"] ? parseInt(parts["factureId"]) : undefined;

      if (!devisId && !factureId) {
        return reply.code(400).send({ error: "devisId ou factureId requis" });
      }

      try {
        const docType = devisId ? "devis" : "factures";
        const docRef = devisId ?? (factureId as number);
        const s3Key = `pieces-jointes/${docType}/${auth.artisanId}/${docRef}/${Date.now()}-${fileOriginalName}`;

        const stored = await deps.storage.withDb(deps.db).upload(
          s3Key,
          fileBuffer,
          { contentType: fileMime, artisanId: auth.artisanId, filename: fileOriginalName, purpose: "piece-jointe" },
          ctx,
        );

        const piece = devisId
          ? await attacherPieceDevis(deps.piecesJointesRepo, ctx, devisId, stored.id)
          : await attacherPieceFacture(deps.piecesJointesRepo, ctx, factureId as number, stored.id);

        req.log.info({ artisanId: auth.artisanId, pieceId: piece.id, docType, docRef }, "piece_jointe_uploaded");
        return reply.send({ success: true, piece });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Erreur lors du téléchargement";
        if (message.includes("Maximum")) return reply.code(400).send({ error: message });
        req.log.error({ err: e instanceof Error ? e : new Error(String(e)) }, "piece_jointe_upload_error");
        return reply.code(500).send({ error: "Erreur lors du téléchargement" });
      }
    });
  });
}
