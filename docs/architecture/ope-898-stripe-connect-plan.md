# OPE-898 — Stripe Connect : l'artisan connecte son compte pour encaisser ses factures (0 commission) — plan d'implémentation

> **Statut : SPIKE / proposition — `Awaiting Human Validation`.** Aucune implémentation dans cette
> issue. Catégories de la porte de validation touchées : **billing/argent**, **migration de schéma**,
> **contrat/API** (flux paiement portail), **architecture** (webhooks Connect), **légal** (marchand de
> record). Ne rien dispatcher avant un « go » humain explicite.

## 0. Résumé exécutif

Aujourd'hui le paiement en ligne d'une facture (`createInvoiceCheckout`) ouvre une **Checkout Session
sur le compte plateforme Operioz** : c'est Operioz qui encaisse, ce qui est faux fonctionnellement et
intenable juridiquement (Operioz deviendrait marchand de record des factures de ses clients et
encaisserait pour le compte de tiers → statut d'établissement de paiement).

L'objectif : **chaque artisan connecte son propre compte Stripe** via Stripe Connect, et le paiement de
SES factures est encaissé **directement sur son compte** (artisan = marchand de record), **Operioz ne
prélève aucune commission**.

**Recommandations (détaillées + sourcées plus bas)** :

1. **Type de compte** → équivalent **« Standard »** : connected account avec **dashboard Stripe complet**,
   **l'artisan paie ses propres frais Stripe**, **l'artisan porte les litiges/KYC**, **onboarding hébergé
   par Stripe** (Account Links). ⚠️ **Nuance 2025/26** : les *account types* `standard`/`express`/`custom`
   sont **dépréciés pour les nouvelles intégrations** ; Stripe recommande les **controller properties**
   (Accounts v1 + controller, ou Accounts v2). On crée donc un compte **« Standard-équivalent par
   controller properties »** (valeurs exactes en §1).
2. **Flux de fonds** → **direct charges** sur le compte connecté (header `Stripe-Account: acct_…`),
   **`application_fee_amount` omis** ⇒ **0 commission**. C'est le seul type de charge supporté par un
   compte Standard, et exactement le bon modèle SaaS « 0 commission, l'artisan est le marchand ».
3. **Onboarding** → `accounts.create` (controller props) + **Account Links** Stripe-hosted, avec reprise.
4. **Gating** → tant que `charges_enabled=false`, paiement en ligne **désactivé** (front portail + garde
   backend), CTA « Connecter Stripe » côté artisan. Même esprit que la gate e-invoicing OPE-882.
5. **Vérification continue** → webhook **`account.updated`** + **reconciler poller** (pattern OPE-879/885)
   + stockage `stripeConnectAccountId` & statut par artisan ; gestion `account.application.deauthorized`.
6. **Données** → colonnes Connect sur `artisans` + migration `--custom`.
7. **Webhooks Connect** → **endpoint séparé** (`connect=true`, **signing secret dédié**) ; articulé avec
   le bootstrap OPE-884. ⚠️ Les events des **direct charges** (checkout.session.completed,
   payment_intent.*) des factures basculent du scope plateforme vers le **scope compte connecté**.
8. **Légal** → artisan = marchand de record de ses factures (KYC porté par Stripe). Séparé et sans impact
   sur la facturation d'abonnement SaaS Operioz→artisan (Operioz reste marchand là).

---

## 1. Type de compte : Standard-équivalent (controller properties), onboarding Stripe-hosted

### 1.1 Comparatif (source Stripe)

| | Standard | Express | Custom |
|---|---|---|---|
| Effort d'intégration | **Le plus faible** | Faible | Très élevé |
| Responsabilité fraude/litiges | **Compte connecté** (direct charges) | Plateforme | Plateforme |
| Onboarding & collecte d'identité | Stripe | Stripe | Plateforme ou Stripe |
| Accès dashboard du connecté | **Dashboard complet** | Express Dashboard | Aucun |
| Types de charge supportés | **Direct uniquement** | Destination / transfers / direct | idem Express |
| Mises à jour conformité auto | Oui | Oui | Non |
| Coût additionnel Stripe | Non | Oui | Oui |

Source : <https://docs.stripe.com/connect/accounts>. La page précise que les exemples typiques de
plateformes Standard sont *« les SaaS, p.ex. un service de facturation et paiement en ligne »* — c'est
exactement Operioz.

### 1.2 Recommandation : **Standard-équivalent**

Pourquoi Standard plutôt qu'Express :

- **Marchand de record & litiges = l'artisan** (objectif explicite). En Standard avec direct charges, la
  responsabilité fraude/litige est portée par le compte connecté, pas par Operioz. En Express/Custom,
  **la plateforme porte les litiges** → on ne veut pas ça.
- **0 commission + 0 frais Connect supplémentaires** : Standard n'a **pas** de surcoût Connect (Express
  et Custom oui). Cohérent avec « Operioz ne prélève rien ».
