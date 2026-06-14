# Refonte — backlog de parité & dépréciation legacy

> Généré par `scripts/refonte/parite-audit.ts`. Pour CHAQUE domaine : statut de
> correspondance du nom (la clé tRPC appelée par le client) + procédures servies par le
> nouveau stack. La parité fine des procédures (legacy vs new) est un diff manuel par
> domaine (cf. `server/routers.ts`).

## 1. Domaines migrés — correspondance de nom

| Domaine (new stack) | Clé client | Statut | # procédures new |
|---|---|---|---|
| vehicules | vehicules | ✅ name-match | 15 |
| avis | avis | ✅ name-match | 8 |
| badges | badges | ✅ name-match | 9 |
| techniciens | techniciens | ✅ name-match | 11 |
| notifications | notifications | ✅ name-match | 7 |
| fournisseurs | fournisseurs | ✅ name-match | 9 |
| commandesFournisseurs | commandesFournisseurs | ✅ name-match | 10 |
| stocks | stocks | ✅ name-match | 9 |
| clients | clients | ✅ name-match | 8 |
| interventions | interventions | ✅ name-match | 6 |
| conges | conges | ✅ name-match | 8 |
| notesDeFrais | comptabilite.notesDeFrais | ⚠️ sous-routeur de `comptabilite` | 9 |
| chantiers | chantiers | ✅ name-match | 5 |
| depenses | depenses | ✅ name-match | 5 |
| devis | devis | ✅ name-match | 13 |
| factures | factures | ✅ name-match | 14 |
| ecritures | comptabilite.ecritures | ⚠️ sous-routeur de `comptabilite` | 5 |
| articles | articles | ✅ name-match | 6 |
| parametres | parametres | ✅ name-match | 2 |
| modelesEmail | modelesEmail | ✅ name-match | 6 |
| modelesDevis | modelesDevis | ⚠️ pas de top-level legacy | 5 |
| configRelances | configRelances | ⚠️ pas de top-level legacy | 2 |
| rdv | rdv | ✅ name-match | 8 |
| relancesDevis | relances | ⚠️ renommer → `relances` | 5 |
| categoriesDepenses | categoriesDepenses | ⚠️ pas de top-level legacy | 5 |
| contrats | contrats | ✅ name-match | 9 |
| demandesContact | demandesContact | ⚠️ pas de top-level legacy | 9 |
| budgetsCategories | budgetsCategories | ⚠️ pas de top-level legacy | 6 |
| reglesCategorisation | reglesCategorisation | ⚠️ pas de top-level legacy | 5 |
| previsions | previsions | ✅ name-match | 6 |

**Name-match (flippables après parité)** : 21 — vehicules, avis, badges, techniciens, notifications, fournisseurs, commandesFournisseurs, stocks, clients, interventions, conges, chantiers, depenses, devis, factures, articles, parametres, modelesEmail, rdv, contrats, previsions

**À réconcilier (renommage / sous-routeur)** : 9 — notesDeFrais, ecritures, modelesDevis, configRelances, relancesDevis, categoriesDepenses, demandesContact, budgetsCategories, reglesCategorisation

## 2. Procédures servies par le nouveau stack (par domaine)

