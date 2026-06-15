# Refonte — backlog de parité & dépréciation legacy

> ✅ **EXTINCTION DU LEGACY ACHEVÉE.** `server/` (legacy Express) a été supprimé ; le stack
> est unique (Fastify + tRPC 11 + Drizzle pg + RLS). `LEGACY_ROUTERS` ci-dessous est un
> **snapshot FIGÉ** de l'ancien `server/routers.ts` (conservé pour la traçabilité de l'audit,
> il n'est plus lu en direct). Lecture des colonnes : « ✅ name-match » = la clé tRPC du new
> stack == celle appelée par le client ; « ⚠️ sous-routeur de … » / « ⚠️ pas de top-level
> legacy » = **bénin** (sous-ressource montée sous son parent, ou domaine new-stack sans
> équivalent legacy top-level) — PAS un gap. La § 3 (« legacy-only ») ne liste plus que des
> routeurs MORTS (0 appel client). **→ zéro gap de parité réel.**

> Généré par `scripts/refonte/parite-audit.ts`. Pour CHAQUE domaine : statut de
> correspondance du nom (la clé tRPC appelée par le client) + procédures servies par le
> nouveau stack.

## 1. Domaines migrés — correspondance de nom

| Domaine (new stack) | Clé client | Statut | # procédures new |
|---|---|---|---|
| vehicules | vehicules | ✅ name-match | 15 |
| avis | avis | ✅ name-match | 10 |
| badges | badges | ✅ name-match | 10 |
| techniciens | techniciens | ✅ name-match | 15 |
| notifications | notifications | ✅ name-match | 7 |
| fournisseurs | fournisseurs | ✅ name-match | 9 |
| commandesFournisseurs | commandesFournisseurs | ✅ name-match | 14 |
| stocks | stocks | ✅ name-match | 12 |
| clients | clients | ✅ name-match | 9 |
| interventions | interventions | ✅ name-match | 14 |
| conges | conges | ✅ name-match | 9 |
| notesDeFrais | comptabilite.notesDeFrais | ⚠️ sous-routeur de `comptabilite` | 9 |
| chantiers | chantiers | ✅ name-match | 25 |
| depenses | depenses | ✅ name-match | 33 |
| devis | devis | ✅ name-match | 24 |
| factures | factures | ✅ name-match | 19 |
| ecritures | comptabilite.ecritures | ⚠️ sous-routeur de `comptabilite` | 5 |
| articles | articles | ✅ name-match | 17 |
| parametres | parametres | ✅ name-match | 2 |
| modelesEmail | modelesEmail | ✅ name-match | 6 |
| modelesDevis | modelesDevis | ⚠️ pas de top-level legacy | 5 |
| configRelances | configRelances | ⚠️ pas de top-level legacy | 2 |
| rdv | rdv | ✅ name-match | 13 |
| relances | relances | ✅ name-match | 5 |
| categoriesDepenses | categoriesDepenses | ⚠️ pas de top-level legacy | 5 |
| contrats | contrats | ✅ name-match | 14 |
| demandesContact | demandesContact | ⚠️ pas de top-level legacy | 9 |
| budgetsCategories | budgetsCategories | ⚠️ pas de top-level legacy | 6 |
| reglesCategorisation | reglesCategorisation | ⚠️ pas de top-level legacy | 5 |
| previsions | previsions | ✅ name-match | 11 |
| artisan | artisan | ✅ name-match | 2 |
| devisOptions | devisOptions | ✅ name-match | 5 |
| activites | activites | ✅ name-match | 4 |
| modules | modules | ✅ name-match | 6 |
| statistiques | statistiques | ✅ name-match | 1 |
| calendrier | calendrier | ✅ name-match | 2 |
| emails | emails | ✅ name-match | 1 |
| search | search | ✅ name-match | 1 |
| geolocalisation | geolocalisation | ✅ name-match | 1 |
| dashboard | dashboard | ✅ name-match | 10 |
| rapports | rapports | ✅ name-match | 5 |
| utilisateurs | utilisateurs | ✅ name-match | 7 |
| comptabilite | comptabilite | ✅ name-match | 6 |
| auth | auth | ✅ name-match | 9 |
| subscription | subscription | ✅ name-match | 5 |
| signature | signature | ✅ name-match | 6 |
| conseilsIA | conseilsIA | ⚠️ pas de top-level legacy | 1 |
| assistant | assistant | ✅ name-match | 6 |
| chat | chat | ✅ name-match | 8 |
| support | support | ✅ name-match | 1 |
| devices | devices | ✅ name-match | 3 |
| alertesPrevisions | alertesPrevisions | ✅ name-match | 4 |
| importErp | importErp | ✅ name-match | 3 |
| interventionsMobile | interventionsMobile | ✅ name-match | 3 |
| vitrine | vitrine | ✅ name-match | 5 |
| clientPortal | clientPortal | ✅ name-match | 19 |
| integrationsComptables | integrationsComptables | ✅ name-match | 10 |
| devisIA | devisIA | ✅ name-match | 7 |

