// Domaine ASSISTANT IA — fil de conversation persistant (threads + messages). Lecture seule ici
// (historique affiché dans le panneau assistant). `ai_threads` porte `artisanId` (RLS) ;
// `ai_messages` n'en a pas → scopé via l'appartenance du THREAD parent (anti-IDOR). Parité legacy
// `assistant.getThreads`/`getMessages`. Les générateurs IA (chat/generateDevis/…) = slices suivantes.

export interface AiThread {
  readonly id: number;
  readonly artisanId: number;
  readonly mode: string;
  readonly parcoursId: string | null;
  readonly title: string;
  readonly lastMessageAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AiMessage {
  readonly id: number;
  readonly threadId: number;
  readonly role: string;
  readonly transcript: string;
  readonly attachments: unknown;
  readonly metadata: unknown;
  readonly pricingMetadata: unknown;
  readonly createdAt: Date;
}

// Bornes legacy : liste des threads (20 par défaut, max 100) ; messages d'un thread (100 par défaut,
// max 500). Centralisées ici pour rester fidèles au comportement legacy.
export const THREADS_LIMIT_DEFAUT = 20;
export const THREADS_LIMIT_MAX = 100;
export const MESSAGES_LIMIT_DEFAUT = 100;
export const MESSAGES_LIMIT_MAX = 500;

export function clampThreadsLimit(limit?: number): number {
  return clamp(limit, THREADS_LIMIT_DEFAUT, 1, THREADS_LIMIT_MAX);
}
export function clampMessagesLimit(limit?: number): number {
  return clamp(limit, MESSAGES_LIMIT_DEFAUT, 1, MESSAGES_LIMIT_MAX);
}

function clamp(value: number | undefined, defaut: number, min: number, max: number): number {
  const n = Math.floor(value ?? defaut) || defaut;
  return Math.max(min, Math.min(max, n));
}
