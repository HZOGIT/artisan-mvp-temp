import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `chat` (messagerie artisan ↔ client). Types dérivés du routeur tRPC,
// règles pures testables (filtre liste, libellé client, date courte). 0 dépendance React/tRPC.

export type ChatConversation = RouterOutputs["chat"]["getConversations"][number];
export type ChatMessage = RouterOutputs["chat"]["getMessages"][number];

export type ChatFilter = "toutes" | "ouvertes" | "fermees" | "archivees";
export const CHAT_FILTERS: readonly ChatFilter[] = ["toutes", "ouvertes", "fermees", "archivees"];

// Normalisation accents/casse pour une recherche tolérante. PUR.
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Libellé d'affichage d'un client de conversation (prénom + nom, repli « Client »). PUR.
export function clientLabel(client: ChatConversation["client"] | null | undefined): string {
  if (!client) return "Client";
  return client.prenom ? `${client.prenom} ${client.nom}` : client.nom || "Client";
}

// Filtre les conversations par statut + recherche (nom client OU sujet). PUR.
export function filterConversations(conversations: readonly ChatConversation[], filter: ChatFilter, search: string): ChatConversation[] {
  const q = normalize(search);
  return conversations.filter((c) => {
    if (filter === "ouvertes" && c.statut !== "ouverte") return false;
    if (filter === "fermees" && c.statut !== "fermee") return false;
    if (filter === "archivees" && c.statut !== "archivee") return false;
    if (!q) return true;
    return normalize(clientLabel(c.client)).includes(q) || normalize(c.sujet || "").includes(q);
  });
}

// Date courte d'un message (parité legacy : heure du jour / "Hier" / jour de semaine / date). PUR.
export function formatChatDate(date: Date | string, now: Date = new Date()): string {
  const d = new Date(date);
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Hier";
  if (days < 7) return d.toLocaleDateString("fr-FR", { weekday: "long" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
