# Audit — Surface des routes Express (non-tRPC) de `index.ts` : auth/scoping OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : **toutes** les routes `app.get/post/delete` de `server/_core/index.ts`
> (hors tRPC), revue auth + scope tenant + IDOR + path traversal + injection.

---

## Conclusion : **toute** la surface HTTP non-tRPC est authentifiée/token-gated et cloisonnée. Aucun IDOR, aucun path traversal, aucune injection. Aucun BLOCKER/HIGH. 2 réserves **LOW** (déjà connues).

### ✅ Routes vérifiées ce run

| Route | Garde | Verdict |
| -- | -- | -- |
| `/api/fonts/:name` (`:352`) | `:name` matché à une **whitelist** (`roboto-regular/bold.ttf`) → sinon 404 ; jamais utilisé comme chemin FS (renvoie un base64 embarqué) | ✅ **pas de path traversal** |
| `/api/articles/search` (`:376`) + `/categories` (`:417`) | interroge `bibliotheque_articles` (**catalogue de référence partagé**, `visible=1`) — **pas de données tenant** ; requêtes **paramétrées** (LIKE en `?`) | ✅ pas de fuite tenant, pas de SQLi |
| `/api/paiement/status/:factureId` (`:917`) | `token` portail **obligatoire** → `getClientPortalAccessByToken` → **`facture.clientId !== access.clientId` ⇒ 404** | ✅ **pas d'IDOR** |
| `/api/paiement/create-checkout-session` (`:831`) | idem (token + `clientId`) **+ garde de statut** : `payee`/`brouillon`/`annulee` ⇒ 400 (**OPE-67** présent) | ✅ scopé + non encaissable hors état |

### ✅ Routes déjà auditées (rappel, toutes gardées)

- `/api/stripe/webhook` (`:162`) : `express.raw` + vérification de signature (cf. OPE-79).
- `/api/upload-logo` POST/DELETE : cf. `upload-logo-fichiers-ok`.
- PDF portail `/api/portail/:token/...pdf` : token + `access.clientId` (cf. `portail-pdf-download-idor-ok`).
- PDF `/api/contrats/:id/pdf`, `/api/commandes-fournisseurs/:id/pdf` : JWT + `artisanId` (réserve `actif` = classe OPE-32).
- Compta `/api/comptabilite/fec|export-csv|facturx|export-*-lot` : `authFromCookie` + scope `artisan.id` (cf. `exports-pdf-endpoints-securite-ok`).
- `/api/voice/debug|token|persist|tool`, `/api/assistant/stream` : cf. `voice-assistant-tools-isolation-ok`, `assistant-stream-auth-scope-ok` (debug sanitizé + rate-limité, OPE-24).

---

## 🟡 Réserves LOW (déjà connues, sous le seuil)

1. **URL de retour du checkout** (`:870-871`) construite depuis `x-forwarded-proto` + `req.get('host')` (en-tête Host). Même **classe origin/host** que `routers.ts:1784` : un Host spoofé n'affecte que la **redirection post-paiement de la propre session du payeur** (pas de victime tierce), et le proxy (Cloudflare/Railway) fixe le Host réel. **LOW**, flux de paiement — laissé délibérément hors auto-fix.
2. `/api/articles/search` **non authentifié + sans rate-limit** : mais c'est un **catalogue de référence public** (pas de PII, pas de tenant) → simple **scraping** possible. **LOW** (classe OPE-24).

---

## Verdict

La **surface HTTP non-tRPC** (webhook, upload, fonts, articles, PDF portail/contrat/compta, paiement, voice, assistant) est **entièrement authentifiée/token-gated et cloisonnée** : whitelist sur les fonts (pas de traversal), catalogue public paramétré (pas de SQLi/fuite), endpoints paiement **token + `clientId`-scopés + garde de statut** (pas d'IDOR). **Aucun BLOCKER/HIGH.** Deux réserves **LOW** déjà connues (Host du retour checkout = classe origin/host ; search public sans rate-limit). **Pas de nouvelle issue Linear.**
