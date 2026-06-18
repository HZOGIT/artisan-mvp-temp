import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `contrat-detail` (contrat de maintenance/service). Types dérivés du routeur,
// catalogues de libellés/statuts, calcul de montants + formulaire d'intervention purs testables. 0 React/tRPC.

export type Contrat = NonNullable<RouterOutputs["contrats"]["getById"]>;
export type ContratIntervention = RouterOutputs["contrats"]["getInterventions"][number];
export type CreateInterventionInput = RouterInputs["contrats"]["createIntervention"];

export const TYPE_LABEL_KEY: Record<string, string> = {
  maintenance_preventive: "typeMaintenancePreventive", entretien: "typeEntretien",
  depannage: "typeDepannage", contrat_service: "typeContratService",
};
export const PERIODICITE_LABEL_KEY: Record<string, string> = {
  mensuel: "periodiciteMensuel", trimestriel: "periodiciteTrimestriel",
  semestriel: "periodiciteSemestriel", annuel: "periodiciteAnnuel",
};

// Statut d'intervention → libellé i18n + classe couleur (l'icône est résolue en UI). PUR.
export const STATUT_INTERVENTION: Record<string, { labelKey: string; color: string }> = {
  planifiee: { labelKey: "interPlanifiee", color: "bg-blue-50 text-blue-700 border-blue-200" },
  en_cours: { labelKey: "interEnCours", color: "bg-orange-50 text-orange-700 border-orange-200" },
  effectuee: { labelKey: "interEffectuee", color: "bg-green-50 text-green-700 border-green-200" },
  annulee: { labelKey: "interAnnulee", color: "bg-red-50 text-red-700 border-red-200" },
};

// Variante shadcn d'un statut de contrat (libellé via i18n `statut.<statut>`). PUR.
export function statutContratVariant(statut: string): "default" | "secondary" | "destructive" | "outline" {
  if (statut === "actif") return "default";
  if (statut === "suspendu") return "secondary";
  if (statut === "annule") return "destructive";
  return "outline"; // termine / inconnu
}

// Montants HT/TVA/TTC d'un contrat (champs string nullables). PUR.
export function montantsContrat(montantHT: string | null | undefined, tauxTVA: string | null | undefined): { ht: number; taux: number; tva: number; ttc: number } {
  const ht = parseFloat(montantHT || "0");
  const taux = parseFloat(tauxTVA || "20");
  const tva = ht * (taux / 100);
  return { ht, taux, tva, ttc: ht + tva };
}

export type InterventionForm = { titre: string; description: string; dateIntervention: string; duree: string; technicienNom: string; notes: string };

// Formulaire d'intervention vierge (date = aujourd'hui). PUR (sauf horloge).
export function defaultInterventionForm(): InterventionForm {
  return { titre: "", description: "", dateIntervention: new Date().toISOString().split("T")[0], duree: "", technicienNom: "", notes: "" };
}

// Construit le payload de création d'intervention (champs vides → undefined). PUR.
export function buildCreateInterventionPayload(contratId: number, form: InterventionForm): CreateInterventionInput {
  return {
    contratId, titre: form.titre, dateIntervention: form.dateIntervention,
    description: form.description || undefined, duree: form.duree || undefined,
    technicienNom: form.technicienNom || undefined, notes: form.notes || undefined,
  };
}
