import { useCallback } from "react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { Message, StreamEvent, DevisLigne, Relances } from "../domain/assistant";

/** Hook retournant une fonction de streaming du chat assistant via tRPC subscription (SSE agentique). */
export function useStreamMessage() {
  const utils = trpc.useUtils();
  return useCallback(
    (
      body: { message: string; history: Message[]; threadId: number | undefined },
      onEvent: (ev: StreamEvent) => void,
      signal: AbortSignal,
    ): Promise<void> =>
      new Promise((resolve, reject) => {
        const sub = utils.client.assistant.stream.subscribe(
          { message: body.message, history: body.history, threadId: body.threadId },
          {
            onData(chunk) {
              const ev: StreamEvent = {};
              if ("threadId" in chunk) ev.threadId = chunk.threadId;
              if ("content" in chunk) ev.content = chunk.content;
              if ("navigate" in chunk) {
                ev.navigate = chunk.navigate;
                if (chunk.filtre) ev.filtre = chunk.filtre;
              }
              if ("invalidate" in chunk) ev.invalidate = [...chunk.invalidate];
              if ("toolStart" in chunk) ev.toolStart = { name: chunk.toolStart.name, args: chunk.toolStart.args };
              if ("toolEnd" in chunk) ev.toolEnd = { name: chunk.toolEnd.name, ok: chunk.toolEnd.ok, error: chunk.toolEnd.error };
              onEvent(ev);
            },
            onError(error) {
              sub.unsubscribe();
              reject(error);
            },
            onComplete() {
              resolve();
            },
          },
        );
        signal.addEventListener("abort", () => {
          sub.unsubscribe();
          resolve();
        });
      }),
    [utils.client],
  );
}

/** Couche APPLICATION — assistant : chargement d'un thread + actions rapides + liste devis. */
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
