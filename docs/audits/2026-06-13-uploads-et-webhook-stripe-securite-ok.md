# Audit — Uploads (logo / photos) + Webhook Stripe : sécurité ✅ OK (aucun BLOCKER ; 3 réserves LOW)

**Date** : 2026-06-13 · **Projet** : Lancement 30 juin · **Domaine** : surfaces d'**upload de fichiers** (logo artisan, photos d'intervention/analyse) et **webhook de paiement Stripe** (hors Stripe Connect = OPE-6).

> Cibles classiques de BLOCKER avant lancement : **upload non restreint** (type/taille), **stored XSS** (SVG), **path traversal**, **forge de webhook** (marquer une facture payée gratuitement), **rejeu** de webhook. Vérification end-to-end : entrée → stockage → rendu.

---

## ✅ Upload du logo (`/api/upload-logo`, `server/_core/index.ts:316-339`)

| Axe | Constat | Verdict |
|---|---|---|
| **Auth** | `getUserFromRequest` → 401 si non authentifié (`:320`) ; `getArtisanByUserId` scope l'écriture sur l'artisan courant | ✓ |
| **Taille** | multer `limits.fileSize = 2 Mo` (`:316`) → `LIMIT_FILE_SIZE` mappé en 400 | ✓ |
| **Type** | allowlist `['image/png','image/jpeg','image/webp','image/svg+xml']` (`:326`) | ⚠️ voir réserve 1 |
| **Stockage** | encodé en **data-URI base64** dans `artisans.logo` (colonne DB) — **pas d'écriture fichier** → **aucun path traversal**, aucun nom de fichier attaquant | ✓ |
| **Rendu** | toujours via `<img src={dataURI}>` (`DashboardLayout.tsx:990`, `Parametres.tsx`) — **aucun** `dangerouslySetInnerHTML`. Le **PDF** (`client/src/lib/pdfGenerator.ts:108`) n'accepte QUE `png|jpe?g|webp` (**SVG exclu** par regex) | ✓ |
| **Fuite d'erreur** | `sqlMessage`/`code` **loggés serveur**, jamais renvoyés (`:341-348`) — mappage vers messages génériques | ✓ |

→ **Pas de XSS exploitable** : un SVG malveillant servi via `<img src=data:...>` **n'exécute pas** de script (les SVG chargés en `<img>` sont non-scriptés), et le PDF rejette le SVG. Le logo n'est jamais inliné (`innerHTML`) ni servi comme document autonome (`Content-Type: image/svg+xml`).

## ✅ Upload de photos (intervention + analyse IA)

- `interventions.addPhoto` (`routers.ts:5513`) : **ownership** `intervention.artisanId === artisan.id` → FORBIDDEN sinon (`:5526`).
- `addPhoto` analyse (`routers.ts:8094`) : `assertAnalyseOwner(analyseId, userId)` avant écriture.
- Signatures manuscrites : `signatureData`/`signatureClient` **bornés à 500 000 car** (`:3220`, `:5483`). Rendues via `<img>`.

→ Toutes les écritures de photo sont **scopées tenant**. Pas d'IDOR.

## ✅ Webhook Stripe (`/api/stripe/webhook`, `server/stripe/webhookHandler.ts:40`)

- **`express.raw`** AVANT `express.json()` (`index.ts:193`) → corps brut préservé pour la vérif de signature. ✓
- **Signature vérifiée** : `constructWebhookEvent(req.body, signature, secret)` (`:60`) ; échec → **400**. ✓
- **Fail-closed** (OPE-79, `:52-55`) : si `STRIPE_WEBHOOK_SECRET` absent → **refus 500** (ne vérifie **jamais** à clé vide → pas de forge HMAC clé-vide). ✓ **C'est le contrôle anti-« facture payée gratuitement ».**
- **Métadonnées de confiance** : `facture_id`/`token_paiement` lus dans `session.metadata` (`:139-140`) — **posés par notre serveur** à la création de la session et reçus via un événement **signé** → non forgeables par un tiers. Le marquage `payee` (`:165-170`) repose donc sur une source authentifiée.
- Le court-circuit `evt_test_` (`:71`) intervient **après** la vérif de signature → un faux event de test devrait quand même être signé (impossible sans le secret). ✓

---

## 🟡 Réserves LOW (defense-in-depth — sous le seuil BLOCKER/HIGH, pas de ticket)

1. **`image/svg+xml` dans l'allowlist du logo** (`index.ts:326`). **Non exploitable aujourd'hui** (rendu `<img src>` non-scripté + PDF excluant le SVG), mais c'est un **risque latent** : si un jour le logo est inliné (email HTML inline, page SSR, `innerHTML`) ou servi comme document autonome `Content-Type: image/svg+xml`, un SVG `<script>`/`onload` deviendrait un **stored XSS** visible des clients. **Durcissement** : retirer `image/svg+xml` de l'allowlist (aligner sur le PDF qui ne l'accepte déjà pas) — coût ~1 ligne. Le type n'est par ailleurs pas vérifié par **magic-bytes** (mimetype multipart = déclaratif), non bloquant tant que le rendu reste `<img>`.
2. **`addPhoto.url` / `description` non bornés** (`routers.ts:5516-5517`, `:8097-8098`) : `z.string()` sans `.max()`. Borné en pratique par la limite de corps globale (cf. classe **OPE-24** bornes/DoS, déjà filée), mais un `.max()` aligné (≈ 2-5 Mo pour un data-URI, 5000 pour la description) serait propre. Intra-tenant, scoping OK → **LOW**.
3. **Pas d'idempotence par `event.id`** sur le webhook (`webhookHandler.ts`) : Stripe livrant *at-least-once*, un **rejeu** du même event re-positionne le même état final (idempotent sur `payee`/`complete`) **mais** re-crée une **notification** « Paiement reçu » (doublon cosmétique). La tolérance temporelle de `constructEvent` (~5 min) borne les rejeux. **LOW** — pas de double-encaissement (état final identique). Amélioration future : table `webhook_events(id)` dédup.

## Odoo 19 (référence)

`account_payment_stripe` / `payment` : webhooks vérifiés par signature, référence de transaction rattachée au `payment.transaction` créé côté serveur (jamais au seul ID fourni par le client), et déduplication par référence. Operioz atteint l'équivalent : signature fail-closed + métadonnées serveur signées. L'idempotence par event-id est un raffinement (réserve 3).

---

## Verdict

Les surfaces **upload (logo/photos)** et **webhook Stripe** sont **saines pour le lancement** : upload **authentifié + borné en taille + allowlist + stockage data-URI (pas de path traversal) + rendu `<img>` non-scripté** ; webhook **signature-vérifiée fail-closed** (OPE-79) avec métadonnées **serveur** non forgeables (pas de « facture payée gratuitement »). **Aucun BLOCKER/HIGH → pas d'issue Linear.** 3 réserves **LOW** (defense-in-depth) : retirer le SVG de l'allowlist logo, borner `addPhoto.url`, dédup webhook par `event.id` — à traiter en MODE A opportuniste, non bloquant 30 juin.
