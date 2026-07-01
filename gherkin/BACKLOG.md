# Backlog scénarios Gherkin — boucle d'enrichissement

> ⛔ **STOP CRON À 50** : dès que la DB Notion atteint **50 scénarios**, arrêter
> la boucle (`CronDelete 81f9bbce`) — ne plus ajouter de scénario au-delà.

État persistant de la boucle cron (relu à chaque tick). **Règle : on fait les
classiques / essentiels d'abord, puis on enrichit / complexifie.** Chaque tick
prend **le premier item non coché** de la section « Essentiels », l'ancre dans
le code, écrit UN scénario de qualité, coche la case.

Recette + conventions : [`README.md`](README.md). Chaque scénario doit être
**grounded dans le code** (citer le module / use-case de `apps/api/modules/…`).

## Cartes de test Stripe (à utiliser dans les scénarios paiement)

| Carte | Comportement |
|---|---|
| `4242 4242 4242 4242` | Paiement accepté (Visa) |
| `4000 0000 0000 9995` | Refusé — fonds insuffisants |
| `4000 0025 0000 3155` | Authentification 3D Secure requise |
| `4000 0000 0000 0002` | Refusé — carte déclinée |

## Essentiels (P0 — classiques, à faire d'abord)

- [x] `commercial` · client signe un devis (`signature`)
- [x] `commercial` · devis signé → facture (`factures`)
- [x] `commercial` · **paiement** facture en ligne, carte OK 4242 (`paiement/use-cases.createInvoiceCheckout`)
- [x] `commercial` · l'artisan crée puis envoie un devis (`devis/application` create + envoyer)
- [x] `commercial` · l'artisan relance un devis non signé (`relances-devis`)
- [x] `commercial` · le client refuse un devis (`devis` transition refuser)
- [x] `commercial` · une facture non payée passe « en_retard » (`factures` transition)
- [x] `onboarding` · l'artisan démarre son abonnement, carte 4242, essai 15 j (`billing.activateOnboardingSubscription` + `createSetupIntent`/`confirmPaymentMethod`)
- [x] `clients` · l'artisan crée un client (`clients/application` create)
- [x] `clients` · l'artisan importe des clients (`clients` import)
- [x] `terrain` · l'artisan planifie une intervention et l'affecte à un technicien (`interventions` create + affecter)
- [x] `terrain` · le technicien clôture une intervention (`interventions-mobile`)
- [x] `gestion` · l'artisan crée un article avec TVA (`articles/application` create)
- [x] `onboarding` · l'artisan complète son profil entreprise (`artisan/application`)

## Enrichissement / edge (P1+ — après les essentiels)

- [x] `commercial` · paiement refusé, carte 4000 0000 0000 9995 → facture reste impayée
- [x] `commercial` · paiement 3D Secure requis, carte 4000 0025 0000 3155
- [x] `commercial` · double paiement empêché (session en attente — `getSessionEnAttente`)
- [x] `commercial` · paiement en ligne refusé si l'artisan n'a pas activé Stripe Connect (`chargesEnabled=false`)
- [x] `commercial` · devis expire automatiquement à échéance (`devis` expirer)

> Retirés (HORS SCOPE — gestion d'abonnement, bloc Paramètres) : changement de plan,
> résiliation/réactivation, dunning off-session. Fichiers `billing/` supprimés + Notion archivé.

## Vague 2 — enrichissement DANS LE SCOPE (Onboarding · Commercial · Clients · Terrain[interv+cal] · Gestion[articles] · paiement)

> Hors scope (ne PAS traiter) : dépenses, comptabilité, stocks, commandes, chantiers, congés, véhicules, notes de frais.

- [x] `clients` · le client dépose un avis, l'artisan le modère (`avis.soumettreAvisPublic` / `changerStatutAvis`)
- [x] `clients` · l'artisan répond à un avis publié (`avis.repondreAvis`)
- [x] `clients` · le client annule ou replanifie un RDV en ligne (`rdv-en-ligne`)
- [x] `commercial` · l'artisan crée un contrat de maintenance récurrent (`contrats-maintenance`)
- [x] `commercial` · l'artisan crée des variantes de devis (`devis-options`)
- [x] `clients` · l'artisan fusionne deux fiches client en doublon (`clients` champsFusionnes)
- [ ] `clients` · l'artisan échange avec un client via le chat (`chat`)
- [ ] `terrain` · l'artisan exporte son calendrier au format iCal (`calendrier.getIcalFeed`)
- [ ] `gestion` · l'artisan met à jour le prix d'un article du catalogue (`articles` update)

## Fait

Les cases cochées ci-dessus. Fichiers dans `gherkin/<module>/*.feature`,
synchronisés Notion via `task notion:gherkin:sync`.
