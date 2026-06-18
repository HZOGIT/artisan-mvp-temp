import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import commonFr from "./common/fr.json";
import clientsFr from "@/modern/features/clients/i18n/fr.json";
import notificationsFr from "@/modern/features/notifications/i18n/fr.json";
import techniciensFr from "@/modern/features/techniciens/i18n/fr.json";
import fournisseursFr from "@/modern/features/fournisseurs/i18n/fr.json";
import articlesFr from "@/modern/features/articles/i18n/fr.json";
import devisFr from "@/modern/features/devis/i18n/fr.json";
import facturesFr from "@/modern/features/factures/i18n/fr.json";
import interventionsFr from "@/modern/features/interventions/i18n/fr.json";
import commandesFr from "@/modern/features/commandes/i18n/fr.json";
import stocksFr from "@/modern/features/stocks/i18n/fr.json";
import depensesFr from "@/modern/features/depenses/i18n/fr.json";
import comptabiliteFr from "@/modern/features/comptabilite/i18n/fr.json";
import paiementFr from "@/modern/features/paiement/i18n/fr.json";
import signatureFr from "@/modern/features/signature/i18n/fr.json";
import portailGestionFr from "@/modern/features/portail-gestion/i18n/fr.json";
import budgetsDepensesFr from "@/modern/features/budgets-depenses/i18n/fr.json";
import reglesDepensesFr from "@/modern/features/regles-depenses/i18n/fr.json";
import historiqueEmailsFr from "@/modern/features/historique-emails/i18n/fr.json";
import supportFr from "@/modern/features/support/i18n/fr.json";
import avisFr from "@/modern/features/avis/i18n/fr.json";
import flotteFr from "@/modern/features/flotte/i18n/fr.json";
import statistiquesDevisFr from "@/modern/features/statistiques-devis/i18n/fr.json";
import modulesFr from "@/modern/features/modules/i18n/fr.json";
import congesFr from "@/modern/features/conges/i18n/fr.json";
import contratsFr from "@/modern/features/contrats/i18n/fr.json";
import relancesDevisFr from "@/modern/features/relances-devis/i18n/fr.json";
import calendrierFr from "@/modern/features/calendrier/i18n/fr.json";
import utilisateursFr from "@/modern/features/utilisateurs/i18n/fr.json";
import devisOptionsFr from "@/modern/features/devis-options/i18n/fr.json";
import parametresFr from "@/modern/features/parametres/i18n/fr.json";
import dashboardFr from "@/modern/features/dashboard/i18n/fr.json";
import abonnementFr from "@/modern/features/abonnement/i18n/fr.json";
import notesFraisFr from "@/modern/features/notes-frais/i18n/fr.json";
import portailFr from "@/modern/features/portail/i18n/fr.json";
import homeFr from "@/modern/features/home/i18n/fr.json";
import chatFr from "@/modern/features/chat/i18n/fr.json";
import badgesFr from "@/modern/features/badges/i18n/fr.json";
import classementFr from "@/modern/features/classement/i18n/fr.json";
import modelesEmailFr from "@/modern/features/modeles-email/i18n/fr.json";
import modelesTransactionnelsFr from "@/modern/features/modeles-email-transactionnels/i18n/fr.json";
import assistantConversationsFr from "@/modern/features/assistant-conversations/i18n/fr.json";
import vehiculesFr from "@/modern/features/vehicules/i18n/fr.json";
import rapportCommandeFr from "@/modern/features/rapport-commande/i18n/fr.json";
import rapportsFr from "@/modern/features/rapports/i18n/fr.json";
import documentationFr from "@/modern/features/documentation/i18n/fr.json";
import maVitrineFr from "@/modern/features/ma-vitrine/i18n/fr.json";
import rdvEnLigneFr from "@/modern/features/rdv-en-ligne/i18n/fr.json";
import alertesPrevisionsFr from "@/modern/features/alertes-previsions/i18n/fr.json";
import previsionsFr from "@/modern/features/previsions/i18n/fr.json";
import performancesFournisseursFr from "@/modern/features/performances-fournisseurs/i18n/fr.json";
import tableauBordDepensesFr from "@/modern/features/tableau-bord-depenses/i18n/fr.json";
import importReleveFr from "@/modern/features/import-releve/i18n/fr.json";
import syncComptableFr from "@/modern/features/tableau-bord-sync-comptable/i18n/fr.json";
import geolocalisationFr from "@/modern/features/geolocalisation/i18n/fr.json";
import planificationFr from "@/modern/features/planification/i18n/fr.json";
import nouvelleDepenseFr from "@/modern/features/nouvelle-depense/i18n/fr.json";
import integrationsComptablesFr from "@/modern/features/integrations-comptables/i18n/fr.json";
import analysesPhotosFr from "@/modern/features/analyses-photos/i18n/fr.json";
import importFr from "@/modern/features/import/i18n/fr.json";
import devisIaFr from "@/modern/features/devis-ia/i18n/fr.json";
import chantiersFr from "@/modern/features/chantiers/i18n/fr.json";
import assistantFr from "@/modern/features/assistant/i18n/fr.json";
import calendrierChantiersFr from "@/modern/features/calendrier-chantiers/i18n/fr.json";
import authFr from "@/modern/features/auth/i18n/fr.json";
import legalFr from "@/modern/features/legal/i18n/fr.json";
import clientFormFr from "@/modern/features/client-form/i18n/fr.json";
import clientsImportFr from "@/modern/features/clients-import/i18n/fr.json";
import interventionsMobileFr from "@/modern/features/interventions-mobile/i18n/fr.json";
import commandeDetailFr from "@/modern/features/commande-detail/i18n/fr.json";
import avisPublicFr from "@/modern/features/avis-public/i18n/fr.json";
import contratDetailFr from "@/modern/features/contrat-detail/i18n/fr.json";
import profilFr from "@/modern/features/profil/i18n/fr.json";
import devisLigneFr from "@/modern/features/devis-ligne/i18n/fr.json";
import devisNouveauFr from "@/modern/features/devis-nouveau/i18n/fr.json";
import devisDetailFr from "@/modern/features/devis-detail/i18n/fr.json";
import factureDetailFr from "@/modern/features/facture-detail/i18n/fr.json";
import commandeFormFr from "@/modern/features/commande-form/i18n/fr.json";
import pageConstructionFr from "@/modern/features/page-construction/i18n/fr.json";
import onboardingFr from "@/modern/features/onboarding/i18n/fr.json";
import notFoundFr from "@/modern/features/not-found/i18n/fr.json";
import vitrinePublicFr from "@/modern/features/vitrine-public/i18n/fr.json";

