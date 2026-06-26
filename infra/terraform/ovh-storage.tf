/*
 * Bucket OVH S3 — la création du bucket lui-même passe par la CLI AWS (le provider ovh/ovh
 * ne crée pas encore de bucket S3 directement). Bootstrap à exécuter une seule fois :
 *
 *   aws s3api create-bucket \
 *     --endpoint-url https://s3.gra.io.cloud.ovh.net \
 *     --bucket operioz-staging \
 *     --region gra
 *
 * Pour rendre le bucket public-read (logos artisan) :
 *
 *   aws s3api put-bucket-acl \
 *     --endpoint-url https://s3.gra.io.cloud.ovh.net \
 *     --bucket operioz-staging \
 *     --acl public-read
 *
 * Région GRA (Gravelines, France) — endpoint : s3.gra.io.cloud.ovh.net
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