**Name-match (flippables après parité)** : 49 — vehicules, avis, badges, techniciens, notifications, fournisseurs, commandesFournisseurs, stocks, clients, interventions, conges, chantiers, depenses, devis, factures, articles, parametres, modelesEmail, rdv, relances, contrats, previsions, artisan, devisOptions, activites, modules, statistiques, calendrier, emails, search, geolocalisation, dashboard, rapports, utilisateurs, comptabilite, auth, subscription, signature, assistant, chat, support, devices, alertesPrevisions, importErp, interventionsMobile, vitrine, clientPortal, integrationsComptables, devisIA

**À réconcilier (renommage / sous-routeur)** : 9 — notesDeFrais, ecritures, modelesDevis, configRelances, categoriesDepenses, demandesContact, budgetsCategories, reglesCategorisation, conseilsIA

## 2. Procédures servies par le nouveau stack (par domaine)

- **vehicules** (15) : `addAssurance`, `addEntretien`, `addKilometrage`, `create`, `delete`, `getAssurances`, `getAssurancesExpirant`, `getById`, `getEntretiens`, `getEntretiensAVenir`, `getHistoriqueKilometrage`, `getStatistiquesFlotte`, `list`, `update`, `updateKilometrage`
- **avis** (10) : `envoyerDemande`, `envoyerDemandeParClient`, `getAll`, `getById`, `getDemandeInfo`, `getStats`, `list`, `moderer`, `repondre`, `submitAvis`
- **badges** (10) : `attribuerBadge`, `calculerClassement`, `create`, `delete`, `getBadgesTechnicien`, `getClassement`, `getObjectifsTechnicien`, `list`, `update`, `verifierBadges`
- **techniciens** (15) : `addHabilitation`, `create`, `delete`, `deleteHabilitation`, `enregistrerPosition`, `getAll`, `getById`, `getDernierePosition`, `getDisponibilites`, `getHabilitations`, `getLinkableUsers`, `getStats`, `list`, `setDisponibilite`, `update`
- **notifications** (7) : `archive`, `delete`, `generateOverdueReminders`, `getUnreadCount`, `list`, `markAllAsRead`, `markAsRead`
- **fournisseurs** (9) : `associateArticle`, `create`, `delete`, `dissociateArticle`, `getArticleFournisseurs`, `getById`, `getFournisseurArticles`, `list`, `update`
- **commandesFournisseurs** (14) : `create`, `delete`, `genererDepuisDevisIA`, `getById`, `getEnRetard`, `getLignes`, `getPerformances`, `list`, `listDevisAcceptes`, `recevoir`, `sendEmail`, `setStatutFacturation`, `update`, `updateStatut`
- **stocks** (12) : `adjustQuantity`, `create`, `delete`, `generateAlerts`, `getById`, `getEntrant`, `getLowStock`, `getMouvements`, `getRapportCommande`, `getStocksEnRupture`, `list`, `update`
- **clients** (9) : `create`, `delete`, `getById`, `getEncours`, `getEncoursMap`, `importFromExcel`, `list`, `search`, `update`
- **interventions** (14) : `ajouterMembreEquipe`, `assignerTechnicien`, `create`, `delete`, `getById`, `getCouleursCalendrier`, `getEquipe`, `getEquipesByArtisan`, `getMine`, `getSuggestionsTechniciens`, `list`, `retirerMembreEquipe`, `setCouleurIntervention`, `update`
- **conges** (9) : `annuler`, `approuver`, `create`, `delete`, `enAttente`, `getById`, `list`, `refuser`, `update`
- **notesDeFrais** (9) : `approuver`, `create`, `delete`, `getById`, `list`, `payer`, `rejeter`, `soumettre`, `update`
- **chantiers** (25) : `addDocument`, `addPointage`, `associerIntervention`, `calculerAvancement`, `create`, `createPhase`, `createSuivi`, `delete`, `deleteDocument`, `deletePhase`, `deletePointage`, `deleteSuivi`, `dissocierIntervention`, `getAllInterventionsChantier`, `getById`, `getDocuments`, `getInterventions`, `getPhases`, `getPointages`, `getStatistiques`, `getSuivi`, `list`, `update`, `updatePhase`, `updateSuivi`
- **depenses** (33) : `addDepenseToNoteFrais`, `analyserJustificatif`, `approuverNoteFrais`, `checkDoublons`, `convertirTransaction`, `copierBudgetsMois`, `create`, `createCategorie`, `createNoteFrais`, `createRegle`, `creerIndemniteKm`, `delete`, `deleteCategorie`, `deleteRegle`, `exportFecAchats`, `getBudgets`, `getById`, `getCategories`, `getNoteFraisById`, `getRegles`, `getTransactionsBancaires`, `ignorerTransaction`, `importReleve`, `list`, `listNotesFrais`, `payerNoteFrais`, `rejeterNoteFrais`, `removeDepenseFromNoteFrais`, `setBudget`, `soumettreNoteFrais`, `stats`, `update`, `updateCategorie`
- **devis** (24) : `accepter`, `addLigne`, `addLigneToModele`, `convertToFacture`, `create`, `createModele`, `delete`, `deleteLigne`, `duplicate`, `envoyer`, `envoyerRelance`, `envoyerRelancesAutomatiques`, `expirer`, `genererLignesIA`, `getById`, `getDevisNonSignes`, `getLignes`, `getModeleWithLignes`, `getModeles`, `list`, `refuser`, `sendByEmail`, `update`, `updateLigne`
- **factures** (19) : `addLigne`, `convertirDepuisDevis`, `create`, `createAvoir`, `creerAvoir`, `delete`, `deleteLigne`, `enregistrerPaiement`, `envoyer`, `getAuditLog`, `getAvoirsByFacture`, `getById`, `getLignes`, `list`, `markAsPaid`, `marquerEnRetard`, `sendByEmail`, `update`, `updateLigne`
- **ecritures** (5) : `balance`, `byFacture`, `exportFec`, `grandLivre`, `list`
- **articles** (17) : `byCategorie`, `create`, `createArtisanArticle`, `createBibliothequeArticle`, `delete`, `deleteArtisanArticle`, `deleteBibliothequeArticle`, `getArtisanArticles`, `getBibliotheque`, `getById`, `importBibliothequeArticles`, `list`, `search`, `suggererArticlesIA`, `update`, `updateArtisanArticle`, `updateBibliothequeArticle`
- **parametres** (2) : `get`, `update`
- **modelesEmail** (6) : `byType`, `create`, `delete`, `getById`, `list`, `update`
- **modelesDevis** (5) : `create`, `delete`, `getById`, `list`, `update`
- **configRelances** (2) : `get`, `update`
- **rdv** (13) : `annuler`, `confirm`, `confirmer`, `create`, `delete`, `getById`, `getPendingCount`, `getStats`, `list`, `proposeAutreCreneau`, `refuse`, `refuser`, `update`
- **relances** (5) : `byDevis`, `create`, `delete`, `getById`, `list`
- **categoriesDepenses** (5) : `create`, `delete`, `getById`, `list`, `update`
- **contrats** (14) : `annuler`, `create`, `createIntervention`, `delete`, `generateFacture`, `getAFacturer`, `getById`, `getInterventions`, `list`, `reactiver`, `suspendre`, `terminer`, `update`, `updateIntervention`
- **demandesContact** (9) : `byStatut`, `convertir`, `create`, `delete`, `getById`, `list`, `marquerContacte`, `marquerPerdu`, `update`
- **budgetsCategories** (6) : `byMois`, `create`, `delete`, `getById`, `list`, `update`
- **reglesCategorisation** (5) : `create`, `delete`, `getById`, `list`, `update`
- **previsions** (11) : `byAnnee`, `calculer`, `create`, `delete`, `getById`, `getComparaison`, `getHistorique`, `getPrevisions`, `getTresoreriePrevisionnelle`, `list`, `update`
- **artisan** (2) : `getProfile`, `updateProfile`
- **devisOptions** (5) : `convertirEnDevis`, `create`, `delete`, `getByDevisId`, `select`
- **activites** (4) : `create`, `delete`, `list`, `toggleFait`
- **modules** (6) : `completeOnboarding`, `getMine`, `getOnboardingStatus`, `list`, `skipOnboarding`, `toggle`
- **statistiques** (1) : `getDevisStats`
- **calendrier** (2) : `getIcalFeed`, `regenerateIcalFeed`
- **emails** (1) : `list`
- **search** (1) : `global`
- **geolocalisation** (1) : `getPositions`
- **dashboard** (10) : `getAlerts`, `getClientEvolution`, `getConversionRate`, `getMonthlyCA`, `getObjectifs`, `getRecentActivity`, `getStats`, `getTopClients`, `getUpcomingInterventions`, `getYearlyComparison`
- **rapports** (5) : `create`, `delete`, `executer`, `list`, `toggleFavori`
- **utilisateurs** (7) : `getPermissions`, `invite`, `list`, `resetPermissions`, `toggleActif`, `updatePermissions`, `updateRole`
- **comptabilite** (6) : `getBalance`, `getDeclarationTVADetail`, `getFecPreview`, `getGrandLivre`, `getJournalVentes`, `getRapportTVA`
- **auth** (9) : `deleteAccount`, `forgotPassword`, `logout`, `me`, `resetPassword`, `signin`, `signup`, `updateEmail`, `updatePassword`
- **subscription** (5) : `cancel`, `createCheckout`, `createPortal`, `getCurrent`, `reactivate`
- **signature** (6) : `createSignatureLink`, `getDevisForSignature`, `getSignatureByDevis`, `refuseDevis`, `selectDevisOption`, `signDevis`
- **conseilsIA** (1) : `(procédure)`
- **assistant** (6) : `analyseRentabilite`, `generateDevis`, `getMessages`, `getThreads`, `predictionTresorerie`, `suggestRelances`
- **chat** (8) : `archiveConversation`, `closeConversation`, `getConversations`, `getMessages`, `getUnreadCount`, `reopenConversation`, `sendMessage`, `startConversation`
- **support** (1) : `contact`
- **devices** (3) : `list`, `revoke`, `revokeAll`
- **alertesPrevisions** (4) : `getConfig`, `getHistorique`, `saveConfig`, `verifierEtEnvoyer`
- **importErp** (3) : `importClients`, `importDevis`, `importFactures`
- **interventionsMobile** (3) : `endIntervention`, `getTodayInterventions`, `startIntervention`
- **vitrine** (5) : `convertirDemandeEnClient`, `getBySlug`, `getDemandesContact`, `submitContact`, `updateDemandeContactStatut`
- **clientPortal** (19) : `deactivate`, `demanderModification`, `demanderRdv`, `generateAccess`, `getClientInfo`, `getContrats`, `getConversationMessages`, `getConversations`, `getCreneauxDisponibles`, `getDevis`, `getFactures`, `getInterventions`, `getMesRdv`, `getStatus`, `getSuiviChantiers`, `markClientMessagesAsRead`, `sendClientMessage`, `soumettreDemandeIA`, `verifyAccess`
- **integrationsComptables** (10) : `genererExport`, `getConfig`, `getExports`, `getPendingItems`, `getSyncLogs`, `getSyncStatus`, `lancerSync`, `retrySync`, `saveConfig`, `saveSyncConfig`
- **devisIA** (7) : `addPhoto`, `analyserPhotos`, `createAnalyse`, `genererDevis`, `getById`, `list`, `updateSuggestion`

## 3. Routeurs tRPC legacy SANS équivalent clean-archi

2 routeurs présents dans le snapshot legacy mais pas dans le new-stack —
**MORTS (0 appel client, vérifié), droppables** ; le legacy étant éteint, ils ne sont servis
nulle part (`portail` est superseded par `clientPortal` migré ; push notifications non utilisé) :

`notificationsPush`, `portail`

> Surface HORS tRPC (auth login/signup/reset, webhooks Stripe, uploads, PDF/iCal publics,
> vitrine/portail publics par token) : **portée en routes Fastify dédiées** (cf. journal).
