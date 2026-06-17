import { trpc } from "@/modern/shared/trpc";
import type { Client } from "../domain/client";

// Use-case de lecture (couche application) : expose la liste des clients du tenant via le client tRPC
// PARTAGÉ (`modern/shared/trpc` → `clients.list`, protégé + scopé tenant). L'UI ne connaît ni l'URL ni
// le transport : elle consomme `useClients()`. Type-safe end-to-end (serveur zod → AppRouter → front).
export function useClients() {
  const query = trpc.clients.list.useQuery();
  return {
    clients: (query.data ?? []) as Client[],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
