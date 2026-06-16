import createQueryClient from "openapi-react-query";
import { api } from "./http-client";

// Hooks TanStack Query générés PAR ENDPOINT (PoC OPE-366) : `$api.useQuery("get", "/api/rest/clients")`
// est entièrement typé (chemin, params, données, erreurs) depuis le schéma OpenAPI. Réutilise le
// QueryClient ambiant fourni par `main.tsx` (QueryClientProvider) — pas de provider supplémentaire.
export const $api = createQueryClient(api);
