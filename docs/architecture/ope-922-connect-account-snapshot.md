# OPE-922 — Snapshot du compte Stripe Connect par paiement

> **SPIKE / design — lecture seule, AUCUNE implémentation dans cette PR.**
> Catégorie **RISQUÉE** (argent + modèle de données + traçabilité légale).
> Les lots d'implémentation sont **proposés en `Awaiting Human Validation`** et ne seront
> dispatchés qu'après « go » humain explicite.

## 1. Problème

`paiements_stripe` ne porte **aucune information de compte Connect**. Schéma actuel
(`drizzle/schema/factures.ts`) :

```
id, factureId, artisanId, stripeSessionId, stripePaymentIntentId,
montant, devise, statut, lienPaiement, tokenPaiement, paidAt, createdAt, updatedAt
```

Le compte Connect de l'artisan (`acct_…`) vit **uniquement** sur la ligne `artisans`
(`stripe_connect_account_id`), une **valeur courante**. Tout code qui veut savoir « sur quel
compte ce paiement a transité » doit faire un **JOIN sur la valeur courante de l'artisan**.

**Conséquence** : si l'artisan **change de compte Connect** (deauthorize puis reconnexion avec
un nouveau `acct_…`), tous les paiements antérieurs — `en_attente` à réconcilier comme `payee`
à rembourser — pointeront implicitement vers le **nouveau** compte. Stripe ne trouvera pas la
session / le payment_intent / la charge sur ce compte → **réconciliation et remboursement
cassés**, et **perte de la trace probante** (sur quel compte l'argent a réellement transité —
exigence comptable/légale).

### 1.1 État réel du code (vérifié) — précision importante

Aujourd'hui le routage Connect **n'est pas encore câblé** :

- `StripeAdapter.createInvoiceCheckout` (`apps/api/shared/ports/stripe-adapter.ts`) crée la
  Checkout Session **sur le compte plateforme** — aucun `on_behalf_of`, `transfer_data`,
  `application_fee*`, ni option `{ stripeAccount }`. (`grep` de ces termes = 0 occurrence hors
  compte plateforme.)
- Le compte Connect n'est lu que pour le **gating** : `getArtisanChargesEnabled`
  (`portal-payment-reader-drizzle.ts`) lit `stripe_connect_account_id` + `charges_enabled` de
  l'artisan **courant** et n'en retourne qu'un booléen (Lot 3).
- `StripePort.retrieveCheckoutSession(sessionId)` ne prend **pas** de compte → le poller de
  réconciliation (`portal-payment-reconciliation-poller.ts`) interroge Stripe **sans
  `stripeAccount`**.

**Donc le bug est aujourd'hui latent mais structurel.** Il devient **immédiatement bloquant**
dès qu'on câble les charges Connect (destination ou direct charges), parce que :

1. **Direct charges** : la session/PI/charge vit **sur le compte connecté** ; `retrieve` *doit*
   passer `{ stripeAccount: acct_… }`. Sans compte figé par ligne, le poller et le refund ne
   peuvent pas viser le bon compte après un changement.
2. **Destination charges** : la charge vit sur la plateforme mais `on_behalf_of` / `transfer_data
   .destination` pointent un compte précis ; un refund/transfer-reversal doit référencer **le
   compte d'origine**, pas le courant.

Le snapshot est donc le **prérequis modèle-de-données** du câblage Connect, à poser **avant ou
en même temps** que le routage des charges — pas après.

### 1.2 Aggravant : le compte n'est pas effacé au deauthorize

`ConnectArtisanWriterDrizzle.resetConnectStatus` (deauthorize, Lot 2) met
`stripe_connect_status = 'deauthorized'` mais **conserve** `stripe_connect_account_id`. Et
`startOnboarding` réutilise `accountId` s'il est non-nul. Aujourd'hui ça « protège »
accidentellement la trace, mais c'est fragile : la moindre évolution qui **nulle / remplace**
`stripe_connect_account_id` (reconnexion sur un nouveau compte, nettoyage, support) fait
disparaître la seule référence au compte d'origine des paiements passés. **La trace ne doit pas
dépendre d'un champ mutable de `artisans`.**

## 2. Proposition

**Figer (snapshot) sur la ligne `paiements_stripe`, à la création, le compte Connect et les
identifiants d'objets Stripe**, au lieu de re-dériver la valeur courante de l'artisan.

### 2.1 Colonnes proposées