- **Effort minimal** : onboarding et KYC entièrement hébergés par Stripe ; conformité maintenue par
  Stripe automatiquement.
- **Dashboard Stripe complet** pour l'artisan (remboursements, litiges, exports comptables) sans dev côté
  Operioz.

Contrepartie assumée : l'artisan a une relation directe avec Stripe (il voit la marque Stripe, gère ses
litiges). Acceptable et même souhaitable ici (il EST le marchand).

### 1.3 ⚠️ Nuance 2025/26 — account types dépréciés → controller properties

La doc Stripe indique désormais : *« These account types are deprecated, so don't use them for new
integrations »* et recommande les **controller properties** (Accounts v1 + controller) ou l'**Accounts v2
API**. On reproduit le comportement « Standard » avec les valeurs **exactes** suivantes
(source <https://docs.stripe.com/connect/migrate-to-controller-properties>) :

```
controller.stripe_dashboard.type   = "full"        // dashboard Stripe complet pour l'artisan
controller.fees.payer              = "account"      // l'artisan paie ses frais Stripe
controller.losses.payments         = "stripe"       // l'artisan/Stripe portent les pertes, pas Operioz
controller.requirement_collection  = "stripe"       // KYC collecté par Stripe (onboarding hosted)
```

> **À trancher (humain)** : créer les comptes via **(A)** `accounts.create({ type: "standard" })` (legacy
> mais toujours fonctionnel, le plus simple, identique à l'existant `customers.create`) **ou (B)**
> `accounts.create({ controller: { … } })` (recommandé Stripe, pérenne). Reco : **(B) controller
> properties** pour éviter une dette de migration ultérieure, sauf si l'équipe préfère le chemin legacy
> minimal pour le MVP. Choix sans impact sur le reste du plan (mêmes champs `charges_enabled`, mêmes
> Account Links, mêmes webhooks).

---

## 2. Flux de fonds : direct charges, 0 commission

### 2.1 Mécanique (source Stripe)

Source : <https://docs.stripe.com/connect/charges> & `/connect/direct-charges`.

- **Création** : on ajoute le header **`Stripe-Account: acct_<artisan>`** à l'appel `checkout.sessions.create`
  (dans le SDK Node : `stripe.checkout.sessions.create(params, { stripeAccount: acctId })`). La charge est
  alors créée **dans le compte connecté**.
- **0 commission** : on **omet `application_fee_amount`** (ou =0) ⇒ *« No platform fee is charged »*.
- **Marchand de record** : le compte connecté (nom de l'artisan sur le relevé bancaire du client).
- **Frais Stripe** : payés par l'artisan (`controller.fees.payer="account"`).
- **Litiges/remboursements** : débités du **solde de l'artisan** (*« amounts subject to refund and
  chargeback disputes are debited from the balance of the connected account »*). Operioz hors du flux.

C'est strictement le modèle « SaaS, independent merchants » de la doc.

### 2.2 Impact sur le flux paiement facture EXISTANT

Fichiers concernés (état actuel) :

- `apps/api/modules/paiement/application/use-cases.ts` → `createInvoiceCheckout` (public par token portail).
- `apps/api/shared/ports/stripe.ts` / `stripe-adapter.ts` → `StripePort.createInvoiceCheckout`,
  `retrieveCheckoutSession`.
- `apps/api/shared/infra/portal-payment-reconciliation-poller.ts` → poller de réconciliation.
- `apps/api/modules/subscription/application/webhook-use-cases.ts` → handler `checkout.session.completed`
  qui solde `paiements_stripe` (réutilisé par le portail).
- `apps/api/interface/http/stripe-webhook-route.ts` → endpoint webhook **plateforme** (`connect=false`).

Changements requis (Lot 4) :

1. **`StripePort.createInvoiceCheckout`** doit recevoir le `stripeConnectAccountId` de l'artisan et le
   passer en `{ stripeAccount }` à `sessions.create`. La garde gating (§4) refuse si pas de compte /
   `charges_enabled=false`.
2. **`retrieveCheckoutSession`** (utilisé par le poller) doit aussi passer `{ stripeAccount }` — une
   session de direct charge n'est lisible **que** via le header du compte connecté.
3. **`constructEvent`** des events de direct charge : ces events (`checkout.session.completed`,
   `payment_intent.succeeded`) arrivent désormais sur le **scope compte connecté**, donc sur le **webhook
   Connect** (§7), pas sur le webhook plateforme actuel. Le handler de soldage doit être servi par
   l'endpoint Connect.
4. **`success_url`/`cancel_url`** inchangés (déjà construits sur l'origin public, garde
   `x-forwarded-host` OK).

> **Atomicité (rappel CLAUDE.md)** : la création de la ligne `paiements_stripe` (en_attente) reste
> co-écrite comme aujourd'hui ; le soldage par le webhook/poller reste idempotent. Aucun event de
> domaine ne doit devenir best-effort.

---

## 3. Onboarding — `Account.create` + Account Links

Source : <https://docs.stripe.com/connect/hosted-onboarding>.

Flux (Lot 1) :

1. `accounts.create({ controller: {…} , country: "FR", email: artisan.email, business_type… })`
   → stocker `account.id` (`stripeConnectAccountId`) sur l'artisan.
2. `accountLinks.create({ account, refresh_url, return_url, type: "account_onboarding",
   collection_options: { fields: "eventually_due" } })` → rediriger l'artisan vers `accountLink.url`.
3. **`return_url`** (`/parametres?tab=paiements&connect=return`) : l'artisan est revenu — **ne garantit
   PAS la complétion**. On **refetch le compte** + on lit `charges_enabled`/`details_submitted`/
   `requirements` pour afficher l'état réel.
4. **`refresh_url`** (`/api/paiement/connect/refresh`) : lien expiré/déjà visité → **recréer un Account
   Link** avec les mêmes params et rediriger.
5. **Reprise / ré-onboarding** : si `requirements.currently_due`/`eventually_due` non vides → bouton
   « Compléter / mettre à jour mes infos » qui recrée un Account Link. Pas d'état à gérer côté Operioz —
   Stripe n'affiche que les champs restants.

Contraintes : un **Account Link est valide quelques minutes et à usage unique** → toujours le créer
just-in-time côté backend, jamais le stocker/emailer.

Endpoints HTTP à ajouter (tRPC pour l'artisan authentifié + 1 route HTTP publique pour `refresh_url`) :

- `connect.startOnboarding` (tRPC, artisan) → crée compte si absent + Account Link, renvoie l'URL.
- `connect.status` (tRPC, artisan) → renvoie l'état (charges_enabled, requirements, …) depuis la BDD.
- `GET /api/paiement/connect/refresh?artisanId=…` (HTTP) → recrée un Account Link et redirige (302).

---

## 4. Gating des features de paiement (front + back) — calqué sur OPE-882

Règle : **tant que `charges_enabled=false`, le paiement en ligne d'une facture est interdit.**

- **Backend (garde dure)** dans `createInvoiceCheckout` : avant tout appel Stripe, lire l'état Connect de
  l'artisan (via le contexte tenant résolu par le token portail) ; si pas de compte ou
  `charges_enabled=false` → `{ kind: "bad-request", message: "Le paiement en ligne n'est pas encore
  activé par l'artisan" }`. **C'est la garde qui fait foi** (le front ne fait qu'améliorer l'UX).
- **Front portail** (`apps/web`, portail public) : bouton « Payer en ligne » **désactivé** + message si
  l'artisan n'a pas activé Stripe ; on expose un flag `paiementEnLigneActif` dans le payload du portail.
- **Front artisan** (`apps/web`, `/parametres?tab=paiements`) : carte d'état Connect — non connecté → CTA
  « Connecter Stripe » ; onboarding incomplet → « Compléter » + liste des `requirements` ; actif → badge
  vert + lien vers le dashboard Stripe ; restricted/deauth → alerte + CTA reconnexion.

Cohérence : même posture que la gate e-invoicing (OPE-882) — garde backend = source de vérité, front =
confort. ⚠️ Bien viser **apps/web** (staging.operioz.com), pas apps/admin.

---

## 5. Vérification continue de la connexion

### 5.1 Webhook `account.updated` (temps réel) — Lot 2

Source : <https://docs.stripe.com/connect/webhooks>. L'event porte **`event.account = acct_<id>`** (le
compte connecté) et `data.object` = l'objet account. À chaque `account.updated` : upsert sur l'artisan de
`charges_enabled`, `payouts_enabled`, `details_submitted`, `requirements` (jsonb), `statut` dérivé.

⚠️ **Lookup cross-tenant** : le webhook arrive **sans contexte tenant**. La résolution
`stripeConnectAccountId → artisanId` doit se faire via le **pool owner** (handle owner), comme les
reconcilers cross-tenant (cf. mémoire `reconciler-cross-tenant-rls-owner-pool` et le writer du webhook
paiement existant qui écrit hors-tenant). **Tester sous `app_tenant` donnerait 0 ligne (false-green)** —
écrire les tests RLS en conséquence.

`account.application.deauthorized` → marquer le compte déconnecté (`charges_enabled=false`,
`deauthorizedAt`), re-gater, notifier l'artisan.

### 5.2 Poller / reconciler (filet) — Lot 5

Le webhook peut manquer (endpoint down, secret tourné). On ajoute un **reconciler périodique** via le
helper `runReconciler` (`apps/api/platform/scheduler/reconciler.ts`, OPE-885) :

- **detect()** : artisans avec `stripeConnectAccountId` mais statut potentiellement périmé (fenêtré :
  `updatedAt` Connect > N jours, ou onboarding incomplet de longue date) → `accounts.retrieve(acctId)`
  et comparer à l'état stocké.
- **heal()** : upsert idempotent de l'état réel (jamais d'écrasement destructif) + healing event
  `"healing.paiement.connect-statut-derive"` (convention FR minuscule) **dans la même tx**.
- **verify()** : re-lire l'état dans la tx.

> Self-healing = filet (OPE-879), **pas** une excuse pour rendre le webhook best-effort : le webhook
> `account.updated` reste la voie nominale, le poller corrige les dérives.

---

## 6. Modèle de données + migration

Le 1:1 artisan↔compte Connect rend le plus simple d'ajouter des colonnes sur **`artisans`** (à côté de
`iban`, `plan` déjà présents). `artisans` n'a **pas** de policy RLS `tenant_isolation` (clé = `id`, lue en
création de contexte) → les lectures restent **scopées par `id` au niveau applicatif** (pattern existant),
et le webhook lit par `stripeConnectAccountId` via le **pool owner**.

