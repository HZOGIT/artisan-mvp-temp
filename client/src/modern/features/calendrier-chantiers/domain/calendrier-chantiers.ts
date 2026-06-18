import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `calendrier-chantiers` (planning interventions : mois/semaine/jour, drag&drop
// de replanification/réaffectation, couleurs, export). Transformations + logique calendaire PURES testables.

export type InterventionRow = RouterOutputs["interventions"]["list"][number];
export type Chantier = RouterOutputs["chantiers"]["list"][number];
export type Technicien = RouterOutputs["techniciens"]["getAll"][number];
export type InterventionChantierLien = RouterOutputs["chantiers"]["getAllInterventionsChantier"][number];
export type AssignResult = RouterOutputs["interventions"]["assignerTechnicien"];

export type ViewMode = "month" | "week" | "day";
export type ColorMode = "chantier" | "technicien" | "statut";

// Intervention « enrichie » affichée dans le calendrier.
export type CalendarIntervention = {
  id: number; chantierId: number; chantierNom: string; technicienId: number | null; technicienNom: string | null;
  dateDebut: string; dateFin: string | null; statut: string; description: string | null; adresse: string | null;
};

export const COLORS = [
  { name: "Bleu", class: "bg-blue-500", hex: "#3b82f6" }, { name: "Vert", class: "bg-green-500", hex: "#22c55e" },
  { name: "Violet", class: "bg-purple-500", hex: "#a855f7" }, { name: "Orange", class: "bg-orange-500", hex: "#f97316" },
  { name: "Rose", class: "bg-pink-500", hex: "#ec4899" }, { name: "Cyan", class: "bg-teal-500", hex: "#14b8a6" },
  { name: "Indigo", class: "bg-indigo-500", hex: "#6366f1" }, { name: "Rouge", class: "bg-red-500", hex: "#ef4444" },
  { name: "Jaune", class: "bg-yellow-500", hex: "#eab308" }, { name: "Gris", class: "bg-gray-500", hex: "#6b7280" },
];
export const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const STATUT_COLORS: Record<string, string> = { planifiee: "bg-blue-500", en_cours: "bg-yellow-500", terminee: "bg-green-500", annulee: "bg-red-500" };

export function technicienNom(t: Technicien | undefined): string | null {
  return t ? `${t.prenom || ""} ${t.nom}`.trim() : null;
}

// Enrichit les interventions avec chantier (via le lien) + technicien. PUR.
export function transformInterventions(rows: readonly InterventionRow[], chantiers: readonly Chantier[], techniciens: readonly Technicien[], liens: readonly InterventionChantierLien[]): CalendarIntervention[] {
  const chantierMap = new Map(chantiers.map((c) => [c.id, c]));
  const techMap = new Map(techniciens.map((t) => [t.id, t]));
  const interChantier = new Map<number, number>();
  for (const ic of liens) interChantier.set(ic.interventionId, ic.chantierId);
  return rows.map((i) => {
    const chantierId = interChantier.get(i.id) || 0;
    const chantier = chantierMap.get(chantierId);
    return {
      id: i.id, chantierId, chantierNom: chantier?.nom || "Sans chantier",
      technicienId: i.technicienId, technicienNom: technicienNom(techMap.get(i.technicienId || 0)),
      dateDebut: i.dateDebut?.toString() || new Date().toISOString(), dateFin: i.dateFin?.toString() || null,
      statut: i.statut || "planifiee", description: i.description, adresse: chantier?.adresse || i.adresse,
    };
  });
}

// Filtre par chantier/technicien sélectionnés. PUR.
export function filterInterventions(list: readonly CalendarIntervention[], chantierId: number | null, technicienId: number | null): CalendarIntervention[] {
  return list.filter((i) => (!chantierId || i.chantierId === chantierId) && (!technicienId || i.technicienId === technicienId));
}

// Couleur (classe Tailwind) d'une intervention selon le mode + couleurs personnalisées. PUR.
export function interventionColor(i: CalendarIntervention, customColors: Record<number, string>, mode: ColorMode): string {
  if (customColors[i.id]) return customColors[i.id];
  if (mode === "technicien") return i.technicienId ? COLORS[i.technicienId % COLORS.length].class : COLORS[0].class;
  if (mode === "statut") return STATUT_COLORS[i.statut] || COLORS[0].class;
  return COLORS[i.chantierId % COLORS.length].class;
}

// Interventions actives un jour donné (chevauchement [début, fin]). PUR.
export function interventionsForDay(list: readonly CalendarIntervention[], date: Date): CalendarIntervention[] {
  const dateStr = date.toISOString().split("T")[0];
  return list.filter((i) => {
    const start = new Date(i.dateDebut).toISOString().split("T")[0];
    const end = i.dateFin ? new Date(i.dateFin).toISOString().split("T")[0] : start;
    return dateStr >= start && dateStr <= end;
  });
}

// Grille de 42 cases (6 semaines) du mois, lundi en tête. PUR.
export function daysInMonth(currentDate: Date): { date: Date; isCurrentMonth: boolean }[] {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const lastDay = new Date(year, month + 1, 0);
  let startOffset = new Date(year, month, 1).getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const days: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = startOffset - 1; i >= 0; i--) days.push({ date: new Date(year, month, -i), isCurrentMonth: false });
  for (let i = 1; i <= lastDay.getDate(); i++) days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
  return days;
}

// 7 jours de la semaine courante (lundi → dimanche). PUR.
export function daysInWeek(currentDate: Date): Date[] {
  const d = new Date(currentDate);
  const day = d.getDay();
  const monday = new Date(d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)));
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

// Nouvelle date de début après un drop (décalage en jours). null si même jour. PUR.
export function rescheduledDate(dateDebut: string, targetDate: Date): Date | null {
  const original = new Date(dateDebut);
  const diffDays = Math.floor((targetDate.getTime() - original.getTime()) / 86400000);
  if (diffDays === 0) return null;
  const next = new Date(original);
  next.setDate(next.getDate() + diffDays);
  return next;
}

// Variante shadcn + libellé i18n d'un statut. PUR.
export function statutVariant(statut: string): "default" | "secondary" | "destructive" | "outline" {
  if (statut === "en_cours") return "default";
  if (statut === "terminee") return "outline";
  if (statut === "annulee") return "destructive";
  return "secondary";
}

// Comptes de conflits d'une réassignation. PUR.
export function conflictCounts(data: AssignResult): { nbInter: number; nbConge: number } {
  const c = data.conflits;
  return { nbInter: c?.interventions?.length ?? 0, nbConge: c?.conges?.length ?? 0 };
}

// CSV du calendrier (séparateur ;). PUR.
export function buildCsv(list: readonly CalendarIntervention[]): string {
  const header = ["Titre", "Date début", "Date fin", "Technicien", "Adresse", "Statut"].join(";");
  const rows = list.map((i) => [
    `${i.chantierNom} - ${i.description || "Intervention"}`,
    new Date(i.dateDebut).toLocaleDateString("fr-FR"),
    new Date(i.dateFin || i.dateDebut).toLocaleDateString("fr-FR"),
    i.technicienNom || "", i.adresse || "", i.statut,
  ].join(";"));
  return [header, ...rows].join("\n");
}
