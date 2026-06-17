import type { RouterInputs, RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `modeles-email-transactionnels` (modèles d'emails automatisés ; même
// source `modelesEmail` que la feature `modeles-email`, UI distincte avec modèles prédéfinis).
// Types dérivés du routeur, données/règles pures testables. 0 dépendance React/tRPC.

export type Modele = RouterOutputs["modelesEmail"]["list"][number];
export type EmailType = RouterInputs["modelesEmail"]["create"]["type"];
export type CreateInput = RouterInputs["modelesEmail"]["create"];

export type ModeleForm = { nom: string; type: EmailType; sujet: string; contenu: string };

// Options du sélecteur de type (libellés via i18n `typeOption.<value>`). ⚠️ Correctif de parité : le
// legacy envoyait des valeurs HORS enum ("relance"/"confirmation"/"rappel") → rejetées par le backend.
// On mappe ici les libellés visibles sur des valeurs VALIDES de l'enum (bug latent corrigé).
export const TYPE_OPTIONS: readonly EmailType[] = ["relance_devis", "envoi_facture", "rappel_paiement", "autre"];

// Variables insérables (noms camelCase sans accolades, parité legacy) — descriptions via i18n
// `variable.<name>`. Le code affiché/inséré = `{{<name>}}` (cf. `varCode`).
export const VARIABLES_DISPONIBLES = [
  "nomClient", "prenomClient", "numeroDevis", "numeroFacture", "montant",
  "dateEcheance", "nomEntreprise", "telephoneEntreprise", "emailEntreprise",
] as const;
export function varCode(name: string): string {
  return `{{${name}}}`;
}

// Modèles prédéfinis à ajouter en un clic (le `nom` est un libellé i18n `defaut.<key>.nom`, le corps
// est un contenu d'exemple injecté tel quel dans la création).
export type ModeleDefaut = { key: string; type: EmailType; sujet: string; contenu: string };
export const MODELES_PAR_DEFAUT: readonly ModeleDefaut[] = [
  {
    key: "relanceDevis",
    type: "relance_devis",
    sujet: "Relance - Devis {{numeroDevis}}",
    contenu: "Bonjour {{prenomClient}},\n\nNous vous relançons concernant le devis {{numeroDevis}} d'un montant de {{montant}} €.\n\nPouvez-vous nous confirmer votre intérêt ?\n\nCordialement,\n{{nomEntreprise}}",
  },
  {
    key: "confirmationFacture",
    type: "envoi_facture",
    sujet: "Facture {{numeroFacture}} - {{nomEntreprise}}",
    contenu: "Bonjour {{prenomClient}},\n\nVeuillez trouver ci-joint votre facture {{numeroFacture}}.\n\nMontant: {{montant}} €\nDate d'échéance: {{dateEcheance}}\n\nMerci de votre confiance.\n\nCordialement,\n{{nomEntreprise}}",
  },
  {
    key: "rappelPaiement",
    type: "rappel_paiement",
    sujet: "Rappel - Facture {{numeroFacture}} impayée",
    contenu: "Bonjour {{prenomClient}},\n\nNous vous rappelons que la facture {{numeroFacture}} d'un montant de {{montant}} € n'a pas encore été payée.\n\nDate d'échéance: {{dateEcheance}}\n\nVeuillez procéder au paiement au plus tôt.\n\nCordialement,\n{{nomEntreprise}}",
  },
];

// Convertit un modèle prédéfini en input de création (nom résolu via i18n côté appelant). PUR.
export function defautToCreateInput(d: ModeleDefaut, nom: string): CreateInput {
  return { nom, type: d.type, sujet: d.sujet, contenu: d.contenu };
}
