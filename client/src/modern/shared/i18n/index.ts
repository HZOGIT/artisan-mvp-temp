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