// i18n du FRONT NEUF (react-i18next). Choix de la refonte : tout libellé utilisateur passe par `t()`.
// Catalogues = **un `fr.json` par module/domaine**, co-localisé avec la feature
// (`features/<feature>/i18n/fr.json`) ; le commun vit dans `shared/i18n/common/fr.json`. On les agrège
// ici en namespaces i18next (1 namespace = 1 module). Locale par défaut `fr`, dont les valeurs sont
// les libellés actuels À L'IDENTIQUE (parité visuelle). `en` s'ajoutera en déposant les `en.json`
// correspondants, sans refonte. Quand une feature est migrée, ajouter son import + son namespace ici.
const resources = {
  fr: {
    common: commonFr,
    clients: clientsFr,
    notifications: notificationsFr,
    techniciens: techniciensFr,
    fournisseurs: fournisseursFr,
    articles: articlesFr,
    devis: devisFr,
    factures: facturesFr,
    interventions: interventionsFr,
    commandes: commandesFr,
    stocks: stocksFr,
    depenses: depensesFr,
    comptabilite: comptabiliteFr,
    paiement: paiementFr,
    signature: signatureFr,
    portailGestion: portailGestionFr,
    budgetsDepenses: budgetsDepensesFr,
    reglesDepenses: reglesDepensesFr,
    historiqueEmails: historiqueEmailsFr,
    support: supportFr,
    avis: avisFr,
    flotte: flotteFr,
    statistiquesDevis: statistiquesDevisFr,
    modules: modulesFr,
    conges: congesFr,
    contrats: contratsFr,
    relancesDevis: relancesDevisFr,
    calendrier: calendrierFr,
    utilisateurs: utilisateursFr,
    devisOptions: devisOptionsFr,
    parametres: parametresFr,
    dashboard: dashboardFr,
    abonnement: abonnementFr,
    notesFrais: notesFraisFr,
    portail: portailFr,
    home: homeFr,
    chat: chatFr,
    badges: badgesFr,
    classement: classementFr,
    modelesEmail: modelesEmailFr,
    modelesTransactionnels: modelesTransactionnelsFr,
    assistantConversations: assistantConversationsFr,
    vehicules: vehiculesFr,
    rapportCommande: rapportCommandeFr,
    rapports: rapportsFr,
    documentation: documentationFr,
    maVitrine: maVitrineFr,
    rdvEnLigne: rdvEnLigneFr,
    alertesPrevisions: alertesPrevisionsFr,
    previsions: previsionsFr,
    performancesFournisseurs: performancesFournisseursFr,
    tableauBordDepenses: tableauBordDepensesFr,
    importReleve: importReleveFr,
    syncComptable: syncComptableFr,
    geolocalisation: geolocalisationFr,
    planification: planificationFr,
    nouvelleDepense: nouvelleDepenseFr,
    integrationsComptables: integrationsComptablesFr,
    analysesPhotos: analysesPhotosFr,
    import: importFr,
    devisIa: devisIaFr,
    chantiers: chantiersFr,
    assistant: assistantFr,
    calendrierChantiers: calendrierChantiersFr,
    auth: authFr,
    legal: legalFr,
    clientForm: clientFormFr,
    clientsImport: clientsImportFr,
    interventionsMobile: interventionsMobileFr,
    commandeDetail: commandeDetailFr,
    avisPublic: avisPublicFr,
    contratDetail: contratDetailFr,
    profil: profilFr,
    devisLigne: devisLigneFr,
    devisNouveau: devisNouveauFr,
    devisDetail: devisDetailFr,
    factureDetail: factureDetailFr,
    commandeForm: commandeFormFr,
    pageConstruction: pageConstructionFr,
    onboarding: onboardingFr,
    notFound: notFoundFr,
    vitrinePublic: vitrinePublicFr,
  },
} as const;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: "fr",
    fallbackLng: "fr",
    defaultNS: "common",
    // React échappe déjà le HTML → pas de double échappement par i18next.
    interpolation: { escapeValue: false },
    returnNull: false,
    // Ressources bundlées (sync) → pas besoin de Suspense ; le désactiver évite que `useTranslation`
    // suspende pendant l'init asynchrone (course → erreur React #310 « more hooks » sur les pages à
    // hooks nombreux + early-returns, ex. ClientDetail).
    react: { useSuspense: false },
  });
}

export default i18n;
