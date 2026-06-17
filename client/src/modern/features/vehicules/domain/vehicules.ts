import type { RouterInputs, RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `vehicules` (gestion de flotte). Types dérivés du routeur tRPC, règles
// pures testables (pastille de statut, libellé technicien). 0 dépendance React/tRPC.

export type Vehicule = RouterOutputs["vehicules"]["list"][number];
export type Technicien = RouterOutputs["techniciens"]["getAll"][number];
export type FlotteStats = RouterOutputs["vehicules"]["getStatistiquesFlotte"];
export type AssuranceExpirant = RouterOutputs["vehicules"]["getAssurancesExpirant"][number];
export type EntretienAVenir = RouterOutputs["vehicules"]["getEntretiensAVenir"][number];
export type TypeCarburant = NonNullable<RouterInputs["vehicules"]["create"]["typeCarburant"]>;
export type VehiculeForm = RouterInputs["vehicules"]["create"];

export const CARBURANTS: readonly TypeCarburant[] = ["essence", "diesel", "electrique", "hybride", "gpl"];

// Classe de fond de la pastille d'un statut (null = pas de fond ; cf. `statutVariant`). PUR.
export function statutClass(statut: string): string | null {
  switch (statut) {
    case "actif": return "bg-green-500";
    case "en_maintenance": return "bg-yellow-500";
    case "hors_service": return "bg-red-500";
    default: return null; // vendu (secondary) / inconnu (plain)
  }
}

// Variante shadcn de la pastille (`secondary` pour « vendu », sinon défaut). PUR.
export function statutVariant(statut: string): "secondary" | undefined {
  return statut === "vendu" ? "secondary" : undefined;
}

// Prénom du technicien assigné (repli « N/A »). PUR.
export function technicienPrenom(techniciens: readonly Technicien[], technicienId: number | null | undefined): string {
  return techniciens.find((t) => t.id === technicienId)?.prenom || "N/A";
}

// Immatriculation d'un véhicule par id (jointure client : les DTO assurances/entretiens ne portent que
// `vehiculeId`, pas l'objet véhicule). PUR.
export function vehiculeImmat(vehicules: readonly Vehicule[], vehiculeId: number): string {
  return vehicules.find((v) => v.id === vehiculeId)?.immatriculation || "";
}
