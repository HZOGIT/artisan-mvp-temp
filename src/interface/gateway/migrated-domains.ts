// Registre des domaines effectivement portés sur le nouveau stack (clean-archi) et
// montés dans `createAppRouter`. Sert de garde-fou pour la bascule : un flag ne devrait
// cibler qu'un domaine présent ici (sinon le routage enverrait vers un domaine inexistant
// du nouveau stack). Mis à jour à chaque domaine livré (étape 9/9 du gabarit).
export const MIGRATED_DOMAINS = ["vehicules", "avis", "badges", "techniciens", "notifications", "fournisseurs", "commandesFournisseurs", "stocks", "clients", "interventions", "conges", "notesDeFrais", "chantiers", "depenses", "devis", "factures", "ecritures", "articles", "parametres", "modelesEmail", "modelesDevis", "configRelances", "rdv", "relances", "categoriesDepenses", "contrats", "demandesContact", "budgetsCategories", "reglesCategorisation", "previsions", "artisan", "devisOptions", "activites", "modules", "statistiques", "calendrier", "emails", "search", "geolocalisation", "dashboard", "rapports", "utilisateurs", "comptabilite", "auth", "subscription", "signature", "conseilsIA", "assistant", "chat", "support", "devices", "alertesPrevisions", "importErp", "interventionsMobile"] as const;

export type MigratedDomain = (typeof MIGRATED_DOMAINS)[number];

// Le domaine est-il monté dans le nouveau stack (donc éligible à une bascule de flag) ?
export function isMigratedDomainAvailable(domain: string): domain is MigratedDomain {
  return (MIGRATED_DOMAINS as readonly string[]).includes(domain);
}

