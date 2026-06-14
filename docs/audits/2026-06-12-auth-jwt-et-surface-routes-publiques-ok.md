# Audit — Authentification JWT + surface des routes Express publiques ✅ OK (aucun BLOCKER nouveau)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Domaine** : Auth / sécurité de la surface HTTP publique

> Audit de la **signature/validation des sessions JWT** et de **toutes les routes Express**
> (`server/_core/index.ts`) servant données/fichiers hors tRPC : recherche de fallback de
> secret, confusion d'algorithme, et **IDOR** (accès par `:id` sans vérif d'appartenance).

---

## Conclusion : la signature JWT et le scoping des routes publiques sont **solides**. Aucun nouveau ticket. Seul écart connu = OPE-32 (révocation), déjà filé.

### ✅ 1) Signature & validation JWT (`server/_core/auth-simple.ts`)

| Aspect | Constat | Réf. |
| -- | -- | -- |
| **Secret requis** | `JWT_SECRET` lu de l'env ; **throw au boot** si absent ; **`z.string().min(32)`** dans `env.ts:12`. **Aucun fallback/défaut** | `auth-simple.ts:8-11`, `env.ts:12` |
| **Algorithme épinglé** | `jwtVerify(token, key, { algorithms: ["HS256"] })` → defense-in-depth contre **confusion d'algo / `alg:none`** | `auth-simple.ts:40` |
| **Expiration** | `setExpirationTime("7d")` ; cookie `maxAge` 7 j | `auth-simple.ts:25,14` |
| **Cookie** | `httpOnly`, `secure` en prod, `sameSite:"lax"`, `path:"/"` | `auth-simple.ts:53-59` |
| **Rôle/permissions frais** | `getUserFromRequest` **relit l'utilisateur en DB** par `payload.userId` et **recharge les permissions** depuis `permissions_utilisateur` à chaque requête (le token ne porte **pas** les droits) | `auth-simple.ts:101-130` |
| **Utilisateur inactif** | `if (user.actif === false) return null` | `auth-simple.ts:113` |
| **Moindre privilège** | rôle défaut `"technicien"` (jamais `admin`) si absent | `auth-simple.ts:141` |

→ Pas de forge de token possible (secret fort obligatoire), pas d'escalade via token (droits relus en DB), pas de confusion d'algo. **Seul écart connu** : pas de `jti`/version → un token volé reste valide 7 j même après changement de mot de passe = **OPE-32** (HIGH, déjà filé). Non re-filé.

### ✅ 2) Routes Express servant des PDF/documents — toutes scopées (JWT + ownership)

| Route | Auth | Ownership | Réf. |
| -- | -- | -- | -- |
| `/api/contrats/:id/pdf` | JWT cookie (HS256) | `contrat.artisanId !== artisan.id → 403` | `index.ts:568-578` |
| `/api/interventions/:id/bon-pdf` | JWT cookie (HS256) | `intervention.artisanId !== artisan.id → 403` (+ technicien re-vérifié) | `index.ts:600-619` |
| `/api/commandes-fournisseurs/:id/pdf` | JWT cookie (HS256) | `commande.artisanId !== artisan.id → 403` | `index.ts:639-649` |
| `/api/portail/:token/devis|factures/:id/pdf` | jeton portail | (couvert par `2026-06-10-portail-pdf-download-idor-ok.md`) | `index.ts:506,533` |

→ Un `:id` étranger renvoie **403/404**, pas le document. Pas d'IDOR.

### ✅ 3) `/api/paiement/status/:factureId` — scopé jeton portail + appartenance client

`token` requis (jeton portail) → `getClientPortalAccessByToken` ; puis `facture.clientId !== access.clientId → 404` (`index.ts:1098-1107`). Un `clientId` appartenant à un seul artisan, l'égalité `clientId` empêche toute fuite cross-client/cross-tenant. Pas d'IDOR.

### ✅ 4) `/api/articles/search` & `/api/articles/categories` — catalogue de **référence public**, pas de données tenant

La requête lit `bibliotheque_articles WHERE visible = 1` (`index.ts:434-435`) — le **catalogue de référence partagé** (autocomplétion de lignes de devis/onboarding), **pas** les articles privés d'un artisan ni leurs prix d'achat. **Rate-limit par IP** (120/min, OPE-24, `:414`) anti-scraping/DoS. Pas de fuite tenant.

### Routes déjà couvertes ailleurs (non re-auditées)

`/api/stripe/webhook` (signature — notes Stripe), `/api/comptabilite/fec|export-csv|facturx*` (`2026-06-11-fec-export-scoping-tenant-ok.md`), `/api/upload-logo` (`2026-06-10-logo-svg-xss-upload-mime-ok.md`), `/api/assistant/stream` + `/api/voice/*` (notes assistant/voice ; rate-limit voice = OPE-24), `/api/calendar/:token.ics` (`2026-06-12-ical-feed-pii-exposure-ok-reserve-medium.md`).

## Verdict

**Authentification JWT robuste** (secret obligatoire ≥ 32, HS256 épinglé, droits relus en DB, inactif bloqué) et **surface de routes publiques sans IDOR** (PDF/paiement scopés par ownership, articles = catalogue public rate-limité). **Aucun BLOCKER/HIGH nouveau** → **pas d'issue Linear**. Le seul écart d'auth ouvert (révocation de session) est **OPE-32**, déjà filé.
