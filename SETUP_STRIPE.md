# Setup Stripe Billing — Operioz

Ce document liste **tout** ce qu'il faut configurer manuellement dans Stripe Dashboard et dans Railway pour activer le système d'abonnement (T1-T7).

Tant que les `STRIPE_PRICE_*` ne sont pas définis, le bouton "Choisir Pro" renverra une erreur claire (`PRECONDITION_FAILED — Prix Stripe non configure pour pro month`). Le reste de l'app fonctionne normalement.

---

## 1. Variables d'environnement Railway

### Déjà présentes (à vérifier)
```
STRIPE_SECRET_KEY=sk_live_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
EMAIL_FROM=Operioz <noreply@operioz.com>
```

### Nouvelles à ajouter

**URL publique de l'app** (utilisée pour les success/cancel URLs Stripe + CTA d'emails) :
```
APP_URL=https://artisan.cheminov.com
```

**Price IDs des 3 plans × 2 intervals** (créés dans Stripe Dashboard, voir §2) :
```
# Plan Essentiel — 29 €/mois (1 user, 3 appareils, 2 sessions)
STRIPE_PRICE_ESSENTIEL_MONTH=price_...
STRIPE_PRICE_ESSENTIEL_YEAR=price_...

# Plan Pro — 49 €/mois (3 users inclus, 3 appareils/user, 3 sessions)
STRIPE_PRICE_PRO_MONTH=price_...
STRIPE_PRICE_PRO_YEAR=price_...

# Plan Entreprise — 89 €/mois (10 users inclus, 3 appareils/user, 4 sessions)
STRIPE_PRICE_ENTREPRISE_MONTH=price_...
STRIPE_PRICE_ENTREPRISE_YEAR=price_...
```

**Price IDs des users supplémentaires** (un seul par plan, prix unitaire mensuel/annuel × quantité utilisée par Stripe) :
```
# Pro : +10 €/mois par user supplémentaire
STRIPE_PRICE_EXTRA_USER_PRO_MONTH=price_...
STRIPE_PRICE_EXTRA_USER_PRO_YEAR=price_...

# Entreprise : +8 €/mois par user supplémentaire
STRIPE_PRICE_EXTRA_USER_ENT_MONTH=price_...
STRIPE_PRICE_EXTRA_USER_ENT_YEAR=price_...
```

L'année est facturée -20% (Stripe permet aussi de définir un prix annuel arbitraire). Tarification de référence côté frontend :
- Essentiel : `29 × 12 × 0.8 = 278 €/an`
- Pro : `49 × 12 × 0.8 = 470 €/an`
- Entreprise : `89 × 12 × 0.8 = 854 €/an`

---

## 2. Création des produits et prix dans Stripe Dashboard

Pour chaque plan :

1. **Catalogue → Produits → Nouveau produit**.
2. Nom : `Operioz — Essentiel` (puis Pro, Entreprise).
3. Description courte.
4. Ajoute **2 prix** au produit :
   - **Mensuel récurrent** : 29 € (49, 89), `EUR`, facturation mensuelle.
   - **Annuel récurrent** : 278 € (470, 854), `EUR`, facturation annuelle.
5. Copie les `price_xxx` de chaque prix dans la variable correspondante.

Pour les **users supplémentaires** (Pro et Entreprise), créer 2 produits distincts :
- `Operioz — User supplémentaire Pro` : prix 10 €/mois et 96 €/an (`10 × 12 × 0.8`).
- `Operioz — User supplémentaire Entreprise` : prix 8 €/mois et 77 €/an.

Lors du checkout, Operioz envoie `quantity = N` à Stripe — donc le prix unitaire est ce que vous mettez dans Stripe, Stripe multiplie automatiquement.

---

## 3. Webhook Stripe

**Endpoint** : `https://artisan.cheminov.com/api/stripe/webhook`

**Méthode** : POST, secret de signature dans `STRIPE_WEBHOOK_SECRET`.

**Événements à activer** (Dashboard → Développeurs → Webhooks → Ajouter événements) :
- `checkout.session.completed` (déjà géré pour paiements factures clients)
- `payment_intent.succeeded` (déjà géré)
- `payment_intent.payment_failed` (déjà géré)
- **`customer.subscription.created`** (T2)
- **`customer.subscription.updated`** (T2)
- **`customer.subscription.deleted`** (T2)
- **`customer.subscription.trial_will_end`** (T2 — déclenché J-3 par Stripe)
- **`invoice.payment_succeeded`** (T2 — renouvellement réussi)
- **`invoice.payment_failed`** (T2 — bascule en past_due)

Une fois activé, Stripe enverra ces événements. Le webhook (`server/stripe/webhookHandler.ts`) les traite tous, met à jour la table `subscriptions`, envoie les emails de confirmation/erreur, et crée les notifications in-app.

---

## 4. Portail client Stripe (Billing Portal)

Pour que le bouton "Gérer mon abonnement" fonctionne, activer le portail dans Stripe :

