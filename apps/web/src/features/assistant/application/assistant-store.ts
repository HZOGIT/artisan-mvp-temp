import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Message } from "../domain/assistant";

/*
 * Store global Zustand pour l'assistant chat. Survit aux navigations SPA et aux rechargements
 * (persist → localStorage). isStreaming et activeToolName sont exclus de la persistance.
 */

export interface AssistantState {
  messages: Message[];
  threadId: number | undefined;
  isStreaming: boolean;
  activeToolName: string | null;

  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setThreadId: (id: number | undefined) => void;
  setIsStreaming: (v: boolean) => void;
  setActiveTool: (name: string | null) => void;
  reset: () => void;
  appendAssistantChunk: (chunk: string) => void;
}

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set) => ({
      messages: [],
      threadId: undefined,
      isStreaming: false,
      activeToolName: null,

      setMessages: (messages) =>
        set((state) => ({
          messages: typeof messages === "function" ? messages(state.messages) : messages,
        })),
      setThreadId: (id) => set({ threadId: id }),
      setIsStreaming: (v) => set({ isStreaming: v }),
      setActiveTool: (name) => set({ activeToolName: name }),
      reset: () => set({ messages: [], threadId: undefined, isStreaming: false, activeToolName: null }),
      appendAssistantChunk: (chunk) =>
        set((state) => {
          const prev = state.messages;
          if (prev.length === 0) return state;
          const last = prev[prev.length - 1];
          if (last.role !== "assistant") return state;
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, content: last.content + chunk };
          return { messages: updated };
        }),
    }),
    {
      name: "assistant-store",
      partialize: (state) => ({
        messages: state.messages,
        threadId: state.threadId,
      }),
    },
  ),
);