| Colonne | Type | Rôle |
|---|---|---|
| `stripe_connect_account_id` | `varchar(255)` nullable | Compte Connect (`acct_…`) **utilisé à la création**. Figé. |
| `stripe_charge_id` | `varchar(255)` nullable | `ch_…` de la charge soldée (refund cible la charge sur **son** compte). |

Notes :
- `stripeSessionId` et `stripePaymentIntentId` **existent déjà** → on ne les recrée pas. On
  ajoute seulement `stripe_connect_account_id` (le compte) et `stripe_charge_id` (cible refund).
  Le `payment_intent_id` est déjà soldé par le webhook (`completeCheckout`).
- **Nullable assumé** : `en_attente` créés avant câblage Connect, ou paiements plateforme
  historiques, n'ont pas de compte connecté → `NULL` = « plateforme / non-Connect », sémantique
  explicite. Pas de `NOT NULL` (rejetterait l'existant → crash-loop boot, cf. mémoire
  *migration-constraint-on-existing-data-crashloop*).
- **Pas de FK** vers `artisans.stripe_connect_account_id` : justement, on veut que la valeur
  **survive** à un changement du compte courant de l'artisan. Une FK irait à l'encontre du but.

### 2.2 Qui écrit quoi, quand

| Moment | Acteur | Écrit |
|---|---|---|
| Création Checkout | `createInvoiceCheckout` → `PortalPaymentWriter.createPaiement` | `stripe_connect_account_id` = le compte **résolu et utilisé pour créer la session** (même valeur que celle passée à Stripe pour le routage). |
| `checkout.session.completed` (webhook) ou poller | `WebhookPaymentWriter.completeCheckout` | `stripe_charge_id` (depuis la session/PI), confirme/figue le compte si absent. |
| Refund | use-case refund (futur) | lit `stripe_connect_account_id` + `stripe_charge_id` **de la ligne**, jamais de `artisans`. |

> **Invariant clé** : le compte écrit sur la ligne est **exactement** celui passé à l'API Stripe
> pour créer/router la charge. Sans routage Connect câblé (état actuel), la valeur est `NULL`
> (plateforme). Le snapshot et le câblage des charges doivent donc être **co-livrés** (même lot
> ou lots strictement enchaînés) pour ne jamais écrire un compte qui n'a pas servi.

## 3. Edge cases à couvrir

1. **Changement de compte Connect (deauthorize → reconnexion nouveau `acct_`)** — paiements
   antérieurs restent rattachés à leur compte d'origine via la ligne figée. ✅ couvert par
   snapshot. Sans lui : cassé.
2. **Compte `deauthorized` / `restricted` entre création et paiement** — un `en_attente` créé
   sur compte A, puis A est deauthorized avant que le client paie : la session existe toujours
   sur A. Le poller doit interroger A (via la ligne), pas le compte courant. Refus/échec côté
   Stripe à journaliser, pas à re-router silencieusement.
3. **Remboursement d'un paiement passé** — refund **doit** cibler `stripe_charge_id` sur
   `stripe_connect_account_id` **d'origine** (`{ stripeAccount }` pour direct charges, ou
   transfer-reversal pour destination). Lire la ligne, jamais l'artisan courant.
4. **Payouts** — hors périmètre direct du paiement, mais le compte d'origine reste la clé de
   rapprochement comptable des virements ; le snapshot fournit la jointure historique fiable.
