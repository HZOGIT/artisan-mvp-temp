# OPE-301 — Limites de flexibilité du billing (Stripe Subscriptions)

> Audit non bloquant, cible new-stack (`src/`). Pour chaque mode : **faisable nativement
> avec Stripe Subscriptions ? avec contournement ? impossible sans reprendre la main ?**
> + **valeur business** pour le profil cible (artisan BTP : TPE, souvent mono-établissement,
> volumétrie modeste, sensibilité prix/relation commerciale forte).
> S'appuie sur l'existant cartographié dans `audit-existant.md` (OPE-300).

## 0. Rappel de l'existant (contraintes structurantes)

- Souscription = Checkout **`mode: subscription`** ; cycle de vie 100 % piloté par webhooks.
- Table `subscriptions` = **miroir** (1 ligne, `UNIQUE(artisan_id)`).
- Seul levier « variable » existant = **add-on utilisateurs supplémentaires** à quantité
  **fixe** (`use-cases.ts:43-47`) — pas de metering.
- Aucune méthode de **prélèvement off-session / SetupIntent**, aucune **émission de facture
  propre**, aucun **avoir/crédit**, aucun **usageRecord** dans `StripePort`.
- Le **gating** (expiré → blocage, quotas appareils/sessions) est centralisé dans un seul
  middleware `subscriptionGuard` (cf. OPE-300 §5) : enrichir la logique « état → autorisation »
  se fait à un seul endroit.

---

## 1. Matrice — mode × faisabilité Stripe × valeur business (BTP)

