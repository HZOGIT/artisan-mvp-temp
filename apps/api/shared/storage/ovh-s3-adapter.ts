import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import { eq, and } from "drizzle-orm";
import type { StoragePort, StoredFile, UploadOptions } from "../ports/storage";
import type { DbClient } from "../db/client";
import { withTenant } from "../db/with-tenant";
import type { TenantContext } from "../tenant";
import { files } from "../../../../drizzle/schema/files";
import { outboxEvent } from "../events/outbox-event";
import { getSecretSync } from "../config/secrets";

/*
 * Adapter OVH Object Storage (S3-compatible, région GRA — Gravelines).
 * Variables d'env requises (à configurer sur le serveur, jamais dans .env.production) :
 *   OVH_S3_ACCESS_KEY       — depuis `terraform output ovh_s3_access_key`
 *   OVH_S3_SECRET_KEY       — depuis `terraform output ovh_s3_secret_key`
 *   OVH_S3_BUCKET           — ex. "operioz-staging"
 *   OVH_S3_ENDPOINT         — ex. "https://s3.gra.io.cloud.ovh.net"
 *   OVH_S3_PUBLIC_BASE_URL  — ex. "https://operioz-staging.s3.gra.io.cloud.ovh.net"
 *
 * Nommage des clés recommandé : <type>/<artisanId>/<uuid>.<ext>
 *   logos/<id>.png, devis/<id>/<uuid>.pdf, etc.
 *
 * url() retourne une URL signée S3 (accès par pre-signed URL à la demande).
 */

export class OvhS3Adapter implements StoragePort {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly db: DbClient;

  constructor(db: DbClient, s3?: S3Client, bucket?: string, publicBaseUrl?: string) {
    this.db = db;
    this.bucket = bucket ?? getSecretSync("OVH_S3_BUCKET") ?? "operioz-staging";
    this.publicBaseUrl = (publicBaseUrl ?? getSecretSync("OVH_S3_PUBLIC_BASE_URL") ?? "").replace(/\/$/, "");
    this.s3 = s3 ?? new S3Client({
      region: "gra",
      endpoint: getSecretSync("OVH_S3_ENDPOINT") ?? "https://s3.gra.io.cloud.ovh.net",
      credentials: {
        accessKeyId: getSecretSync("OVH_S3_ACCESS_KEY") ?? "",
        secretAccessKey: getSecretSync("OVH_S3_SECRET_KEY") ?? "",
      },
      /* ponytail: forcePathStyle requis pour les endpoints S3 non-AWS */
      forcePathStyle: true,
    });
  }

  withDb(db: DbClient): OvhS3Adapter {
    return new OvhS3Adapter(db, this.s3, this.bucket, this.publicBaseUrl);
  }

  async upload(key: string, body: Buffer, opts?: UploadOptions, ctx?: TenantContext): Promise<StoredFile> {
    const sha256 = createHash("sha256").update(body).digest("hex");
    const purpose = opts?.purpose ?? "unknown";
    const contentType = opts?.contentType ?? "application/octet-stream";

    const doInsert = async (tx: DbClient): Promise<StoredFile> => {
      if (opts?.artisanId !== undefined) {
        const [existing] = await tx
          .select()
          .from(files)
          .where(and(eq(files.sha256, sha256), eq(files.artisanId, opts.artisanId), eq(files.purpose, purpose)))
          .limit(1);
        if (existing) return existing;
      }

      await this.s3.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
      );

      const [row] = await tx
        .insert(files)
        .values({
          artisanId: opts?.artisanId ?? null,
          storageKey: key,
          filename: opts?.filename ?? null,
          mimeType: contentType,
          sizeBytes: body.byteLength,
          sha256,
          purpose,
          bucket: this.bucket,
        })
        .returning();

      if (ctx) {
        await outboxEvent(tx, ctx, {
          action: "fichier.importe",
          entityType: "fichier",
          entityId: row.id,
          payload: { key, purpose, size: row.sizeBytes, mimetype: row.mimeType, sha256: row.sha256 },
        });
      }

      return row;
    };

    if (ctx) return withTenant(this.db, ctx, doInsert);
    return doInsert(this.db);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const resp = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!resp.Body) return null;
      const chunks: Uint8Array[] = [];
      for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  url(key: string): Promise<string> {
    return Promise.resolve(`${this.publicBaseUrl}/${key}`);
  }
}
