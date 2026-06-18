import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `interventions-mobile` (vue terrain du jour : démarrer/terminer avec géoloc +
// signature). Types dérivés du routeur, agrégats/format purs testables. 0 React/tRPC.

export type EquipeMembre = RouterOutputs["interventions"]["getEquipesByArtisan"][number];

// `interventionsMobile.getTodayInterventions` est typé `unknown[]` côté backend (le legacy lisait via
// `any`) → on déclare ici la forme réellement consommée ; l'application caste à la frontière.
export type MobileIntervention = {
  id: number; titre: string; statut: string | null;
  client: { nom: string | null; prenom: string | null; telephone: string | null } | null;
  dateDebut: string | Date; dateFin: string | Date | null;
  adresse: string | null; description: string | null;
  mobileData: { heureArrivee: string | Date | null; heureDepart: string | Date | null } | null;
};

// Variante shadcn d'un statut (libellé via i18n `statut.<statut>`). PUR.
export function statutVariant(statut: string): "default" | "secondary" | "destructive" | "outline" {
  if (statut === "en_cours") return "default";
  if (statut === "terminee") return "outline";
  if (statut === "annulee") return "destructive";
  return "secondary"; // planifiee
}

// Indexe les membres d'équipe par intervention. PUR.
export function equipeParIntervention(membres: readonly EquipeMembre[]): Map<number, EquipeMembre[]> {
  const map = new Map<number, EquipeMembre[]>();
  for (const m of membres) {
    const arr = map.get(m.interventionId) || [];
    arr.push(m);
    map.set(m.interventionId, arr);
  }
  return map;
}

// Nom affiché d'un membre d'équipe (prénom + nom), repli « Tech #id ». PUR.
export function membreName(m: EquipeMembre): string {
  return [m.prenom, m.nom].filter(Boolean).join(" ") || `Tech #${m.technicienId}`;
}

// Durée sur site formatée (« X h MM » ou « M min ») depuis arrivée/départ. PUR.
export function dureeSurSite(heureArrivee: string | Date, heureDepart: string | Date): string {
  const min = Math.max(0, Math.round((new Date(heureDepart).getTime() - new Date(heureArrivee).getTime()) / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

// URL de recherche d'itinéraire Google Maps. PUR.
export function mapsUrl(adresse: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
}
