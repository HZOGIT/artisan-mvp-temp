-- Accès PUBLIC PAR TOKEN — surface publique (portail/vitrine) du nouveau stack, sans cookie tenant.
-- Le token (64 car., unique) EST la capacité : une connexion qui présente le bon token via la GUC
-- `app.public_token` ne voit QUE la ligne correspondante. Policy PERMISSIVE (s'OR avec
-- `tenant_isolation` → le tenant garde son accès normal ; un public ne voit rien sans le bon token).
-- Idempotent. À appliquer en plus de `tenant-isolation.sql` (cf. scripts/rls/apply-public-token.mjs).

-- demandes_avis : lecture publique de LA demande dont le token est présenté (portail d'avis client).
drop policy if exists public_token_select on "demandes_avis";
create policy public_token_select on "demandes_avis" for select
  using ("tokenDemande" = nullif(current_setting('app.public_token', true), ''));