Colonnes proposées (sur `artisans`) :

| colonne | type | note |
|---|---|---|
| `stripeConnectAccountId` | `varchar(255)` UNIQUE NULL | `acct_…` ; UNIQUE partiel `WHERE NOT NULL` |
| `stripeConnectChargesEnabled` | `boolean NOT NULL DEFAULT false` | source de la gate |
| `stripeConnectPayoutsEnabled` | `boolean NOT NULL DEFAULT false` | info |
| `stripeConnectDetailsSubmitted` | `boolean NOT NULL DEFAULT false` | onboarding soumis |
| `stripeConnectRequirements` | `jsonb` NULL | `currently_due`/`past_due`/… |
| `stripeConnectStatus` | `varchar(20)` | `none`/`pending`/`active`/`restricted`/`deauthorized` (CHECK) |
| `stripeConnectConnectedAt` | `timestamp` NULL | |
| `stripeConnectUpdatedAt` | `timestamp` NULL | dernière synchro (fenêtrage poller) |

> Alternative : table dédiée `stripe_connect_comptes(artisanId UNIQUE, …)`. Plus « propre » mais ajoute
> une jointure et une table RLS de plus pour 0 gain fonctionnel (1:1). **Reco : colonnes sur `artisans`**
> (ponytail), réévaluer si la donnée Connect explose en volume.