5. **`en_attente` créé sur l'ancien compte, poller exécuté après le changement** — sans
   snapshot, le poller (`retrieveCheckoutSession`) viserait le mauvais compte (ou le compte
   plateforme) → `no-session` à tort, paiement jamais réconcilié (même classe que les incidents
   #382/#386). Avec snapshot : le poller passe `{ stripeAccount }` lu sur la ligne.
6. **Cohérence reconciler Lot 5** — le reconciler `heal:connect-statut-desync`
   (`connect-reconciler.ts`) ne touche **que le statut du compte sur `artisans`**, pas les
   paiements. Il reste **orthogonal** : aucune régression, mais il faut documenter qu'il **ne
   doit jamais** « réparer » un compte de paiement à partir de l'artisan courant.
7. **Poller Lot 4** (`portal-payment-reconciliation-poller.ts`) — doit être adapté pour
   sélectionner aussi `stripe_connect_account_id` et le propager à `retrieveCheckoutSession`
   (signature du port à étendre : `retrieveCheckoutSession(sessionId, connectAccountId?)`).
8. **Idempotence / re-snapshot** — ne jamais **écraser** un `stripe_connect_account_id` déjà
   posé (le premier compte ayant servi fait foi). Écriture **conditionnelle** (`WHERE … IS
   NULL`) côté `completeCheckout`.

## 4. Traçabilité / valeur probante

Chaque mouvement d'argent doit rester rattaché, de façon immuable, à **quel compte** a reçu/traité
les fonds et **quand**. La ligne `paiements_stripe` figée (compte + charge + `paidAt`) constitue
cette trace ; combinée au journal d'events de domaine (`event_outbox`, atomique), elle couvre
l'exigence comptable/légale même après un changement de compte. **Aucune dérivation depuis un
champ mutable de `artisans` n'est acceptable comme preuve.**

## 5. Migration

- **Migration additive nullable** sur `paiements_stripe` :
  `ADD COLUMN IF NOT EXISTS stripe_connect_account_id varchar(255)` +
  `ADD COLUMN IF NOT EXISTS stripe_charge_id varchar(255)` (pas de `NOT NULL`, pas de FK).
- **RLS** : `paiements_stripe` est déjà `FORCE ROW LEVEL SECURITY` avec `tenant_isolation` +
  `public_token_select` (cf. `20260628*`). Ajouter des **colonnes** ne change pas les policies
  existantes → **rien à régénérer côté RLS** (les policies portent sur `artisanId` /
  `tokenPaiement`, pas sur les nouvelles colonnes). À **vérifier explicitement** en review.
- **Index** : `stripe_charge_id` interrogé par refund → index partiel
  `WHERE stripe_charge_id IS NOT NULL` recommandé. `stripe_connect_account_id` : index seulement
  si une requête le filtre (sinon YAGNI).
- **Backfill** de l'existant : pour les lignes déjà soldées, `stripe_connect_account_id` ←
  `artisans.stripe_connect_account_id` **courant** est un *best-effort* imparfait (justement la
  valeur courante peut déjà avoir changé). Proposition : backfill best-effort **documenté comme
  approximatif** pour l'historique, et journaliser le fait que ces lignes pré-snapshot n'ont pas
  de garantie probante. Les nouvelles lignes (post-déploiement) sont, elles, exactes.
- **Sérialisation** : 1 seule migration en vol (cf. mémoires *pm-serialize-migration-dispatch*,
  *pm-serialize-shared-hot-files-waves* — Stripe Connect touche des fichiers chauds partagés :
  use-cases paiement, writer, port Stripe).

## 6. Plan de lots proposé (en `Awaiting Human Validation`)

> Ces lots **dépendent du câblage des charges Connect** (destination/direct) — à clarifier avec
> l'humain : le snapshot n'a de valeur exacte que si les charges sont effectivement routées vers
> les comptes connectés. Si le routage Connect est lui-même un préalable non encore planifié, le
> signaler.

- **Lot A — migration snapshot** : colonnes `stripe_connect_account_id` + `stripe_charge_id`
  (nullable, index partiel refund), backfill best-effort documenté. Test L2 présence colonnes +
  RLS inchangée. *(migration → sérialisée)*
- **Lot B — écriture à la création** : `createPaiement` figue le compte effectivement utilisé
  pour router la Checkout ; étendre le port/adapter Stripe pour router + retourner le compte.
  Co-livré avec le câblage de la charge Connect (sinon écrit `NULL`). Tests L1/L2.
- **Lot C — refund ciblant le compte d'origine** : use-case refund lisant la ligne
  (`stripe_connect_account_id` + `stripe_charge_id`), `retrieveCheckoutSession`/refund étendus
  avec `connectAccountId`. Tests L1 (cible compte d'origine) + L2/L3.
- **Lot D — poller Connect-aware** : `portal-payment-reconciliation-poller` sélectionne et
  propage `stripe_connect_account_id` à `retrieveCheckoutSession` ; test sous `app_tenant`
  reproduisant le no-op cross-tenant (anti-false-green, cf. règle CLAUDE.md / mémoire
  *reconciler-system-job-owner-pool*).

## 7. Hors périmètre / à trancher par l'humain

- **Le routage Connect des charges est-il déjà décidé** (destination vs direct charges) ? Le
  modèle de snapshot diffère légèrement (refund direct = `{ stripeAccount }` ; destination =
  transfer-reversal). À fixer avant Lot B/C.
- **Politique de backfill** de l'historique pré-snapshot (best-effort approximatif vs laisser
  `NULL` + marquer « non garanti »).
- **Application fee / commission plateforme** : si une commission est prélevée, elle s'écrit au
  routage (Lot B) — décision produit/légale séparée, hors de ce spike.

---

*Spike OPE-922 — aucune modification de runtime dans cette PR (doc seule).*
