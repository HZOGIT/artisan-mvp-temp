/*
 * Bucket OVH S3 — le provider ovh/ovh crée l'utilisateur + credentials + policy ci-dessous,
 * mais PAS le bucket lui-même. Bootstrap MANUEL one-time par environnement, APRÈS terraform apply
 * (qui génère les creds OVH_S3_* à poser dans l'env runtime backend) :
 *
 *   node scripts/bootstrap-ovh-bucket.mjs --env-file .env.staging          # crée le bucket (idempotent)
 *   node scripts/bootstrap-ovh-bucket.mjs --env-file .env.production       # idem pour la prod
 *   node scripts/bootstrap-ovh-bucket.mjs --env-file .env.staging --public # bucket public-read (logos)
 *
 * Le script utilise @aws-sdk/client-s3 (pas besoin de l'AWS CLI) et lit OVH_S3_ENDPOINT/ACCESS_KEY/
 * SECRET_KEY/BUCKET (REGION optionnelle, def. gra). Région GRA (Gravelines) — s3.gra.io.cloud.ovh.net.
 * Staging = 1-AZ (SLA 99,9 %) ; prod devra passer en 3-AZ (~16 $/To).
 */

resource "ovh_cloud_project_user" "s3_staging" {
  service_name = var.ovh_project_id
  description  = "operioz-staging-s3"
  role_name    = "objectstore_operator"
}

resource "ovh_cloud_project_user_s3_credential" "staging" {
  service_name = var.ovh_project_id
  user_id      = ovh_cloud_project_user.s3_staging.id
}

resource "ovh_cloud_project_user_s3_policy" "staging" {
  service_name = var.ovh_project_id
  user_id      = ovh_cloud_project_user.s3_staging.id
  policy = jsonencode({
    Statement = [{
      Effect = "Allow"
      Action = ["s3:*"]
      Resource = [
        "arn:aws:s3:::operioz-staging",
        "arn:aws:s3:::operioz-staging/*",
      ]
    }]
  })
}
