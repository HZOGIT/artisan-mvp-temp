import type { RouterInputs, RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `chantiers` (projets multi-interventions : phases, main-d'œuvre, suivi
// client, rappels CRM). Types dérivés du routeur + agrégats/règles purs testables.

export type Chantier = RouterOutputs["chantiers"]["list"][number];
export type ChantierDetail = NonNullable<RouterOutputs["chantiers"]["getById"]>;
export type Phase = RouterOutputs["chantiers"]["getPhases"][number];
export type Pointage = RouterOutputs["chantiers"]["getPointages"][number];
export type InterventionCh = RouterOutputs["chantiers"]["getInterventions"][number];
export type Stats = RouterOutputs["chantiers"]["getStatistiques"];
export type SuiviEtape = RouterOutputs["chantiers"]["getSuivi"][number];
export type Activite = RouterOutputs["activites"]["list"][number];
export type Client = RouterOutputs["clients"]["list"][number];
export type Technicien = RouterOutputs["techniciens"]["getAll"][number];
export type CreateChantierInput = RouterInputs["chantiers"]["create"];
export type Priorite = NonNullable<CreateChantierInput["priorite"]>;
export type StatutChantier = NonNullable<RouterInputs["chantiers"]["update"]["statut"]>;
export type ActiviteType = NonNullable<RouterInputs["activites"]["create"]["type"]>;
export type SuiviStatut = NonNullable<RouterInputs["chantiers"]["updateSuivi"]["statut"]>;

export const PRIORITES: readonly Priorite[] = ["basse", "normale", "haute", "urgente"];
export const STATUTS: readonly StatutChantier[] = ["planifie", "en_cours", "en_pause", "termine", "annule"];
export const RAPPEL_TYPES: readonly ActiviteType[] = ["autre", "appel", "email", "rdv", "relance"];

export type ChantierForm = {
  clientId: number; reference: string; nom: string; description: string; adresse: string;
  codePostal: string; ville: string; dateDebut: string; dateFinPrevue: string;
  budgetPrevisionnel: string; priorite: Priorite; notes: string;
};

export function defaultChantierForm(): ChantierForm {
  return { clientId: 0, reference: "", nom: "", description: "", adresse: "", codePostal: "", ville: "", dateDebut: "", dateFinPrevue: "", budgetPrevisionnel: "", priorite: "normale", notes: "" };
}

// Variante shadcn d'un statut de chantier/phase (libellé via i18n `statut.<statut>`). PUR.
export function statutVariant(statut: string): "default" | "secondary" | "destructive" | "outline" {
  switch (statut) {
    case "en_cours": case "termine": return "default";
    case "en_pause": return "outline";
    case "annule": return "destructive";
    default: return "secondary"; // planifie / a_faire
  }
}

// Classe de la pastille de priorité. PUR.
export function prioriteColor(priorite: string): string {
  switch (priorite) {
    case "basse": return "bg-gray-100 text-gray-800";
    case "haute": return "bg-orange-100 text-orange-800";
    case "urgente": return "bg-red-100 text-red-800";
    default: return "bg-blue-100 text-blue-800"; // normale
  }
}

// Nom affiché d'un technicien (prénom + nom), « — » si absent. PUR.
export function techNom(techniciens: readonly Technicien[], id: number | null): string {
  if (!id) return "—";
  const t = techniciens.find((x) => x.id === id);
  return t ? `${t.prenom || ""} ${t.nom}`.trim() : `#${id}`;
}

export type MainOeuvre = { totalPrevues: number; totalPointees: number; ecart: number };

// Synthèse main-d'œuvre : heures prévues (phases) vs pointées + écart. PUR.
export function mainOeuvreSynthese(phases: readonly Phase[], pointages: readonly Pointage[]): MainOeuvre {
  const totalPrevues = phases.reduce((s, p) => s + (parseFloat(String(p.heuresPrevues ?? "")) || 0), 0);
  const totalPointees = pointages.reduce((s, p) => s + (parseFloat(String(p.heures ?? "")) || 0), 0);
  return { totalPrevues, totalPointees, ecart: totalPointees - totalPrevues };
}

// Activités CRM rattachées à un chantier. PUR.
export function activitesForChantier(activites: readonly Activite[], chantierId: number | null): Activite[] {
  return activites.filter((a) => a.entiteType === "chantier" && a.entiteId === chantierId);
}

// Activités triées par échéance croissante. PUR.
export function activitesParEcheance(activites: readonly Activite[]): Activite[] {
  return activites.slice().sort((a, b) => new Date(a.echeance).getTime() - new Date(b.echeance).getTime());
}

// Nombre de rappels non faits. PUR.
export function rappelsActifs(activites: readonly Activite[]): number {
  return activites.filter((a) => !a.fait).length;
}

// Pourcentage d'une étape de suivi selon son statut. PUR.
export function suiviPourcentage(statut: string): number {
  return statut === "termine" ? 100 : statut === "en_cours" ? 50 : 0;
}
