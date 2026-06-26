import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import { eq, and } from "drizzle-orm";
import type { StoragePort, StoredFile, UploadOptions } from "../ports/storage";
import type { DbClient } from "../db/client";
import { files } from "../../../../drizzle/schema/files";

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
 * url() retourne l'URL publique (bucket public-read). Pour les objets privés
 * (devis PDF, factures), utiliser @aws-sdk/s3-request-presigner — à brancher
 * quand un use-case private nécessite getSignedUrl.
 */

export class OvhS3Adapter implements StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly db: DbClient;

  constructor(db: DbClient) {
    this.db = db;
    this.bucket = process.env.OVH_S3_BUCKET ?? "operioz-staging";
    this.publicBaseUrl = (process.env.OVH_S3_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
    this.client = new S3Client({
      region: "gra",
      endpoint: process.env.OVH_S3_ENDPOINT ?? "https://s3.gra.io.cloud.ovh.net",
      credentials: {
        accessKeyId: process.env.OVH_S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.OVH_S3_SECRET_KEY ?? "",
      },
      /* ponytail: forcePathStyle requis pour les endpoints S3 non-AWS */
      forcePathStyle: true,
    });
  }

  async upload(key: string, body: Buffer, opts?: UploadOptions): Promise<StoredFile> {
    const sha256 = createHash("sha256").update(body).digest("hex");
    const purpose = opts?.purpose ?? "unknown";
    const contentType = opts?.contentType ?? "application/octet-stream";

    /* Dédup : même hash + même artisanId + même purpose → réutiliser l'entrée existante */
    if (opts?.artisanId !== undefined) {
      const [existing] = await this.db
        .select()
        .from(files)
        .where(and(eq(files.sha256, sha256), eq(files.artisanId, opts.artisanId), eq(files.purpose, purpose)))
        .limit(1);
      if (existing) return existing;
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    const [row] = await this.db
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
    return row;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const resp = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
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
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  url(key: string): Promise<string> {
    return Promise.resolve(`${this.publicBaseUrl}/${key}`);
  }
}