1. **Paramètres → Billing → Customer portal → Configurer**.
2. Activer :
   - Mise à jour de la carte
   - Téléchargement des factures
   - Annulation (cohérent avec notre `cancel` qui fait `cancel_at_period_end`)
3. Sauvegarder.

---

## 5. Migration DB

Aucune action manuelle requise. Le bloc T1 dans `server/_core/fix-duplicates.ts` s'exécute à chaque déploiement Railway et crée idempotemment :
- Table `subscriptions`
- Table `devices`
- Table `active_sessions`
- Colonnes `artisans.trial_ends_at` et `artisans.subscription_status`
- Seed initial : artisan id=1 → entreprise active 30j, autres → trial 30j.

**Vérification logs Railway après deploy** :
```
[Subscriptions] Table OK
[Devices] Table OK
[Sessions] Table OK
[Artisans] Colonne trial_ends_at ajoutee (ou silence si déjà là)
[Artisans] Colonne subscription_status ajoutee
[Subscriptions] Seed initial : N artisan(s) ajoute(s)
```

---

## 6. Scheduler

Pas de configuration manuelle. Le scheduler (T5) tourne **uniquement en production** (skip en dev), démarre à `+60s` après le boot, puis toutes les heures.

Tâches par tick :
1. `cleanExpiredSessions()` — DELETE active_sessions WHERE expires_at < NOW.
2. UPDATE subscriptions SET status='expired' WHERE trial dépassé.
3. Envoi des emails J-3 (`buildTrialEndingJ3Email`).
4. Envoi des emails J-1 (`buildTrialEndingJ1Email`).

Logs attendus :
```
[Scheduler] Active (toutes les heures)
[Scheduler] N session(s) expiree(s) nettoyee(s)
[Scheduler] N trial(s) expire(s) -> plan='expired'
[Scheduler] N email(s) J-3 envoye(s)
[Scheduler] N email(s) J-1 envoye(s)
```

Note : `customer.subscription.trial_will_end` arrive **aussi** par webhook Stripe (J-3 automatique). Le scheduler envoie en plus pour les comptes en mode "trial sans Stripe" (créés mais jamais abonnés).

---

## 7. Test après configuration

### Test paiement (mode test Stripe)

1. Avec `STRIPE_SECRET_KEY=sk_test_...`, créer un compte demo, aller dans `/parametres?tab=abonnement`.
2. Cliquer "Choisir Pro" → redirection vers Checkout Stripe.
3. Carte test : `4242 4242 4242 4242`, date future, CVC quelconque.
4. Vérifier la redirection vers `/parametres?tab=abonnement?success=1` + toast "Abonnement actif".
5. Vérifier le webhook `customer.subscription.created` reçu (logs Railway).
6. Vérifier dans la DB : `subscriptions` row mise à jour avec `stripe_customer_id`, `stripe_subscription_id`, `plan='pro'`, `status='trialing'` (puis `active` à fin du trial).

### Test échec paiement

Carte test : `4000 0000 0000 0341` (échec après auth). Vérifier webhook `invoice.payment_failed` → status `past_due` + email envoyé.

### Test annulation

1. Cliquer "Annuler mon abonnement" → confirmer.
2. Vérifier `cancel_at_period_end = true` dans Stripe et dans la DB.
3. Vérifier le bouton "Réactiver" qui apparaît.

### Test limite appareils

1. Avec un compte Essentiel (max 3 appareils), se connecter depuis 4 navigateurs différents.
2. Le 4ème doit recevoir HTTP 403 `device_limit_reached` à la première requête tRPC.
3. Aller dans `/parametres?tab=abonnement` → onglet "Mes appareils" → cliquer "Révoquer" sur un appareil.
4. Recharger sur le 4ème navigateur, accès débloqué.

### Test trial expiré

1. Forcer en DB : `UPDATE subscriptions SET trial_ends_at = NOW() WHERE artisan_id = X`.
2. Recharger l'app → bandeau orange/rouge dans `DashboardLayout`.
3. Au prochain tick scheduler (ou manuel), `status='expired'` → `ExpiredBlocker` s'affiche.
4. Navigation autorisée uniquement vers `/parametres` et `/profil`.

---

## 8. Points connus

- **Artisan id=1 (demo cheminov)** est seedé en `entreprise` actif 30j, donc jamais bloqué — utile pour les démos.
- **Nouveau signup** : pas de subscription créée à l'inscription. Le `subscriptionGuard` la crée au premier appel tRPC (auto-trial 30j).
- **Plan "Agence" (20+ users)** : pas de checkout automatique, le bouton frontend renvoie vers `mailto:contact@operioz.com`.
- **Pas de proration** : un upgrade de Pro vers Entreprise repart sur le prix complet du nouveau plan (Stripe gère le prorata côté facturation par défaut).
- **Sessions simultanées** : pas de blocage, juste éviction LRU silencieuse.
