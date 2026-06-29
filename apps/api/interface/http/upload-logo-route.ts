import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { ArtisanLogoWriter } from "../../modules/artisan/application/artisan-logo-writer";
import { isAllowedLogoMime, logoDataUrl, MAX_LOGO_BYTES } from "../../modules/artisan/domain/logo";
import { authArtisanFromCookie, type CookieAuthDeps } from "./cookie-auth";

export interface UploadLogoDeps extends CookieAuthDeps {
  readonly writer: ArtisanLogoWriter;
}

/*
 * Routes HORS-tRPC `/api/upload-logo` (POST = uploade le logo en base64 ; DELETE = l'efface). Auth par
 * cookie JWT (même session que tRPC). Le multipart est encapsulé (scope `app.register`) → n'impacte
 * pas le parser JSON tRPC. Le logo est stocké en data-URL base64 dans `artisans.logo` (parité legacy).
 */
export function registerUploadLogoRoute(app: FastifyInstance, deps: UploadLogoDeps): void {
  app.register((instance) => {
    instance.register(multipart, { limits: { fileSize: MAX_LOGO_BYTES, files: 1 } });

    instance.post("/api/upload-logo", async (req, reply) => {
      const auth = await authArtisanFromCookie(req, deps);
      if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
      if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });

      const data = await req.file();
      if (!data) return reply.code(400).send({ error: "Aucun fichier envoyé" });
      if (!isAllowedLogoMime(data.mimetype)) {
        return reply.code(400).send({ error: "Type de fichier non supporté (PNG, JPG, WebP, SVG uniquement)" });
      }
      let buffer: Buffer;
      try {
        buffer = await data.toBuffer();
      } catch (e) {
        req.log.error({ artisanId: auth.artisanId, err: e instanceof Error ? e : new Error(String(e)) }, 'logo_upload_error');
        return reply.code(400).send({ error: "Fichier trop volumineux (max 2MB)" });
      }
      if (data.file.truncated) return reply.code(400).send({ error: "Fichier trop volumineux (max 2MB)" });

      const dataUrl = logoDataUrl(data.mimetype, buffer);
      try {
        await deps.writer.setLogo(auth.artisanId, dataUrl);
        req.log.info({ artisanId: auth.artisanId, sizeBytes: buffer.length, mimeType: data.mimetype }, 'logo_uploaded');
        return reply.send({ success: true, logoUrl: dataUrl });
      } catch (e) {
        req.log.error({ artisanId: auth.artisanId, err: e instanceof Error ? e : new Error(String(e)) }, 'logo_upload_error');
        return reply.code(500).send({ error: "Erreur lors du téléchargement du logo" });
      }
    });

    instance.delete("/api/upload-logo", async (req, reply) => {
      const auth = await authArtisanFromCookie(req, deps);
      if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
      if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });
      try {
        await deps.writer.setLogo(auth.artisanId, null);
        req.log.info({ artisanId: auth.artisanId }, 'logo_deleted');
        return reply.send({ success: true });
      } catch (e) {
        req.log.error({ artisanId: auth.artisanId, err: e instanceof Error ? e : new Error(String(e)) }, 'logo_delete_error');
        return reply.code(500).send({ error: "Erreur lors de la suppression du logo" });
      }
    });
  });
}