// Domaines servis PAR DÉFAUT par le nouveau stack en STAGING (bascule réelle du trafic). Un domaine
// n'entre ici qu'une fois sa **parité de surface vérifiée** : le nouveau stack expose TOUTES les
// procédures que le client appelle pour ce domaine (`trpc.<domaine>.*`) — sinon un appel client
// tomberait sur une procédure inexistante. Vérification : diff des appels client (`client/src`) vs
// procédures montées (cf. `docs/architecture/refonte-parite-backlog.md` §2). Cette liste est la
// **source de vérité** mirroir-ée par l'edge (`functions/_lib/dispatch.mjs` DEFAULT_ENABLED, verrouillé
// par `edge-dispatch.test.ts`). On l'élargit domaine par domaine au fil de la parité (les autres
// domaines migrés restent servis par le legacy tant que leur parité n'est pas complète).
export const STAGING_NEW_STACK_DEFAULT_DOMAINS = [
  "vehicules",
  "notifications",
  "fournisseurs",
  "parametres",
  "modelesEmail",
  "relances",
  "conges", // parité vérifiée : list/getById/create/update/delete/approuver/refuser/annuler + enAttente ⊇ appels client
  "badges", // parité vérifiée : list/create/getBadgesTechnicien/getClassement/calculerClassement + getObjectifsTechnicien ⊇ appels client
  "stocks", // parité vérifiée : CRUD/adjustQuantity/getMouvements/getLowStock + getEntrant/generateAlerts/getRapportCommande ⊇ appels client
  "techniciens", // parité vérifiée : CRUD/getAll/getLinkableUsers + habilitations(get/add/delete) + getStats ⊇ appels client
  "rdv", // parité vérifiée : list(enrichi client)/confirm/refuse/proposeAutreCreneau/getStats/getPendingCount ⊇ appels client (emails best-effort en cours)
  "clients", // parité vérifiée : CRUD/search/getEncours/getEncoursMap + importFromExcel ⊇ appels client
  "factures", // parité vérifiée : list/getById(enrichi lignes+client)/getAvoirsByFacture/getAuditLog/create/update/delete/addLigne/createAvoir/markAsPaid/sendByEmail ⊇ appels client
  "contrats", // parité vérifiée : list/getById/create/update/delete/getAFacturer/getInterventions/createIntervention/updateIntervention/generateFacture ⊇ appels client
  "commandesFournisseurs", // parité vérifiée : CRUD/getLignes/updateStatut/recevoir/setStatutFacturation/getEnRetard/getPerformances/listDevisAcceptes/sendEmail/genererDepuisDevisIA ⊇ appels client
  "devis", // parité vérifiée : CRUD/lignes/getById(enrichi)/transitions/sendByEmail/convertToFacture/duplicate/modeles(4)/relances(2)/getDevisNonSignes/genererLignesIA ⊇ appels client
  "avis", // parité vérifiée : list/getAll/getById/getStats/repondre/moderer/envoyerDemandeParClient + PUBLICS getDemandeInfo/submitAvis (token) ⊇ appels client
  "interventions", // parité vérifiée : CRUD/getMine + équipe(4)/couleurs(2)/assignerTechnicien/getSuggestionsTechniciens(géo) ⊇ appels client
  "chantiers", // parité vérifiée : CRUD + pointages(3)/suivi(4)/phases(4)/interventions-liées(4)/documents(3)/getStatistiques/calculerAvancement ⊇ 16 appels client
  "articles", // parité vérifiée : artisan(get/create/update/delete) + bibliothèque(getBibliotheque/search public + create/update/delete/import admin) + suggererArticlesIA ⊇ 8 appels client
  "previsions", // parité vérifiée : getHistorique/getPrevisions/getComparaison/calculer/getTresoreriePrevisionnelle ⊇ 5 appels client (forecasting)
  "depenses", // parité vérifiée : CRUD + stats/checkDoublons + notes-de-frais(workflow+links) + budgets(set/copier) + categories + regles + indemnitéKm + transactions bancaires(get/ignorer/import/convertir) + FEC export + OCR analyserJustificatif ⊇ 28 appels client
  "artisan", // parité vérifiée : getProfile/updateProfile (profil entreprise du tenant) ⊇ 2 appels client
  "devisOptions", // parité vérifiée : getByDevisId/create/delete/select/convertirEnDevis (variantes de devis) ⊇ 5 appels client
  "activites", // parité vérifiée : list/create/toggleFait/delete (suivi commercial, anti-IDOR FK entité rattachée) ⊇ 4 appels client
  "modules", // parité vérifiée : list/getMine/getOnboardingStatus/toggle/completeOnboarding/skipOnboarding (catalogue global + activation tenant + onboarding/plan) ⊇ 6 appels client
  "statistiques", // parité vérifiée : getDevisStats (agrégats devis du tenant) ⊇ 1 appel client
  "calendrier", // parité vérifiée : getIcalFeed/regenerateIcalFeed (jeton de flux iCal du tenant) ⊇ 2 appels client
  "emails", // parité vérifiée : list (journal d'envois scopé tenant, filtres entité + limite) ⊇ 1 appel client
  "search", // parité vérifiée : global (recherche cross-domaine clients/devis/factures/interventions/fournisseurs) ⊇ 1 appel client
  "geolocalisation", // parité vérifiée : getPositions (techniciens du tenant + dernière position, RGPD lecture seule) ⊇ 1 appel client
  "dashboard", // parité vérifiée : getStats/getRecentActivity/getUpcomingInterventions/getMonthlyCA/getYearlyComparison/getConversionRate/getTopClients/getClientEvolution/getObjectifs/getAlerts (10 agrégats) ⊇ appels client
  "rapports", // parité vérifiée : list/create/delete/toggleFavori/executer (rapports personnalisables, anti-IDOR via RLS) ⊇ 5 appels client
  "utilisateurs", // parité vérifiée : list/invite/updateRole/toggleActif/getPermissions/updatePermissions/resetPermissions (gate utilisateurs.gerer ; tables HORS RLS, scope artisanId explicite) ⊇ 7 appels client
  "comptabilite", // parité vérifiée : getGrandLivre/getBalance/getJournalVentes/getRapportTVA/getDeclarationTVADetail/getFecPreview (gate comptabilite.voir ; FEC opposable Σdébit=Σcrédit, lecture seule) ⊇ 6 appels client
  "auth", // parité vérifiée : me/signin/signup/logout/updateEmail/updatePassword/forgotPassword/resetPassword/deleteAccount (JWT secret legacy, cookie inter-opérable) ⊇ 9 appels client. Smoke e2e OK (signup→cookie→me 200 + provisioning ; signin bon→200 / mauvais→401).
  "subscription", // parité vérifiée : getCurrent/createCheckout/createPortal/cancel/reactivate (StripePort, clés+price IDs legacy ; subscriptions HORS RLS) ⊇ 5 appels client. Smoke e2e OK (createCheckout test→URL cs_test_). Webhook /api/stripe/webhook reste legacy (§4, sync la table lue par le new-stack).
  "signature", // parité vérifiée : createSignatureLink/getSignatureByDevis (protégés) + getDevisForSignature/selectDevisOption/signDevis/refuseDevis (PUBLICS par token) ⊇ 6 appels client. signatures_devis HORS RLS (anti-IDOR via le devis parent) ; policy RLS public-token sur `devis` (résolution du devis par le token de signature). Immutabilité post-signature garantie par la garde SQL statut='en_attente' ; IP probante cf-connecting-ip. e2e token-signing OK (getDevisForSignature 200 → signDevis → devis accepte → 2ᵉ signature 400). Procs SMS legacy non appelées par le client (hors parité).
  "conseilsIA", // parité vérifiée : conseilsIA (procédure RACINE, 1 appel client `trpc.conseilsIA`). 1ère slice du chantier assistant/IA. Lecture seule NON persistée, request/response (PAS de SSE) ; LlmPort Gemini + rate-limit IA + stats best-effort scopées tenant ; dégradation silencieuse (rate-limit/erreur provider/JSON KO → {conseils:[]}).
  "assistant", // parité vérifiée : getThreads/getMessages (lectures historique, anti-IDOR via thread parent) + suggestRelances/generateDevis/analyseRentabilite/predictionTresorerie (générateurs IA) ⊇ 6 appels client. Tous request/response (PAS de SSE). LlmPort Gemini + rate-limit IA 30/h ; ai_threads RLS, ai_messages scopé via thread. chat.*/ai.chat = surfaces distinctes (à venir).
  "chat", // parité vérifiée : getConversations/getMessages/sendMessage/startConversation/getUnreadCount/archive/close/reopenConversation ⊇ 7 appels client. Messagerie SUPPORT artisan↔client (request/response, PAS de SSE). conversations RLS, messages scopés via la conversation parente (ownership→FORBIDDEN). Email best-effort au client (rate-limit anti-spam 20/15min + lien portail).
  "support", // parité vérifiée : contact (1 appel client `trpc.support.contact`). Formulaire de contact → email à la boîte support. SANS table : EmailPort + anti-flood (rate-limiter 5/15min par userId, parité legacy) ; corps HTML échappé ; TOO_MANY_REQUESTS si limite atteinte.
  "devices", // parité vérifiée : list/revoke/revokeAll (3 appels client `trpc.devices.*`). Appareils/sessions de l'utilisateur. Table `devices` HORS RLS → scope EXPLICITE par userId (anti-IDOR). revokeAll dérive l'empreinte de l'appareil courant du User-Agent (parité legacy generateFingerprint).
  "alertesPrevisions", // parité vérifiée : getConfig/saveConfig/getHistorique/verifierEtEnvoyer (4 appels client). Alertes du prévisionnel de trésorerie. Tables config/historique SOUS RLS (artisanId via withTenant). verifierEtEnvoyer compare CA réalisé (factures payées du mois) vs prévisionnel (previsions_ca) ; au-delà d'un seuil → enregistre 1 alerte/mois/type (anti-spam) ; envoi réel email/sms = scheduler externe.
  "importErp", // parité vérifiée : importClients/importDevis/importFactures (3 appels client). Import de reprise de données (lignes CSV déjà parsées + mapping). Crée des clients/devis/factures « légers » (TTC brut, sans lignes ni écritures — parité legacy). Tables SOUS RLS (withTenant) ; numérotation devis/facture = générateurs serveur migrés ; dedup email (clients) + lookup client par nom (devis/factures).
  "interventionsMobile", // parité vérifiée : getTodayInterventions/startIntervention/endIntervention (3 appels client). App mobile technicien. Compose interventions/clients/techniciens migrés + repo `interventions_mobile` (SOUS RLS). RGPD : technicien lié → ne voit que SES interventions. start/end : ownership tenant (404 anti-IDOR sans oracle), statut en_cours/terminee, upsert heures+géoloc+signature. (Autres procs du routeur legacy = chat dupliqué, non appelé → couvert par le domaine `chat`.)
] as const;
