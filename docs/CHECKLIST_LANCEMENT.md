# Checklist Pré-lancement Operioz

Document de référence pour valider que Operioz est prêt à accueillir ses premiers clients payants. À jour au **2026-05-17**.

---

## ✅ Technique (Claude Code — déjà fait)

- [x] **Isolation multi-artisans auditée** — audit complet réalisé, ~25 endpoints CRITIQUES corrigés (articles, devis lignes, factures lignes, notifications, chantiers complet, géolocalisation RGPD, bibliothèque articles passée en `adminOnlyProcedure`). Cf. commit `9b0faaf`. **À surveiller** : les routers `vehicules.*`, `conges.*`, `devisOptions.*`, `badges.*` ont des failles MASQUÉES par helpers DB manquants (crashent en runtime). Avant d'ajouter ces helpers, leur intégrer le check ownership.
- [x] **Stripe Billing configuré et testé** — 10 price IDs validés via endpoint diagnostic (29/278,40 € Essentiel, 49/470,40 € Pro, 89/854,40 € Entreprise, +10/96 user Pro, +8/76,80 user Entreprise). Webhook gère 9 events. Cf. commits `230fff5`/`6c08a28`/`22e81d4`/`978c415`/`c7f1e3e`.
- [x] **Emails transactionnels fonctionnels** — 6 templates (J-3, J-1, paiement OK/KO, résiliation, découverte J+3) via Resend. Scheduler horaire prod-only. Cf. `a7f2d4d`/`964a58c`.
- [x] **PDFs avec accents corrects** — Roboto chargée via base64 dans `fonts.ts`, accents é à è ù ê ô OK.
- [x] **Performance optimisée** — lazy loading 64 pages, compression gzip, SQL indexes sur `artisanId`, cache TTL, `getDashboardStats` O(N)→O(1), rate limiting auth.
- [x] **Sécurité renforcée** — bcrypt mots de passe, JWT cookies HttpOnly Lax, rate limit signin/signup 5/15min/IP, security headers (X-Frame DENY, HSTS, Referrer-Policy), middleware subscription guard avec limite appareils + sessions LRU.
- [x] **Mobile responsive** — bottom nav, drawer accordion accordéon, headers `sm:flex-row` cohérents partout (cf. T2C cohérence).
- [x] **PWA installable** — manifest.json theme_color #2563eb, service worker, apple-touch-icon.
- [x] **Recherche globale Ctrl+K** — accessible partout, accent-insensitive (COLLATE utf8mb4_general_ci).
- [x] **Page Support + FAQ + formulaire contact** — `/support` + endpoint `support.contact`. Tawk.to placeholder.
- [x] **Pages légales** — Mentions, CGU, CGV, Confidentialité RGPD. Banner cookies sur Home.
- [x] **Onboarding** — skip immédiat, 30 jours partout, email découverte J+3.

## 🔲 À faire manuellement avant lancement

### Infrastructure & domaine
- [ ] **Domaine `operioz.com`** acquis (déjà `artisan.cheminov.com` actif)
- [ ] **DNS** A/CNAME pointant vers Railway, propagation OK
- [ ] **Certificat SSL/HTTPS** valide sur `operioz.com` (auto via Railway)
- [ ] **Redirect `cheminov.com` → `operioz.com`** si bascule définitive
- [ ] **Email `support@operioz.com`** créé (boîte ou alias)
- [ ] **Email `privacy@operioz.com`** créé (DPO RGPD)
- [ ] **Email `contact@operioz.com`** créé

### Services tiers
- [ ] **Compte Tawk.to** créé sur tawk.to (chat live gratuit), property ID copié, variable `VITE_TAWK_ID` ajoutée dans Railway
- [ ] **Stripe en mode PRODUCTION** (basculer depuis test) — `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` en `sk_live_*` / `whsec_*` live
- [ ] **Variables Railway** mises à jour avec les clés Stripe production correspondant au mode live
- [ ] **Webhook Stripe production** activé sur l'endpoint `/api/stripe/webhook` avec les 9 events (cf. `SETUP_STRIPE.md`)
- [ ] **Customer Portal Stripe** configuré (carte / factures / annulation)
- [ ] **Google Analytics ou Plausible** configuré (mesure trafic + conversions)
- [ ] **Backup DB automatique** vérifié (Railway propose des snapshots quotidiens — activer + tester restore)
- [ ] **Sentry ou équivalent** configuré pour monitoring d'erreurs production (`SENTRY_DSN` env var existe déjà côté code)

