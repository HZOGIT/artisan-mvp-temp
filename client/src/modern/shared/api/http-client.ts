import createClient from "openapi-fetch";
import type { paths } from "./schema";

// Client HTTP REST type-safe (PoC OPE-366). Les types `paths` sont générés par openapi-typescript
// depuis `openapi/operioz.openapi.json` (`pnpm gen:api`) → chemins, params et réponses sont vérifiés
// à la compilation. `credentials: "include"` envoie le cookie host-only `token` (même session que le
// reste de l'app) — cf. CLAUDE.md (cookie d'auth = `token`).
export const api = createClient<paths>({
  baseUrl: "/",
  credentials: "include",
});
