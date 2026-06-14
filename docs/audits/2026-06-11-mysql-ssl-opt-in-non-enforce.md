# Audit — Connexion MySQL : SSL/TLS opt-in (non enforced) — MEDIUM (conditionnel prod)

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : config du pool MySQL et résolution `DATABASE_URL` (`server/db.ts:100-136`),
> `docker-compose.staging.yml`.

---

## Constat : le chiffrement DB dépend d'un paramètre d'URL, et n'est pas imposé

```typescript
// db.ts:100 — SSL seulement si ?ssl=… dans l'URL
ssl: dbUrl.searchParams.get('ssl') ? JSON.parse(dbUrl.searchParams.get('ssl')!) : undefined,
// db.ts:136 — pool
ssl: dbConfig.ssl,   // undefined => connexion EN CLAIR
```

→ Si `DATABASE_URL` **ne contient pas** `?ssl=…`, `ssl: undefined` ⇒ **connexion MySQL en
clair** (pas de TLS). Le code **supporte** SSL mais **ne l'impose pas**.

### Cas staging (acceptable)

`docker-compose.staging.yml` : `DATABASE_URL: mysql://…@mysql:3306/artisan_mvp` (**pas de
`?ssl`**) → **plaintext**, **mais** MySQL est sur le **réseau docker interne** (service
`mysql`, non exposé hors host) → le trafic ne quitte pas la machine → **OK**.

### Cas prod (à vérifier)

Si la **prod** utilise une **DB distante/managée** (autre host, sur le réseau) **sans
`?ssl`** dans l'URL → **credentials + toutes les données** (PII clients, financier)
transitent **en clair** → risque **MITM/sniffing**. Non vérifiable ici (URL = secret
d'env). → **MEDIUM conditionnel** à la topologie prod.

### Piège de config

`JSON.parse(ssl)` accepte `{"rejectUnauthorized":false}` → SSL **sans validation de
certificat** = toujours MITM-able. À éviter en prod.

---

## Reco (hardening prod)

1. **Prod DB distante** : inclure SSL dans `DATABASE_URL`
   (`?ssl={"rejectUnauthorized":true}` ou le CA du fournisseur managé). **Ne pas** utiliser
   `rejectUnauthorized:false`.
2. **Enforcer** en code : si `NODE_ENV=production` **et** host DB non-loopback/non-interne
   **et** `ssl` absent → **refuser de démarrer** (fail-closed), pour éviter un plaintext
   silencieux en prod.
3. Si DB co-localisée (même host/réseau privé), plaintext acceptable (documenter le choix).

---

## Distinction (anti-doublon)

- `env-config-guards-ok` couvrait la **présence** des secrets, pas le **transport SSL** de
  la DB. `hygiene-deploiement-compose-staging` (MEDIUM) couvrait root/port MySQL exposé —
  complémentaire. Pas de doublon ; reco de hardening.

---

## Verdict

Le SSL MySQL est **opt-in** (param d'URL) et **non imposé** : OK en **staging** (réseau
docker interne), mais en **prod** avec une **DB distante sans `?ssl`** → **trafic DB en
clair**. **MEDIUM** conditionnel à la topologie prod (non vérifiable depuis le code).
**Pas de nouvelle issue Linear** ; reco = SSL enforced en prod (sans `rejectUnauthorized:false`).
