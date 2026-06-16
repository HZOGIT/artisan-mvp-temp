import { $api } from "@/modern/shared/api/query";
import type { Client } from "../domain/client";

// Use-case de lecture (couche application) : expose la liste des clients du tenant via le hook Query
// généré. L'UI ne connaît ni l'URL ni le transport — elle consomme `useClients()`. Le type de retour
// `Client[]` vient du contrat OpenAPI (type-safe end-to-end : serveur zod → OpenAPI → openapi-typescript).
export function useClients() {
  const query = $api.useQuery("get", "/api/rest/clients");
  return {
    clients: (query.data ?? []) as Client[],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
