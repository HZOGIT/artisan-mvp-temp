-- Accès PUBLIC PAR TOKEN — surface publique (portail/vitrine) du nouveau stack, sans cookie tenant.
-- Le token (64 car., unique) EST la capacité : une connexion qui présente le bon token via la GUC
-- `app.public_token` ne voit QUE la ligne correspondante. Policy PERMISSIVE (s'OR avec
-- `tenant_isolation` → le tenant garde son accès normal ; un public ne voit rien sans le bon token).
-- Idempotent. À appliquer en plus de `tenant-isolation.sql` (cf. scripts/rls/apply-public-token.mjs).

-- demandes_avis : lecture publique de LA demande dont le token est présenté (portail d'avis client).
drop policy if exists public_token_select on "demandes_avis";
create policy public_token_select on "demandes_avis" for select
  using ("tokenDemande" = nullif(current_setting('app.public_token', true), ''));

-- paiements_stripe : lecture publique du paiement par son `tokenPaiement` (webhook Stripe checkout /
-- payment_intent — pas de cookie tenant). Le token EST la capacité : on résout l'artisanId du paiement
-- puis les effets (facture/notif) repassent sous `withTenant(artisanId)`. PERMISSIVE (s'OR avec tenant_isolation).
drop policy if exists public_token_select on "paiements_stripe";
create policy public_token_select on "paiements_stripe" for select
  using ("tokenPaiement" = nullif(current_setting('app.public_token', true), ''));

-- devis : lecture publique du devis RATTACHÉ à la signature dont le token est présenté (portail de
-- signature de devis). `signatures_devis` est HORS RLS (lisible librement) → la capacité = le token
-- de signature ; cette policy autorise à lire LE devis lié à ce token (pour résoudre artisanId +
-- afficher le devis). Les sous-ressources (client/artisan/lignes/options) se lisent ensuite sous le
-- tenant résolu (`withTenant(artisanId)`), comme le portail d'avis. PERMISSIVE (s'OR avec tenant_isolation).
drop policy if exists public_token_select on "devis";
create policy public_token_select on "devis" for select
  using (exists (
    select 1 from "signatures_devis" s
    where s."devisId" = "devis".id
      and s."token" = nullif(current_setting('app.public_token', true), '')
  ));
