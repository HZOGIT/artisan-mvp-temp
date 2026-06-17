import type {
  Intervention, InterventionClient, EquipeByArtisanRow,
} from "../../interventions/domain/intervention";

// Couche DOMAIN de la feature `calendrier` (clean-archi) : vue calendrier des interventions. Réutilise
// les types/règles du domaine `interventions` (même bounded context) et n'ajoute que la projection
// vers la forme attendue par le composant présentationnel `Calendar`, + les helpers de date du dialog.
// Aucune dépendance React/tRPC. PUR & testable.

export type { Intervention, InterventionClient, EquipeByArtisanRow };

// Forme consommée par `@/components/Calendar` (interface locale au composant, recopiée ici pour typer
// la projection ; tsc valide l'assignabilité au point d'appel `<Calendar interventions={…} />`).
export interface CalendarItem {
  id: number;
  titre: string;
  dateDebut: string | Date;
  dateFin?: string | Date | null;
  statut: string;
  adresse?: string | null;
  client?: { nom: string; prenom?: string | null } | null;
  equipe?: { technicienId: number; nom?: string | null; prenom?: string | null }[];
}

// Résout le client (nom/prénom) d'une intervention depuis la liste `clients` — `interventions.list`
// ne renvoie que `clientId` (pas de jointure client). `null` si introuvable.
export function resolveClient(
  clients: readonly InterventionClient[],
  clientId: number,
): { nom: string; prenom?: string | null } | null {
  const c = clients.find((x) => x.id === clientId);
  return c ? { nom: c.nom, prenom: c.prenom } : null;
}

// Projette les interventions (+ clients + équipes indexées) vers les items du calendrier. PUR.
export function toCalendarItems(
  interventions: readonly Intervention[],
  clients: readonly InterventionClient[],
  equipeParIntervention: ReadonlyMap<number, EquipeByArtisanRow[]>,
): CalendarItem[] {
  return interventions.map((i) => ({
    id: i.id,
    titre: i.titre,
    dateDebut: i.dateDebut,
    dateFin: i.dateFin,
    statut: i.statut,
    adresse: i.adresse,
    client: resolveClient(clients, i.clientId),
    equipe: equipeParIntervention.get(i.id),
  }));
}

// Heure de fin par défaut au clic « ajouter » : heure de début + 1h, bornée à 20:00 (parité legacy).
export function defaultHeureFin(date: Date): string {
  return `${String(Math.min(date.getHours() + 1, 20)).padStart(2, "0")}:00`;
}

// Heure « HH:mm » d'une date locale (parité legacy : padStart 2).
export function heureDeDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// Combine une date "YYYY-MM-DD" + une heure "HH:mm" en Date locale. `null` si date vide.
export function combineDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr) return null;
  return new Date(`${dateStr}T${timeStr}`);
}
