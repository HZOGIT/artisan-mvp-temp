# Audit — Routes Express brutes « documents/PDF par id » : auth + scoping tenant ✅ OK (aucun IDOR)

**Date** : 2026-06-13 · **Projet** : Lancement 30 juin · **Domaine** : Sécurité API — routes Express **non-tRPC** servant des documents par `id`

> Sweep des endpoints Express `app.get('/api/.../:id/...')` qui **streament un fichier/PDF**
> (téléchargeables hors flux tRPC, donc à protéger explicitement). Recherche d'**IDOR**
> (téléchargement d'un document d'un autre tenant via son id) + auth manquante. Couvre les
> routes **récentes** (bon d'intervention OPE-161, Factur-X) non incluses dans les sweeps précédents.

---

## ✅ Routes authentifiées (JWT cookie) + scopées tenant

| Route | Auth | Vérif. d'appartenance | Verdict |
|---|---|---|---|
| `GET /api/contrats/:id/pdf` (`index.ts:561`) | `jwtVerify` cookie (HS256) → 401 | `contrat.artisanId !== artisan.id` → **403** (`:578`) | ✓ |
| `GET /api/interventions/:id/bon-pdf` (`:594`, **OPE-161**) | `jwtVerify` cookie → 401 | `intervention.artisanId !== artisan.id` → **403** (`:610`) ; technicien re-vérifié (`:619`) | ✓ |
| `GET /api/commandes-fournisseurs/:id/pdf` (`:633`) | `jwtVerify` cookie → 401 | `commande.artisanId !== artisan.id` → **403** (`:649`) | ✓ |
| `GET /api/comptabilite/facturx/:factureId` (`:851`) | `authFromCookie()` → 401 | `facture.artisanId !== artisan.id` → **404** (`:858`) | ✓ |
| `GET /api/comptabilite/facturx-xml/:factureId` (`:879`) | `authFromCookie()` → 401 | `facture.artisanId !== artisan.id` → **404** (`:886`) | ✓ |

## ✅ Routes publiques (portail) correctement token-scopées

| Route | Scoping | Verdict |
|---|---|---|
| `GET /api/portail/:token/devis/:id/pdf` (`:506`) | token portail (déjà vérifié `2026-06-13-benchmark-portail-client-idor-sweep-ok.md`) | ✓ |
| `GET /api/portail/:token/factures/:id/pdf` (`:533`) | idem | ✓ |
| `GET /api/paiement/status/:factureId` (`:1090`) | `getClientPortalAccessByToken(token)` (actif+non expiré) **puis** `facture.clientId !== access.clientId` → **404** (`:1105`) | ✓ pas d'IDOR |

## ✅ Helper d'auth centralisé sain

`authFromCookie` (`index.ts`) : exige le cookie (`401`), `jwtVerify(token, secret, { algorithms: ["HS256"] })` (**algorithme épinglé** → pas de confusion d'algo / `alg:none`, expiration vérifiée par jose), résout l'artisan via `getArtisanByUserId(payload.userId)` (collaborateur → artisan parent), `404` sinon. Les appelants ajoutent le contrôle `resource.artisanId === artisan.id`. → socle d'auth robuste partagé par les routes comptables.

## Notes (non-findings)

- **Header injection via `Content-Disposition` filename** : les noms de fichier interpolent `contrat.reference` / `facture.numero` / `commande.numero` (numérotation système) / `intervention.id` (numérique). Même si un champ contenait des CRLF, **Node.js `res.setHeader` rejette** les valeurs d'en-tête avec caractères de contrôle (lève → 500) → **pas d'injection d'en-tête** possible. Non-finding.
- Routes comptables non-id (`/api/comptabilite/fec`, `export-csv`, `export-*-lot`) : `authFromCookie` + scoping artisan, déjà couvertes (`fec-export-scoping-tenant-ok`).

---

## Verdict

**Toutes** les routes Express brutes servant un document/PDF par `id` **authentifient** (JWT cookie HS256 épinglé) **et vérifient l'appartenance au tenant** (`artisanId === artisan.id` → 403/404), ou **token-scopent** par `clientId` pour les routes publiques du portail. Le helper `authFromCookie` est robuste. **Aucun IDOR**, **aucun BLOCKER/HIGH** → **pas d'issue Linear**. Surface de téléchargement de documents **saine** pour le lancement.
