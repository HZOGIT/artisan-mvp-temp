import type { RouterInputs, RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `modeles-email` (modèles d'emails personnalisables). Types dérivés du
// routeur tRPC, règles pures testables (filtre, couleur de type, rendu de l'aperçu). 0 dépendance React/tRPC.

export type Modele = RouterOutputs["modelesEmail"]["list"][number];
export type EmailType = RouterInputs["modelesEmail"]["create"]["type"];

export type ModeleForm = {
  nom: string;
  type: EmailType;
  sujet: string;
  contenu: string;
  isDefault: boolean;
};

// Types d'emails (parité legacy) — libellés/descriptions via i18n `type.<value>` / `typeDesc.<value>`.
export const EMAIL_TYPES: readonly EmailType[] = ["relance_devis", "envoi_devis", "envoi_facture", "rappel_paiement", "autre"];

// Variables insérables dans un modèle (clés) — descriptions via i18n `variable.<key>`.
export const VARIABLES_DISPONIBLES = [
  "nom_client", "prenom_client", "email_client", "numero_devis", "numero_facture", "montant_ttc",
  "date_devis", "date_facture", "date_echeance", "lien_signature", "lien_paiement",
  "nom_entreprise", "telephone_entreprise",
] as const;

// Variables proposées en raccourci sous le champ contenu (parité legacy).
export const VARIABLES_RACCOURCIS = ["nom_client", "numero_devis", "montant_ttc", "lien_signature"] as const;

// Valeurs d'exemple pour l'aperçu (substitution des `{{variable}}`).
export const EXEMPLES_APERCU: Record<string, string> = {
  nom_client: "Dupont", prenom_client: "Jean", email_client: "jean.dupont@email.com",
  numero_devis: "DEV-2025-001", numero_facture: "FAC-2025-001", montant_ttc: "1 250,00 €",
  date_devis: "13/01/2025", date_facture: "13/01/2025", date_echeance: "13/02/2025",
  lien_signature: "https://example.com/signature/abc123", lien_paiement: "https://example.com/paiement/xyz789",
  nom_entreprise: "Mon Entreprise", telephone_entreprise: "01 23 45 67 89",
};

// Classe de pastille d'un type d'email. PUR.
export function typeBadgeColor(type: string): string {
  switch (type) {
    case "relance_devis": return "bg-orange-100 text-orange-800";
    case "envoi_devis": return "bg-blue-100 text-blue-800";
    case "envoi_facture": return "bg-green-100 text-green-800";
    case "rappel_paiement": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

// Filtre les modèles par onglet (`all` = tous, sinon par type). PUR.
export function filterByType(modeles: readonly Modele[], tab: string): Modele[] {
  return modeles.filter((m) => tab === "all" || m.type === tab);
}

// Rend l'aperçu d'un contenu en remplaçant chaque `{{variable}}` par sa valeur d'exemple. PUR.
export function renderPreview(contenu: string, exemples: Record<string, string> = EXEMPLES_APERCU): string {
  let out = contenu;
  for (const [key, value] of Object.entries(exemples)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return out;
}