**Migration** : `drizzle-kit generate --custom --name=artisans-stripe-connect` puis compléter à la main
(UNIQUE partiel, CHECK statut, defaults). Pas de RLS à ajouter (artisans non-RLS). Relire ligne par ligne
(drizzle-kit oublie index/CHECK). Une seule migration en vol (sérialiser, cf. mémoire migrations).

---

## 7. Webhooks Connect — endpoint dédié

Source : <https://docs.stripe.com/connect/webhooks>. Un endpoint webhook est soit **`connect=false`**
(events du compte plateforme — l'existant OPE-884) soit **`connect=true`** (events des comptes connectés).
Les deux scopes sont **séparés** et ont chacun **leur propre signing secret**.

Conséquence directe du passage en direct charges (§2) : les events de paiement de facture
(`checkout.session.completed`, `payment_intent.succeeded/payment_failed`) deviennent des events **du
compte connecté** ⇒ ils n'arrivent **plus** sur l'endpoint plateforme actuel, mais sur l'endpoint Connect.

Plan (Lot 2 + Lot 4) :

- Nouvel endpoint HTTP **`POST /api/stripe/connect-webhook`** (raw body, comme `stripe-webhook-route.ts`),
  vérifié avec un **`STRIPE_CONNECT_WEBHOOK_SECRET`** dédié (nouvelle clé secret, §config).
- Étendre le bootstrap `ensureStripeWebhookEndpoint` (`stripe-webhook-setup.ts`) pour créer **deux**
  endpoints : plateforme (`connect:false`, events abonnement) et Connect (`connect:true`, events
  `account.updated`, `account.application.deauthorized`, `checkout.session.completed`,
  `payment_intent.*`). Le secret du nouvel endpoint Connect est loggé une fois (fail-closed) à mettre
  dans `STRIPE_CONNECT_WEBHOOK_SECRET`.
- Router les events Connect : `account.*` → writer Connect (owner pool, §5.1) ; `checkout.session.*`/
  `payment_intent.*` (scope connecté, `event.account` présent) → handler de soldage `paiements_stripe`
  existant (réutilisé).
- **Dédup** : réutiliser le pattern `billing_webhook_events` (PK `stripe_event_id`) pour l'idempotence.

> **Config** : ajouter `STRIPE_CONNECT_WEBHOOK_SECRET` (et l'option `getSecret`). Jamais dans
> `.env.production` ; variable runtime serveur/Docker. La clé `STRIPE_SECRET_KEY` (plateforme) est
> réutilisée pour signer les appels Connect (le header `Stripe-Account` suffit).

---

## 8. Edge cases & sécurité

| Cas | Traitement |
|---|---|
| **Onboarding abandonné** | `charges_enabled=false` → gate active, CTA « Compléter » recrée un Account Link |
| **`requirements.past_due`** | compte peut passer `restricted` → re-gater + notifier l'artisan (`account.updated`) |
| **Compte rejeté / restricted** | `charges_enabled=false` ⇒ paiement bloqué ; afficher l'alerte + lien dashboard |
| **Deauthorize** | `account.application.deauthorized` → flag déconnecté, re-gate, CTA reconnexion |
| **Test → live** | `acct_…` est par **mode de clé** (test vs live) ; un compte créé en test n'existe pas en live. Stocker tel quel ; le mode est porté par `STRIPE_SECRET_KEY`. Documenter la reconnexion au passage live |
| **RLS / fuite** | lookup webhook par `stripeConnectAccountId` via **pool owner** ; lectures artisan scopées par `id` ; `accountId` jamais exposé à un autre tenant ; tests RLS écrits côté collaborateur/owner correct |
| **Idempotence** | dédup webhook par `event.id` ; `account.updated` est convergent (upsert du dernier état) ; soldage `paiements_stripe` idempotent (déjà le cas) |
| **Race onboarding double-clic** | `stripeConnectAccountId` UNIQUE + créer le compte uniquement s'il est absent (read-then-create gardé par l'unicité) |
| **Paiement lancé pendant que le compte devient restricted** | la garde backend relit `charges_enabled` au moment du checkout (pas de cache) |

---

## 9. Légal — marchand de record

- **Factures des artisans** : avec Standard + direct charges, **l'artisan est le marchand de record** de
  ses propres factures. Le **KYC est porté par Stripe** via l'onboarding hosted ; l'artisan accepte le
  **Stripe Connected Account Agreement** pendant l'onboarding. Operioz n'est **pas** dans le flux de
  fonds et ne prélève **aucune commission** → Operioz reste un **facilitateur technique (plateforme)**,
  pas un établissement de paiement / pas marchand de record de ces transactions. Charge fiscale, litiges
  et remboursements relèvent de l'artisan.
- **Abonnement SaaS Operioz → artisan** : **inchangé et séparé** (billing maison existant, Operioz =
  marchand, son propre compte Stripe). Aucune interaction avec Connect.
- **CGU/CGV à mettre à jour** (humain/juridique) : mention de l'usage de Stripe Connect, acceptation du
  contrat Stripe par l'artisan, répartition des responsabilités. **À valider hors-périmètre technique.**

---

## 10. Découpage en lots (priorisés) → chacun en `Awaiting Human Validation`

| Lot | Contenu | Dépend de | Risque |
|---|---|---|---|
| **Lot 0 — Fondation data & config** | migration colonnes Connect sur `artisans` (`--custom`) ; secret `STRIPE_CONNECT_WEBHOOK_SECRET` ; `getSecret` | — | migration (sérialiser) |
| **Lot 1 — Onboarding** | `accounts.create` (controller props) + Account Links + tRPC `connect.startOnboarding`/`connect.status` + route HTTP `refresh` + carte UI `/parametres?tab=paiements` (apps/web) | Lot 0 | contrat API, effet externe (création compte Stripe) |
| **Lot 2 — Synchro statut** | endpoint `/api/stripe/connect-webhook` (secret dédié) + bootstrap 2 endpoints + handler `account.updated`/`deauthorized` via **owner pool** + tests RLS | Lot 0 | webhook/sécurité, owner pool |
| **Lot 3 — Gating** | garde backend `createInvoiceCheckout` (`charges_enabled`) + flag `paiementEnLigneActif` portail + UI portail désactivée | Lot 0, Lot 2 | contrat (réponse portail) |
| **Lot 4 — Routage direct charges** | `Stripe-Account` sur `createInvoiceCheckout` + `retrieveCheckoutSession` + bascule du soldage `checkout.session.completed`/`payment_intent.*` sur l'endpoint Connect + poller adapté | Lot 1, Lot 2 | **billing/argent** (cœur du flux) |
| **Lot 5 — Reconciler self-healing** | `runReconciler` statut Connect (detect/heal/verify + healing event atomique) + cron scheduler | Lot 2 | self-healing |

**Ordre d'exécution recommandé** : 0 → (1 ‖ 2) → 3 → 4 → 5. Les Lots 1 et 2 sont parallélisables.
Le **Lot 4 est le point de bascule money** : ne le merger qu'après Lots 1–3 validés et testés bout-en-bout
(vrai navigateur + paiement test sur compte connecté de test).

### Tests anti-régression à livrer (règle CLAUDE.md)
- **L1/L2** : reconcile Connect (writer owner pool — tester sous owner, pas app_tenant), gate
  `createInvoiceCheckout` (charges_enabled false → bad-request), upsert `account.updated`.
- **L2 RLS** : non-fuite `stripeConnectAccountId` cross-tenant ; lookup webhook par accountId.
- **L3** : route portail renvoie `paiementEnLigneActif` ; refresh recrée un Account Link.
- **L4 (mutations e2e, `scripts/staging-e2e-mutations.mjs`)** : portail → bouton payer **désactivé** si
  artisan non connecté (persistance vérifiée) ; une fois connecté (compte test), checkout créé **sur le
  compte connecté** (vérifier l'absence d'`application_fee` et le routage).

---

## 11. Risques & questions ouvertes

- **R1 — bascule du scope webhook (Lot 4)** : le jour où les invoice checkouts passent en direct charge,
  leurs events quittent l'endpoint plateforme. Si l'endpoint Connect n'est pas prêt/configuré, les
  paiements ne se soldent plus (le poller rattrape, mais avec délai). → déployer Lot 2 **avant** Lot 4,
  garder le poller comme filet.
- **R2 — comptes Stripe existants** : si des artisans ont déjà un compte Stripe perso, Standard + OAuth
  permet de **connecter un compte existant** (option `type:standard` + OAuth) plutôt que d'en créer un.
  À trancher : `accounts.create` (nouveau compte) vs OAuth « Connect existing ». Reco MVP : création
  hosted (plus simple), OAuth en option ultérieure.
- **R3 — choix legacy `type` vs controller properties** (cf. §1.3) — décision humaine.
- **R4 — devise/pays** : MVP `country:"FR"`, `currency:"eur"` (déjà le cas). Multi-pays = hors-scope.
- **R5 — CGU/CGV & conformité juridique** : à faire valider par le juridique (hors technique).
- **R6 — facturation électronique (OPE-295/882)** : le paiement Connect est orthogonal à l'archivage/PDP,
  mais vérifier que le marchand de record (artisan) reste cohérent avec l'émetteur Factur-X.

## Sources
- Connected account types — <https://docs.stripe.com/connect/accounts>
- Controller properties — <https://docs.stripe.com/connect/migrate-to-controller-properties>
- Charges (direct/destination/transfers) — <https://docs.stripe.com/connect/charges>
- Hosted onboarding / Account Links — <https://docs.stripe.com/connect/hosted-onboarding>
- Connect webhooks — <https://docs.stripe.com/connect/webhooks>
</content>
</invoke>
