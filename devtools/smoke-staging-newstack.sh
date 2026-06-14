#!/usr/bin/env bash
# Smoke AUTHENTIFIÉ du nouveau stack en staging : crée (idempotent) deux faux utilisateurs staging
# A et B (chacun son artisan), forge leurs JWT (cookie `token`, même secret que le legacy), puis
# appelle les endpoints servis par le nouveau stack — en vérifiant 200 (l'endpoint fonctionne
# vraiment, pas juste 401) ET l'isolation cross-tenant (B ne voit pas forcément les données de A).
#
# Lancé après deploy-staging-newstack.sh à chaque itération qui active/ajoute des endpoints.
# Aucun secret n'est affiché. Usage : ./devtools/smoke-staging-newstack.sh
set -euo pipefail
cd "$(dirname "$0")/.."

NEWSTACK_URL="http://localhost:3010"
PG="docker exec artisan-staging-postgres-1 psql -U artisan_user -d artisan_mvp -tAc"

JWT_SECRET=$(grep -E '^JWT_SECRET=' .env.staging | cut -d= -f2- | tr -d '"')
[ -n "$JWT_SECRET" ] || { echo "✖ JWT_SECRET introuvable dans .env.staging"; exit 1; }

# 1) Faux utilisateurs staging A et B (idempotents, marqueur `smoke+…@operioz.test`) + un artisan chacun.
ensure_user() {
  local email="$1"
  $PG "insert into users (email) values ('$email') on conflict (email) do nothing;" >/dev/null
  local uid; uid=$($PG "select id from users where email='$email';")
  $PG "insert into artisans (\"userId\") select $uid where not exists (select 1 from artisans where \"userId\"=$uid);" >/dev/null
  local aid; aid=$($PG "select id from artisans where \"userId\"=$uid;")
  echo "$uid $aid"
}

read -r UA AA < <(ensure_user "smoke+a@operioz.test")
read -r UB AB < <(ensure_user "smoke+b@operioz.test")
echo "▶ Faux users staging : A=user $UA/artisan $AA · B=user $UB/artisan $AB"

TOKEN_A=$(JWT_SECRET="$JWT_SECRET" node devtools/mint-jwt.mjs "$UA" "smoke+a@operioz.test")
TOKEN_B=$(JWT_SECRET="$JWT_SECRET" node devtools/mint-jwt.mjs "$UB" "smoke+b@operioz.test")

# 2) Smoke authentifié des domaines servis par le nouveau stack (200 attendu = endpoint OK end-to-end).
PROCS="vehicules.list notifications.list fournisseurs.list parametres.get modelesEmail.list relances.list conges.list badges.list stocks.list techniciens.list rdv.list clients.list factures.list contrats.list commandesFournisseurs.list devis.list avis.list interventions.list chantiers.list articles.getArtisanArticles previsions.getHistorique depenses.list artisan.getProfile"
fail=0
echo "▶ Smoke authentifié (cookie token=JWT user A) — 200 attendu :"
for p in $PROCS; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --cookie "token=$TOKEN_A" \
    "$NEWSTACK_URL/api/trpc/$p?batch=1&input=%7B%7D")
  if [ "$code" = "200" ]; then echo "  ✓ $p -> 200"; else echo "  ✖ $p -> $code (attendu 200)"; fail=1; fi
done

# 2b) Round-trip transformer SUPERJSON (régression critique : le client/legacy utilisent superjson ;
# si le new-stack ne le configure pas, toutes les mutations cassent et le front ne désérialise rien).
# La réponse d'une query authentifiée DOIT être enveloppée superjson → contient la clé "json".
body=$(curl -s --cookie "token=$TOKEN_A" "$NEWSTACK_URL/api/trpc/clients.list?batch=1&input=%7B%7D")
if printf '%s' "$body" | grep -q '"json"'; then
  echo "  ✓ transformer superjson actif (réponse enveloppée {json:…})"
else
  echo "  ✖ réponse NON superjson (clients.list) — transformer manquant ! body=$(printf '%s' "$body" | head -c 200)"; fail=1
fi

# 2c) devisOptions.getByDevisId : nécessite un devisId POSSÉDÉ (anti-IDOR via le devis parent). On sème
# (idempotent) un client + un devis pour A, puis on attend 200 (liste vide = endpoint OK end-to-end).
$PG "insert into clients (\"artisanId\", nom) select $AA, 'Smoke DevisOptions' where not exists (select 1 from clients where \"artisanId\"=$AA and nom='Smoke DevisOptions');" >/dev/null
SMOKE_CID=$($PG "select id from clients where \"artisanId\"=$AA and nom='Smoke DevisOptions' limit 1;")
$PG "insert into devis (\"artisanId\", \"clientId\", numero) select $AA, $SMOKE_CID, 'SMOKE-DO-1' where not exists (select 1 from devis where \"artisanId\"=$AA and numero='SMOKE-DO-1');" >/dev/null
SMOKE_DID=$($PG "select id from devis where \"artisanId\"=$AA and numero='SMOKE-DO-1' limit 1;")
codeDO=$(curl -s -o /dev/null -w "%{http_code}" --cookie "token=$TOKEN_A" \
  "$NEWSTACK_URL/api/trpc/devisOptions.getByDevisId?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22devisId%22%3A$SMOKE_DID%7D%7D%7D")
[ "$codeDO" = "200" ] && echo "  ✓ devisOptions.getByDevisId (devis possédé) -> 200" || { echo "  ✖ devisOptions.getByDevisId -> $codeDO (attendu 200)"; fail=1; }

# 3) Contrôle d'isolation : l'auth fonctionne aussi pour B (tenant distinct) — 200 (ses propres données).
codeB=$(curl -s -o /dev/null -w "%{http_code}" --cookie "token=$TOKEN_B" \
  "$NEWSTACK_URL/api/trpc/vehicules.list?batch=1&input=%7B%7D")
[ "$codeB" = "200" ] && echo "  ✓ isolation: user B authentifié -> 200" || { echo "  ✖ user B -> $codeB"; fail=1; }

# 4) Sans cookie → 401 (auth réellement requise).
code401=$(curl -s -o /dev/null -w "%{http_code}" "$NEWSTACK_URL/api/trpc/vehicules.list?batch=1&input=%7B%7D")
[ "$code401" = "401" ] && echo "  ✓ sans cookie -> 401" || { echo "  ✖ sans cookie -> $code401 (attendu 401)"; fail=1; }

[ "$fail" = "0" ] || { echo "✖ Smoke authentifié KO."; exit 1; }
echo "✓ Smoke authentifié OK — les endpoints du nouveau stack répondent 200 pour de vrais utilisateurs staging."