| Mode de facturation | Faisable Stripe Subscriptions natif ? | Aujourd'hui dans notre code | Effort sans reprendre la main | Valeur business BTP | Verdict |
|---|---|---|---|---|---|
| **1. Usage / metered** (nb factures, users, stockage) | ✅ Oui (metered prices / Billing Meters + usage records) | ❌ rien (add-on user **statique**) | Moyen : ajouter `reportUsage` + meters Stripe | **Moyenne** (per-seat) / **Faible** (stockage, nb factures) | **Delegate** (Stripe) si on en veut |
| **2. Hybride** base + usage + add-ons | ✅ Oui (plusieurs line items / prices sur 1 sub) | ⚠️ partiel (base + add-on user) | Faible-moyen (config + metering pour la part usage) | **Moyenne** | **Delegate / Hybride** |
| **3. À la carte / one-shot** combiné à l'abo | ⚠️ Oui via invoice items / one-time | ❌ pour le SaaS (le `mode: payment` existe mais pour les factures **client**) | Moyen | **Moyenne** (packs SMS, options, frais de mise en service) | **Delegate** ou **Build léger** |
| **4. Paliers / volume / graduated** | ✅ Oui nativement (tiered prices) | ❌ prix **flat** par unité | **Très faible** (juste configurer des Prices tiered) | **Faible-moyenne** | **Delegate** |
| **5. Facturation par entité** (multi-établissements) | ⚠️ Possible (1 sub/établissement, ou quantités) | ❌ **bloqué** : `UNIQUE(artisan_id)` ⇒ 1 sub/artisan | Élevé : refonte modèle de données | **Faible** (majorité mono-site) / Moyenne pour les multi-sites | **Build** (data-model) si le segment le justifie |
| **6. Remises / avoirs / gestes commerciaux / crédits reportables** | ⚠️ Coupons + credit notes + customer balance, mais **rigide** | ❌ rien (pas de coupon SaaS, pas d'avoir, pas de balance) | Élevé pour du sur-mesure | **Moyenne-élevée** (closing & rétention BTP) | **Build / Hybride** |
| **7. Cycles non standard** (annuel mensualisé, date fixe, prorata custom) | ⚠️ `billing_cycle_anchor` + prorata auto, mais « annuel mensualisé » et prorata sur-mesure pénibles | ❌ rien de custom | Élevé pour l'annuel-mensualisé | **Moyenne** | **Build / Hybride** |
| **8. Couplage facturation électronique (PA)** — émettre à l'artisan une facture conforme | ❌ **Non** (factures Stripe ≠ Factur-X / plateforme agréée) | ❌ on délègue la facture SaaS à Stripe | Élevé (mais moteur PA déjà en cours côté projet voisin) | **Élevée** (réglementaire + synergie) | **Build** |

---

## 2. Analyse par mode (le « pourquoi » du verdict)

### 1. Usage / metered
Stripe gère le metered nativement, mais **rien** côté Operioz ne reporte d'usage : l'add-on
« utilisateurs supplémentaires » est une **quantité fixe** posée au Checkout, pas un compteur.
Pour le profil BTP, facturer « au nombre de factures émises » ou « au stockage » a peu de
sens commercial (volumes faibles, lisibilité du prix valorisée). Le seul axe usage crédible
= **par siège**, déjà couvert (statiquement). **Pas un moteur de reprise de contrôle.**

### 2. Hybride (base + usage + add-ons)
On a déjà l'embryon (base + add-on). Ajouter de l'usage est faisable avec Stripe sans
reprendre la main. Valeur moyenne. **Ne justifie pas un build.**

### 3. À la carte / one-shot combiné
Frais de mise en service, formation, packs (SMS, e-signature…). Stripe sait facturer un
one-time sur la facture d'abonnement (invoice items). On a déjà tout le plumbing Checkout
`mode: payment` (`paiement/use-cases.ts`) mais **pour les factures client**, pas pour le SaaS.
Faisable en delegate ou build léger. Valeur moyenne (utile au catalogue d'options).

### 4. Paliers / volume / graduated
**Le moins coûteux** : Stripe Prices supportent `tiered` (graduated/volume) ; il suffit de
**configurer** les Prices et d'envoyer le bon `price` dans les line items. Aucune reprise de
contrôle nécessaire. Valeur faible-moyenne (dégressif sièges pour Entreprise). **Quick win
delegate.**

### 5. Facturation par entité (multi-établissements)
**Limite structurelle de NOTRE modèle**, pas de Stripe : `subscriptions.UNIQUE(artisan_id)`
(`schema.pg.ts:1747`) impose 1 abonnement par artisan. Facturer/consolider par établissement
demande de revoir le modèle de données (entité de facturation ≠ artisan). Pour le BTP majoritaire
(mono-site), valeur faible ; pertinent pour quelques groupes multi-sites. **Build data-model,
seulement si le segment le justifie commercialement.**

### 6. Remises / avoirs / gestes commerciaux / crédits reportables
Stripe propose coupons, credit notes et **customer balance**, mais : aucun coupon n'est câblé
au Checkout SaaS (`use-cases.ts:48` n'active pas `allow_promotion_codes` — contrairement au
Checkout **client** `stripe-adapter.ts:71`), aucun avoir, aucun usage du customer balance.
Le sur-mesure (geste commercial négocié, avoir partiel, crédit reportable sur N mois) est
**mal servi** par les primitives Stripe rigides. C'est un **fort levier de closing/rétention**
en vente BTP. **Candidat build / hybride** — et c'est exactement ce que le prélèvement
off-session (OPE-307) rend possible (on maîtrise le montant prélevé).

### 7. Cycles non standard
`billing_cycle_anchor` (date fixe) est faisable. **« Annuel engagé, payé mensuellement »**
(courant en vente BTP) est pénible avec Stripe (abonnement mensuel + suivi d'engagement de
notre côté). Prorata sur-mesure (≠ prorata auto Stripe) idem. Valeur moyenne. **Build/hybride
si l'offre commerciale en a besoin.**

### 8. Couplage facturation électronique (PA) — **driver principal**
Aujourd'hui la facture SaaS d'Operioz à l'artisan = **facture Stripe** (hébergée, non
Factur-X, non transmise via plateforme agréée). Avec la réforme française e-invoicing
(obligatoire B2B à partir de 2026 ; transmission via **PDP** immatriculée ou **Chorus Pro/PPF**),
émettre à l'artisan une facture **conforme** suppose de **générer un Factur-X et de le
transmettre via une PDP**.

**Nuance (source Stripe, [factur-x-format-france](https://stripe.com/fr/resources/more/factur-x-format-france))** :
Stripe **ne génère pas nativement de Factur-X** et ne se connecte pas lui-même à une PDP. Il
propose deux voies : « utilisez votre logiciel de facturation », **ou** un **connecteur
partenaire** (app **Billit** sur le Stripe App Marketplace) pour émettre les e-factures depuis
Stripe. Donc : ce n'est pas « impossible avec Stripe » au sens strict — c'est faisable **via un
tiers**. Mais :
- **On construit ce moteur de toute façon** : l'émission Factur-X + PDP est déjà au programme
  pour les factures **des artisans à leurs clients** (cœur ERP / projet PA, EPIC OPE-227).
  Réutiliser ce moteur pour notre propre facturation SaaS = **coût quasi marginal** ; la voie
  Billit ajouterait une **dépendance tierce payante** pour une capacité qu'on possède déjà.
- La voie Billit reste une **option de repli** si l'on veut éviter le build de la brique facture.

**Valeur élevée (réglementaire + réutilisation). Build/réutilisation recommandé ; délégation via
PDP partenaire = repli.**

---

## 3. Priorisation & recommandation pour OPE-307 (build vs delegate vs hybride)

**Ce qui NE justifie PAS de reprendre la main** (rester delegate Stripe) :
- **Paliers/volume (4)** : quick win pur config Stripe.
- **Usage/metered (1)** et **hybride (2)** : faisables Stripe, valeur BTP limitée.
- **À la carte (3)** : delegate ou build léger, non structurant.

**Ce qui justifie de reprendre la main** (build / hybride — alignés sur le prélèvement
off-session après SetupIntent visé par OPE-307) :
1. **Facturation électronique PA (8) — valeur élevée, driver réglementaire + synergie moteur PA.**
2. **Remises / avoirs / gestes commerciaux / crédits reportables (6) — valeur moyenne-élevée,
   levier commercial que Stripe sert mal.**
3. **Cycles non standard, surtout annuel-mensualisé (7) — valeur moyenne.**
4. **Facturation par entité (5)** — uniquement si le segment multi-sites pèse (refonte data-model).

### Orientation recommandée : **hybride**
- **Posséder l'émission de facture + le prélèvement** (SetupIntent + off-session) → débloque
  **(8), (6), (7)** d'un coup, et nous redonne avoirs/crédits/gestes commerciaux.
- **Garder Stripe** comme PSP (tokenisation CB, SCA, encaissement) **et** pour les cas
  standard où il suffit (paliers, metering éventuel).
- **Atout pour le build** : le **gating** est déjà centralisé en un seul middleware
  (`subscriptionGuard`, cf. OPE-300 §5). Reprendre la main = enrichir la table « état →
  autorisation » à un seul endroit (ex. suspendre sur `past_due` selon notre propre échéancier
  de relance, au lieu de subir le calendrier Stripe).

> En clair : **on ne reprend pas la main pour faire ce que Stripe fait déjà bien**
> (paliers, metered, hybride simple). **On reprend la main pour ce que Stripe sert mal et qui
> compte pour le BTP** : factures conformes (PA), souplesse commerciale (avoirs/crédits/gestes),
> et cycles à la française (annuel mensualisé). Le SetupIntent off-session est l'outil ; la
> facturation électronique est la justification n°1.
