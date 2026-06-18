import { describe, it, expect } from "vitest";
import { MIGRATED_DOMAINS, STAGING_NEW_STACK_DEFAULT_DOMAINS } from "./migrated-domains";
import { MIGRATED_ROUTES as SRC_MIGRATED_ROUTES, matchesMigratedRoute } from "./migrated-routes";
// @ts-ignore — module ESM de la Pages Function (JS pur, sans types). Importé pour verrouiller la
// parité des REGISTRES avec le gateway src (anti-drift).
import {
  MIGRATED as EDGE_MIGRATED,
  DEFAULT_ENABLED as EDGE_DEFAULT_ENABLED,
  MIGRATED_ROUTES as EDGE_MIGRATED_ROUTES,
  decideTarget,
  domainFromTrpcPath,
  domainsFromTrpcPath,
} from "../../../../functions/_lib/dispatch.mjs";

// La Pages Function `functions/api/[[path]].js` réimplémente la décision de dispatch en JS pur
// (`functions/_lib/dispatch.mjs`). Ce test verrouille (1) la PARITÉ des registres edge↔src (anti-drift)
// et (2) la décision MONO-STACK (C4b) : tout `/api/*` → new-stack (le legacy n'est plus jamais la cible).

describe("edge dispatch (functions/_lib/dispatch.mjs) — parité des registres edge↔src", () => {
  it("la table MIGRATED de l'edge == MIGRATED_DOMAINS (même ensemble + cardinalité)", () => {
    expect(new Set(EDGE_MIGRATED)).toEqual(new Set(MIGRATED_DOMAINS));
    expect(EDGE_MIGRATED.length).toBe(MIGRATED_DOMAINS.length);
  });

  it("DEFAULT_ENABLED de l'edge == STAGING_NEW_STACK_DEFAULT_DOMAINS == MIGRATED (mono-stack)", () => {
    expect(new Set(EDGE_DEFAULT_ENABLED)).toEqual(new Set(STAGING_NEW_STACK_DEFAULT_DOMAINS));
    expect(new Set(EDGE_DEFAULT_ENABLED)).toEqual(new Set(EDGE_MIGRATED)); // tous les domaines portés activés
    expect(new Set(STAGING_NEW_STACK_DEFAULT_DOMAINS)).toEqual(new Set(MIGRATED_DOMAINS));
    for (const d of EDGE_DEFAULT_ENABLED) expect(MIGRATED_DOMAINS).toContain(d);
  });

  it("registre des routes HORS-tRPC : edge == src (anti-drift)", () => {
    expect(EDGE_MIGRATED_ROUTES.map((r) => r.name).sort()).toEqual(SRC_MIGRATED_ROUTES.map((r) => r.name).sort());
  });

  it("domainFromTrpcPath/domainsFromTrpcPath extraient le(s) domaine(s) ; vide hors /api/trpc", () => {
    expect(domainFromTrpcPath("/api/trpc/articles.list")).toBe("articles");
    expect(domainsFromTrpcPath("/api/trpc/articles.list")).toEqual(["articles"]);
    expect(domainsFromTrpcPath("/api/trpc/vehicules.list,clients.getById")).toEqual(["vehicules", "clients"]);
    expect(domainFromTrpcPath("/api/auth/login")).toBeNull();
    expect(domainsFromTrpcPath("/")).toEqual([]);
  });

  it("matchesMigratedRoute : exact sur les routes publiques/par-token, faux sur les chemins voisins", () => {
    expect(matchesMigratedRoute("/api/calendar/abc123def456.ics")).toBe(true);
    expect(matchesMigratedRoute("/api/stripe/webhook")).toBe(true);
    expect(matchesMigratedRoute("/api/upload-logo")).toBe(true);
    expect(matchesMigratedRoute("/api/voice/debug")).toBe(true);
    expect(matchesMigratedRoute("/api/fonts/")).toBe(false);
    expect(matchesMigratedRoute("/api/calendar/")).toBe(false);
  });
});

describe("decideTarget — dispatcher MONO-STACK (C4b)", () => {
  // La Pages Function ne capte QUE `/api/*` (le SPA `/` + `/assets` est servi en statique par Pages).
  // Tout `/api/*` est désormais routé vers le new-stack (le legacy n'est plus jamais la cible).
  it("tous les domaines tRPC portés → new-stack", () => {
    for (const d of MIGRATED_DOMAINS) expect(decideTarget(`/api/trpc/${d}.list`, {})).toBe("new-stack");
  });

  it("batch tRPC, routes HORS-tRPC, et MÊME les chemins inconnus/anciennement-legacy → new-stack", () => {
    // batch
    expect(decideTarget("/api/trpc/vehicules.list,notifications.list", {})).toBe("new-stack");
    // routes HORS-tRPC migrées
    for (const p of ["/api/calendar/abc.ics", "/api/stripe/webhook", "/api/upload-logo", "/api/comptabilite/fec", "/api/paiement/status/42", "/api/articles/search", "/api/voice/debug", "/api/fonts/roboto-regular.ttf", "/api/commandes-fournisseurs/42/pdf", "/api/portail/x/devis/1/pdf", "/api/comptabilite/facturx/42", "/api/comptabilite/export-pdf-lot"]) {
      expect(decideTarget(p, {})).toBe("new-stack");
    }
    // chemins jadis routés legacy (domaine inconnu, REST hors registre) → désormais new-stack (404 propre côté Fastify)
    for (const p of ["/api/trpc/supportZZZ.list", "/api/articles/categories", "/api/commandes-fournisseurs/42", "/api/auth/login", "/api/webhooks/stripe", "/api/n-importe-quoi"]) {
      expect(decideTarget(p, {})).toBe("new-stack");
    }
  });
});
