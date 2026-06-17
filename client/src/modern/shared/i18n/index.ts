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
