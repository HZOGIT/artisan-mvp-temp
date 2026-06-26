/**
 * Bootstrap d'un bucket OVH Object Storage (S3) — étape MANUELLE one-time par environnement.
 *
 * Le provider Terraform `ovh/ovh` crée l'utilisateur S3 + les credentials + la policy
 * (`infra/terraform/ovh-storage.tf`), mais PAS le bucket lui-même. Ce script crée le bucket
 * via l'API S3 (le SDK AWS, `@aws-sdk/client-s3` déjà installé — pas besoin de l'AWS CLI).
 * Idempotent : si le bucket existe déjà, sort proprement.
 *
 * Usage :
 *   # creds dans l'environnement courant :
 *   node scripts/bootstrap-ovh-bucket.mjs
 *   # creds depuis un fichier .env (seules les lignes OVH_S3_* sont lues, robuste aux valeurs shell-unsafe) :
 *   node scripts/bootstrap-ovh-bucket.mjs --env-file .env.staging
 *   node scripts/bootstrap-ovh-bucket.mjs --env-file .env.production
 *   # rendre le bucket public-read (logos artisan servis directement) :
 *   node scripts/bootstrap-ovh-bucket.mjs --env-file .env.staging --public
 *
 * Variables requises (OVH_S3_*) : ENDPOINT, ACCESS_KEY, SECRET_KEY, BUCKET. REGION optionnelle (def. gra).
 */
import fs from "node:fs";
import { S3Client, CreateBucketCommand, HeadBucketCommand, PutBucketAclCommand } from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const envFileIdx = args.indexOf("--env-file");
const makePublic = args.includes("--public");

const env = { ...process.env };
if (envFileIdx !== -1) {
  const path = args[envFileIdx + 1];
  if (!path) { console.error("✖ --env-file nécessite un chemin"); process.exit(2); }
  /* on ne lit QUE les OVH_S3_* : le reste du .env peut contenir des valeurs non parsables (espaces, parenthèses…) */
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    if (!/^OVH_S3_/.test(line)) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i)] = line.slice(i + 1).trim();
  }
}

const endpoint = env.OVH_S3_ENDPOINT;
const accessKeyId = env.OVH_S3_ACCESS_KEY;
const secretAccessKey = env.OVH_S3_SECRET_KEY;
const Bucket = env.OVH_S3_BUCKET;
const region = env.OVH_S3_REGION || "gra";

for (const [k, v] of [["OVH_S3_ENDPOINT", endpoint], ["OVH_S3_ACCESS_KEY", accessKeyId], ["OVH_S3_SECRET_KEY", secretAccessKey], ["OVH_S3_BUCKET", Bucket]]) {
  if (!v) { console.error(`✖ ${k} manquant`); process.exit(2); }
}

const client = new S3Client({ region, endpoint, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
console.log(`▶ bucket=${Bucket} endpoint=${endpoint} region=${region}`);

try {
  await client.send(new CreateBucketCommand({ Bucket }));
  console.log("  ✓ bucket créé");
} catch (e) {
  if (/BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(e?.name ?? "")) console.log("  ✓ bucket déjà existant (idempotent)");
  else { console.error("  ✖ échec création :", e?.name, (e?.message ?? "").slice(0, 200)); process.exit(1); }
}

const exists = await client.send(new HeadBucketCommand({ Bucket })).then(() => true).catch(() => false);
if (!exists) { console.error("  ✖ le bucket n'est pas accessible après création"); process.exit(1); }
console.log("  ✓ HEAD bucket OK");

if (makePublic) {
  await client.send(new PutBucketAclCommand({ Bucket, ACL: "public-read" }));
  console.log("  ✓ ACL public-read posée");
}
console.log("✅ bootstrap terminé");