- **vehicules** (15) : `addAssurance`, `addEntretien`, `addKilometrage`, `create`, `delete`, `getAssurances`, `getAssurancesExpirant`, `getById`, `getEntretiens`, `getEntretiensAVenir`, `getHistoriqueKilometrage`, `getStatistiquesFlotte`, `list`, `update`, `updateKilometrage`
- **avis** (8) : `envoyerDemande`, `envoyerDemandeParClient`, `getAll`, `getById`, `getStats`, `list`, `moderer`, `repondre`
- **badges** (9) : `attribuerBadge`, `calculerClassement`, `create`, `delete`, `getBadgesTechnicien`, `getClassement`, `list`, `update`, `verifierBadges`
- **techniciens** (11) : `create`, `delete`, `enregistrerPosition`, `getAll`, `getById`, `getDernierePosition`, `getDisponibilites`, `getLinkableUsers`, `list`, `setDisponibilite`, `update`
- **notifications** (7) : `archive`, `delete`, `generateOverdueReminders`, `getUnreadCount`, `list`, `markAllAsRead`, `markAsRead`
- **fournisseurs** (9) : `associateArticle`, `create`, `delete`, `dissociateArticle`, `getArticleFournisseurs`, `getById`, `getFournisseurArticles`, `list`, `update`
- **commandesFournisseurs** (10) : `create`, `delete`, `getById`, `getEnRetard`, `getLignes`, `list`, `recevoir`, `setStatutFacturation`, `update`, `updateStatut`
- **stocks** (9) : `adjustQuantity`, `create`, `delete`, `getById`, `getLowStock`, `getMouvements`, `getStocksEnRupture`, `list`, `update`
- **clients** (8) : `create`, `delete`, `getById`, `getEncours`, `getEncoursMap`, `list`, `search`, `update`
- **interventions** (6) : `create`, `delete`, `getById`, `getMine`, `list`, `update`
- **conges** (8) : `annuler`, `approuver`, `create`, `delete`, `getById`, `list`, `refuser`, `update`
- **notesDeFrais** (9) : `approuver`, `create`, `delete`, `getById`, `list`, `payer`, `rejeter`, `soumettre`, `update`
- **chantiers** (5) : `create`, `delete`, `getById`, `list`, `update`
- **depenses** (5) : `create`, `delete`, `getById`, `list`, `update`
- **devis** (13) : `accepter`, `addLigne`, `create`, `delete`, `deleteLigne`, `envoyer`, `expirer`, `getById`, `getLignes`, `list`, `refuser`, `update`, `updateLigne`
- **factures** (14) : `addLigne`, `convertirDepuisDevis`, `create`, `creerAvoir`, `delete`, `deleteLigne`, `enregistrerPaiement`, `envoyer`, `getById`, `getLignes`, `list`, `marquerEnRetard`, `update`, `updateLigne`
- **ecritures** (5) : `balance`, `byFacture`, `exportFec`, `grandLivre`, `list`
- **articles** (6) : `byCategorie`, `create`, `delete`, `getById`, `list`, `update`
- **parametres** (2) : `get`, `update`
- **modelesEmail** (6) : `byType`, `create`, `delete`, `getById`, `list`, `update`
- **modelesDevis** (5) : `create`, `delete`, `getById`, `list`, `update`
- **configRelances** (2) : `get`, `update`
- **rdv** (8) : `annuler`, `confirmer`, `create`, `delete`, `getById`, `list`, `refuser`, `update`
- **relancesDevis** (5) : `byDevis`, `create`, `delete`, `getById`, `list`
- **categoriesDepenses** (5) : `create`, `delete`, `getById`, `list`, `update`
- **contrats** (9) : `annuler`, `create`, `delete`, `getById`, `list`, `reactiver`, `suspendre`, `terminer`, `update`
- **demandesContact** (9) : `byStatut`, `convertir`, `create`, `delete`, `getById`, `list`, `marquerContacte`, `marquerPerdu`, `update`
- **budgetsCategories** (6) : `byMois`, `create`, `delete`, `getById`, `list`, `update`
- **reglesCategorisation** (5) : `create`, `delete`, `getById`, `list`, `update`
- **previsions** (6) : `byAnnee`, `create`, `delete`, `getById`, `list`, `update`

## 3. Routeurs tRPC legacy SANS équivalent clean-archi (à migrer)

29 routeurs → 100% legacy tant que non migrés :

`emails`, `activites`, `search`, `subscription`, `devices`, `support`, `modules`, `importErp`, `auth`, `artisan`, `dashboard`, `signature`, `clientPortal`, `interventionsMobile`, `chat`, `geolocalisation`, `comptabilite`, `devisOptions`, `rapports`, `notificationsPush`, `alertesPrevisions`, `integrationsComptables`, `devisIA`, `statistiques`, `portail`, `calendrier`, `assistant`, `vitrine`, `utilisateurs`

> + toute la surface HORS tRPC : auth (login/signup/reset), webhooks Stripe, uploads,
> PDF/iCal publics, vitrine/portail publics (tokens). À migrer en routes Fastify dédiées.
