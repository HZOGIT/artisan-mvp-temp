import { trpc } from "@/shared/trpc";
import type { AiThread } from "../domain/assistant-conversations";

/** Couche APPLICATION — historique des fils MonAssistant. SEULE couche important tRPC. */
export function useAssistantThreads() {
  const q = trpc.assistant.getThreads.useQuery();
  const threads: AiThread[] = q.data ?? [];
  return { threads, isLoading: q.isLoading };
}
