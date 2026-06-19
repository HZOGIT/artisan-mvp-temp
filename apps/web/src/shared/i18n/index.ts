import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import commonFr from "./common/fr.json";
import clientsFr from "@/features/clients/i18n/fr.json";
import notificationsFr from "@/features/notifications/i18n/fr.json";
import techniciensFr from "@/features/techniciens/i18n/fr.json";
import fournisseursFr from "@/features/fournisseurs/i18n/fr.json";
import articlesFr from "@/features/articles/i18n/fr.json";
import devisFr from "@/features/devis/i18n/fr.json";
import facturesFr from "@/features/factures/i18n/fr.json";
import interventionsFr from "@/features/interventions/i18n/fr.json";
import commandesFr from "@/features/commandes/i18n/fr.json";
import stocksFr from "@/features/stocks/i18n/fr.json";
import depensesFr from "@/features/depenses/i18n/fr.json";
import comptabiliteFr from "@/features/comptabilite/i18n/fr.json";
import paiementFr from "@/features/paiement/i18n/fr.json";
import signatureFr from "@/features/signature/i18n/fr.json";
import portailGestionFr from "@/features/portail-gestion/i18n/fr.json";
import budgetsDepensesFr from "@/features/budgets-depenses/i18n/fr.json";
import reglesDepensesFr from "@/features/regles-depenses/i18n/fr.json";
import historiqueEmailsFr from "@/features/historique-emails/i18n/fr.json";
import supportFr from "@/features/support/i18n/fr.json";
import avisFr from "@/features/avis/i18n/fr.json";
import flotteFr from "@/features/flotte/i18n/fr.json";
import statistiquesDevisFr from "@/features/statistiques-devis/i18n/fr.json";
import modulesFr from "@/features/modules/i18n/fr.json";
import congesFr from "@/features/conges/i18n/fr.json";
import contratsFr from "@/features/contrats/i18n/fr.json";
import relancesDevisFr from "@/features/relances-devis/i18n/fr.json";
import calendrierFr from "@/features/calendrier/i18n/fr.json";
import utilisateursFr from "@/features/utilisateurs/i18n/fr.json";
import devisOptionsFr from "@/features/devis-options/i18n/fr.json";
import parametresFr from "@/features/parametres/i18n/fr.json";
import dashboardFr from "@/features/dashboard/i18n/fr.json";
import abonnementFr from "@/features/abonnement/i18n/fr.json";
import notesFraisFr from "@/features/notes-frais/i18n/fr.json";
import portailFr from "@/features/portail/i18n/fr.json";
import homeFr from "@/features/home/i18n/fr.json";
import chatFr from "@/features/chat/i18n/fr.json";
import badgesFr from "@/features/badges/i18n/fr.json";
import classementFr from "@/features/classement/i18n/fr.json";
import modelesEmailFr from "@/features/modeles-email/i18n/fr.json";
import modelesTransactionnelsFr from "@/features/modeles-email-transactionnels/i18n/fr.json";
import assistantConversationsFr from "@/features/assistant-conversations/i18n/fr.json";
import vehiculesFr from "@/features/vehicules/i18n/fr.json";
import rapportCommandeFr from "@/features/rapport-commande/i18n/fr.json";
import rapportsFr from "@/features/rapports/i18n/fr.json";
import documentationFr from "@/features/documentation/i18n/fr.json";
import maVitrineFr from "@/features/ma-vitrine/i18n/fr.json";
import rdvEnLigneFr from "@/features/rdv-en-ligne/i18n/fr.json";
import alertesPrevisionsFr from "@/features/alertes-previsions/i18n/fr.json";
import previsionsFr from "@/features/previsions/i18n/fr.json";
import performancesFournisseursFr from "@/features/performances-fournisseurs/i18n/fr.json";
import tableauBordDepensesFr from "@/features/tableau-bord-depenses/i18n/fr.json";
import importReleveFr from "@/features/import-releve/i18n/fr.json";
import syncComptableFr from "@/features/tableau-bord-sync-comptable/i18n/fr.json";
import geolocalisationFr from "@/features/geolocalisation/i18n/fr.json";
import planificationFr from "@/features/planification/i18n/fr.json";
import nouvelleDepenseFr from "@/features/nouvelle-depense/i18n/fr.json";
import integrationsComptablesFr from "@/features/integrations-comptables/i18n/fr.json";
import analysesPhotosFr from "@/features/analyses-photos/i18n/fr.json";
import importFr from "@/features/import/i18n/fr.json";
import devisIaFr from "@/features/devis-ia/i18n/fr.json";
import chantiersFr from "@/features/chantiers/i18n/fr.json";
import assistantFr from "@/features/assistant/i18n/fr.json";
import calendrierChantiersFr from "@/features/calendrier-chantiers/i18n/fr.json";
import authFr from "@/features/auth/i18n/fr.json";
import legalFr from "@/features/legal/i18n/fr.json";
import clientFormFr from "@/features/client-form/i18n/fr.json";
import clientsImportFr from "@/features/clients-import/i18n/fr.json";
import interventionsMobileFr from "@/features/interventions-mobile/i18n/fr.json";
import commandeDetailFr from "@/features/commande-detail/i18n/fr.json";
import avisPublicFr from "@/features/avis-public/i18n/fr.json";
import contratDetailFr from "@/features/contrat-detail/i18n/fr.json";
import profilFr from "@/features/profil/i18n/fr.json";
import devisLigneFr from "@/features/devis-ligne/i18n/fr.json";
import devisNouveauFr from "@/features/devis-nouveau/i18n/fr.json";
import devisDetailFr from "@/features/devis-detail/i18n/fr.json";
import factureDetailFr from "@/features/facture-detail/i18n/fr.json";
import commandeFormFr from "@/features/commande-form/i18n/fr.json";
import pageConstructionFr from "@/features/page-construction/i18n/fr.json";
import onboardingFr from "@/features/onboarding/i18n/fr.json";
import notFoundFr from "@/features/not-found/i18n/fr.json";
import shellFr from "@/shell/i18n/fr.json";
import vitrinePublicFr from "@/features/vitrine-public/i18n/fr.json";

/*
 * i18n du FRONT NEUF (react-i18next). Choix de la refonte : tout libellé utilisateur passe par `t()`.
 * Catalogues = **un `fr.json` par module/domaine**, co-localisé avec la feature
 * (`features/<feature>/i18n/fr.json`) ; le commun vit dans `shared/i18n/common/fr.json`. On les agrège
 * ici en namespaces i18next (1 namespace = 1 module). Locale par défaut `fr`, dont les valeurs sont
 * les libellés actuels À L'IDENTIQUE (parité visuelle). `en` s'ajoutera en déposant les `en.json`
 * correspondants, sans refonte. Quand une feature est migrée, ajouter son import + son namespace ici.
 */
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
    shell: shellFr,
    vitrinePublic: vitrinePublicFr,
  },
} as const;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: "fr",
    fallbackLng: "fr",
    defaultNS: "common",
    /** React échappe déjà le HTML → pas de double échappement par i18next. */
    interpolation: { escapeValue: false },
    returnNull: false,
    /*
     * Ressources bundlées (sync) → pas besoin de Suspense ; le désactiver évite que `useTranslation`
     * suspende pendant l'init asynchrone (course → erreur React #310 « more hooks » sur les pages à
     * hooks nombreux + early-returns, ex. ClientDetail).
     */
    react: { useSuspense: false },
  });
}

export default i18n;