### Légal
- [ ] **Compléter les placeholders** dans `client/src/pages/legal/MentionsLegales.tsx` (raison sociale, SIRET, RCS, adresse, directeur publication, TVA intracommunautaire)
- [ ] **CGU validées par un juriste** (texte actuel est un template solide mais doit être relu)
- [ ] **CGV validées par un juriste**
- [ ] **Mentions légales complétées** avec les vraies infos société
- [ ] **Politique RGPD complétée** (placeholder responsable du traitement)
- [ ] **Déclaration CNIL** si nécessaire (traitement basique, probablement registre interne suffit)
- [ ] **Data Processing Agreement (DPA)** signé avec Railway (RGPD sous-traitance)
- [ ] **DPA** avec Stripe, Resend, Anthropic (téléchargeables sur leurs portails)

### Marketing & lancement
- [ ] **Landing page finale** validée (typos, visuel)
- [ ] **Captures d'écran réelles** sur la landing (actuellement génériques ?)
- [ ] **5 artisans bêta-testeurs** identifiés et briefés
- [ ] **Stratégie réseaux sociaux** définie (LinkedIn pro, Instagram visuel chantiers)
- [ ] **Offre Early Adopter** préparée (-30 % à vie pour les 50 premiers ?)
- [ ] **Communiqué de presse** prêt (presse pro BTP, Le Moniteur, Capital, etc.)
- [ ] **Page Product Hunt** préparée si visée internationale

## 🧪 Tests de bout-en-bout à effectuer

- [ ] **Test inscription complet** : email réel → confirmation reçue → connexion → onboarding → premier devis créé
- [ ] **Test paiement carte production** (carte personnelle réelle, montant 29 €) avec annulation immédiate
- [ ] **Test paiement échoué** : carte expirée, vérifier email d'alerte + status `past_due`
- [ ] **Test annulation** abonnement + réactivation
- [ ] **Test limite 3 appareils** : se connecter depuis 4 navigateurs/appareils différents, vérifier HTTP 403 sur le 4ème
- [ ] **Test trial expiré** : forcer `UPDATE subscriptions SET trial_ends_at = NOW()` → vérifier `ExpiredBlocker`
- [ ] **Test mobile iOS Safari** (responsive + PWA installable + bottom nav)
- [ ] **Test mobile Android Chrome** (idem)
- [ ] **Test 3 artisans en parallèle** : créer 3 comptes, vérifier qu'aucun ne voit les données des autres (isolation T1)
- [ ] **Test performance** : Lighthouse score > 90 sur Home, < 3s Time-to-Interactive
- [ ] **Test envoi email réel** : déclencher un envoi devis → vérifier réception côté client (pas dans spam)
- [ ] **Test export PDF avec accents** : devis avec "Évier", "François", "Châtaigne" → caractères corrects
- [ ] **Test export Excel/CSV** : vérifier encoding UTF-8 BOM pour Excel français

## 🔐 Sécurité avant lancement

- [ ] **Endpoint diagnostic supprimé** (`/api/stripe/config-check` — supprimé en commit `c7f1e3e`) ✅
- [ ] **Aucun secret en clair** dans le repo (`git log -p | grep -E "sk_live|password|whsec"` → 0 résultat)
- [ ] **`.env.example`** à jour, `.env` dans `.gitignore`
- [ ] **HSTS preload** activé sur `operioz.com` (https://hstspreload.org)
- [ ] **CSP headers** envisagés (en plus de X-Frame DENY déjà actif)
- [ ] **Audit npm vulnérabilités** : `pnpm audit` → 0 high/critical

## 📊 Métriques à mettre en place dès J0

- [ ] Compteur signups quotidiens
- [ ] Conversion essai → payant
- [ ] Churn mensuel
- [ ] NPS / satisfaction (formulaire dans Support ?)
- [ ] Activation : % d'artisans ayant créé ≥ 1 devis / facture dans les 7 premiers jours
- [ ] Tickets support volume + temps de réponse moyen

---

## 📋 Récapitulatif des dernières grandes étapes techniques

| Date | Mission | Commit clé |
|---|---|---|
| 2026-05-15 | T1-T7 abonnement Stripe complet | `230fff5` → `b9454ac` |
| 2026-05-15 | Recherche accent-insensitive | `19da7c4` |
| 2026-05-16 | Validation Stripe + endpoint diagnostic | `e3602fc` |
| 2026-05-17 | Cleanup endpoint diagnostic | `c7f1e3e` |
| 2026-05-17 | T1 audit isolation multi-tenant | `9b0faaf` |
| 2026-05-17 | T2 page Support | `edcf16d` |
| 2026-05-17 | T3 pages légales + cookies | `a3b9709` |
| 2026-05-17 | T4 onboarding + email J+3 | `964a58c` |
| 2026-05-17 | T5 SEO + formulaires | `da2a24a` |
| 2026-05-17 | T6 cette checklist | (commit en cours) |
