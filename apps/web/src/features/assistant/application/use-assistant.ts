import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import { BACKEND_URL } from "@/shared/backend-url";
import { parseStreamData, splitSseBuffer, sseDataLine, type Message, type StreamEvent, type DevisLigne, type Relances } from "../domain/assistant";

/*
 * Flux SSE `/api/assistant/stream` (hors tRPC) : POST + lecture incrémentale, décodage des trames via le
 * domain, callback `onEvent` par événement. Retourne quand le flux est terminé/avorté. Effets en UI.
 */
export async function streamMessage(
  body: { message: string; history: Message[]; threadId: number | undefined },
  onEvent: (ev: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/assistant/stream`, {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify(body), signal,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Erreur serveur" }))) as { error?: string };
    throw new Error(err.error || "Erreur serveur");
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Pas de stream disponible");
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { lines, rest } = splitSseBuffer(buffer);
    buffer = rest;
    for (const line of lines) {
      const data = sseDataLine(line);
      if (data === null) continue;
      const ev = parseStreamData(data);
      if (ev === "done") return;
      if (ev) onEvent(ev);
    }
  }
}

/*
 * Couche APPLICATION — assistant : chargement d'un thread + actions rapides (devis/relances/rentabilité/
 * trésorerie) + liste devis. Le streaming chat est géré par `streamMessage` (ci-dessus).
 */
export function useAssistant(initialThreadId: number | undefined, selectedDevisId: string) {
  const threadQuery = trpc.assistant.getMessages.useQuery(initialThreadId ? { threadId: initialThreadId } : skipToken);
  const generateDevis = trpc.assistant.generateDevis.useMutation();
  const suggestRelances = trpc.assistant.suggestRelances.useQuery(undefined, { enabled: false });
  const rentabilite = trpc.assistant.analyseRentabilite.useQuery({ devisId: parseInt(selectedDevisId) || 0 }, { enabled: false });
  const tresorerie = trpc.assistant.predictionTresorerie.useQuery(undefined, { enabled: false });
  const devisList = trpc.devis.list.useQuery();

  return { threadQuery, generateDevis, suggestRelances, rentabilite, tresorerie, devisList: devisList.data ?? [] };
}

export type { DevisLigne, Relances };
