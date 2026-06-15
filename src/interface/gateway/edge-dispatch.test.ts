import { describe, it, expect } from "vitest";
import { MIGRATED_DOMAINS, STAGING_NEW_STACK_DEFAULT_DOMAINS } from "./migrated-domains";
import { MIGRATED_ROUTES as SRC_MIGRATED_ROUTES, matchesMigratedRoute } from "./migrated-routes";
// @ts-ignore — module ESM de la Pages Function (JS pur, sans types). Importé pour verrouiller la
// parité avec le gateway src (anti-drift) : la logique edge réimplémente la décision en JS.
import {
  MIGRATED as EDGE_MIGRATED,
  DEFAULT_ENABLED as EDGE_DEFAULT_ENABLED,
  MIGRATED_ROUTES as EDGE_MIGRATED_ROUTES,
  decideTarget,
  domainFromTrpcPath,
  domainsFromTrpcPath,
} from "../../../functions/_lib/dispatch.mjs";

// La Pages Function `functions/api/[[path]].js` ne peut pas importer src/** (JS pur, pas de build TS).
// Elle réimplémente la décision de dispatch dans `functions/_lib/dispatch.mjs`. Ce test garantit que
// cette réimplémentation reste alignée sur le registre + la sémantique du gateway clean-archi.

// Un domaine migré qui n'est PAS activé par défaut (pour les cas « OFF par défaut »).
const NON_DEFAULT = MIGRATED_DOMAINS.find((d) => !STAGING_NEW_STACK_DEFAULT_DOMAINS.includes(d as never))!; // ex. "avis"
const DEFAULT_ON = STAGING_NEW_STACK_DEFAULT_DOMAINS[0]; // ex. "vehicules"

describe("edge dispatch (functions/_lib/dispatch.mjs) — parité avec le gateway src", () => {
  it("la table MIGRATED de l'edge == MIGRATED_DOMAINS (même ensemble + cardinalité)", () => {
    expect(new Set(EDGE_MIGRATED)).toEqual(new Set(MIGRATED_DOMAINS));
    expect(EDGE_MIGRATED.length).toBe(MIGRATED_DOMAINS.length);
  });

  it("DEFAULT_ENABLED de l'edge == STAGING_NEW_STACK_DEFAULT_DOMAINS (anti-drift de la bascule)", () => {
    expect(new Set(EDGE_DEFAULT_ENABLED)).toEqual(new Set(STAGING_NEW_STACK_DEFAULT_DOMAINS));
    expect(EDGE_DEFAULT_ENABLED.length).toBe(STAGING_NEW_STACK_DEFAULT_DOMAINS.length);
    // Tout domaine activé par défaut DOIT être un domaine migré (sinon routage vers l'inexistant).
    for (const d of EDGE_DEFAULT_ENABLED) expect(MIGRATED_DOMAINS).toContain(d);
  });

  it("domainFromTrpcPath/domainsFromTrpcPath extraient le(s) domaine(s) ; vide hors /api/trpc", () => {
    expect(domainFromTrpcPath("/api/trpc/articles.list")).toBe("articles");
    expect(domainsFromTrpcPath("/api/trpc/articles.list")).toEqual(["articles"]);
    // batch httpBatchLink : plusieurs domaines
    expect(domainsFromTrpcPath("/api/trpc/vehicules.list,clients.getById")).toEqual(["vehicules", "clients"]);
    expect(domainFromTrpcPath("/api/auth/login")).toBeNull();
    expect(domainsFromTrpcPath("/")).toEqual([]);
  });

  it("activé par défaut (DEFAULT_ENABLED) : un domaine à parité vérifiée → new-stack sans env", () => {
    expect(decideTarget(`/api/trpc/${DEFAULT_ON}.list`, {})).toBe("new-stack");
  });

  it("OFF par défaut : un domaine migré NON activé part en legacy ; activé via NEW_STACK_DOMAINS → new-stack", () => {
    expect(decideTarget(`/api/trpc/${NON_DEFAULT}.list`, {})).toBe("legacy");
    expect(decideTarget(`/api/trpc/${NON_DEFAULT}.list`, { NEW_STACK_DOMAINS: NON_DEFAULT })).toBe("new-stack");
  });

  it("batch : new-stack seulement si TOUS les domaines sont activés ; mixte → legacy (sûreté)", () => {
    // vehicules activé par défaut + notifications activé par défaut → batch entièrement new-stack
    expect(decideTarget("/api/trpc/vehicules.list,notifications.list", {})).toBe("new-stack");
    // vehicules (ON) + NON_DEFAULT (OFF, non activé par défaut) → batch mixte → legacy (legacy sert tout)
    expect(decideTarget(`/api/trpc/vehicules.list,${NON_DEFAULT}.list`, {})).toBe("legacy");
  });

  it("domaine non porté → legacy même si listé (sûreté)", () => {
    // `integrationsComptables` n'est pas (encore) porté dans le new-stack → reste legacy même listé via env.
    expect(decideTarget("/api/trpc/integrationsComptables.list", { NEW_STACK_DOMAINS: "integrationsComptables" })).toBe("legacy");
  });

  it("hors-tRPC NON migré → legacy (auth, webhooks, front, uploads)", () => {
    const env = { NEW_STACK_DOMAINS: NON_DEFAULT };
    expect(decideTarget("/api/auth/login", env)).toBe("legacy");
    expect(decideTarget("/api/webhooks/stripe", env)).toBe("legacy");
    expect(decideTarget("/", env)).toBe("legacy");
  });

  it("routes HORS-tRPC migrées (edge == src) : `.ics` → new-stack ; chemins voisins → legacy", () => {
    // parité anti-drift du registre de routes HORS-tRPC
    expect(EDGE_MIGRATED_ROUTES.map((r) => r.name).sort()).toEqual(SRC_MIGRATED_ROUTES.map((r) => r.name).sort());
    // flux iCal public → new-stack (le jeton EST la capacité, pas de cookie)
    expect(decideTarget("/api/calendar/abc123def456.ics", {})).toBe("new-stack");
    expect(matchesMigratedRoute("/api/calendar/abc123def456.ics")).toBe(true);
    // webhook Stripe signé → new-stack
    expect(decideTarget("/api/stripe/webhook", {})).toBe("new-stack");
    expect(matchesMigratedRoute("/api/stripe/webhook")).toBe(true);
    // upload logo (auth cookie) → new-stack
    expect(decideTarget("/api/upload-logo", {})).toBe("new-stack");
    expect(matchesMigratedRoute("/api/upload-logo")).toBe(true);
    // exports comptabilité (auth cookie) → new-stack (Factur-X traité plus bas)
    expect(decideTarget("/api/comptabilite/fec", {})).toBe("new-stack");
    expect(decideTarget("/api/comptabilite/export-csv", {})).toBe("new-stack");
    // paiement (public par token) → new-stack
    expect(decideTarget("/api/paiement/status/42", {})).toBe("new-stack");
    expect(decideTarget("/api/paiement/create-checkout-session", {})).toBe("new-stack");
    // recherche catalogue public → new-stack ; categories (dead) pas migré → legacy
    expect(decideTarget("/api/articles/search", {})).toBe("new-stack");
    expect(decideTarget("/api/articles/categories", {})).toBe("legacy");
    // assistant/voix AGENTIQUE basculés : assistant/stream (SSE) + voice/tool + voice/token + voice/persist → new-stack
    expect(decideTarget("/api/voice/persist", {})).toBe("new-stack");
    expect(decideTarget("/api/voice/token", {})).toBe("new-stack");
    expect(decideTarget("/api/voice/tool", {})).toBe("new-stack");
    expect(decideTarget("/api/assistant/stream", {})).toBe("new-stack");
    // PDF bon de commande (auth cookie) → new-stack ; chemin voisin sans /pdf → legacy
    expect(decideTarget("/api/commandes-fournisseurs/42/pdf", {})).toBe("new-stack");
    expect(decideTarget("/api/commandes-fournisseurs/42", {})).toBe("legacy");
    expect(decideTarget("/api/contrats/7/pdf", {})).toBe("new-stack");
    expect(decideTarget("/api/contrats/7", {})).toBe("legacy");
    expect(decideTarget("/api/interventions/9/bon-pdf", {})).toBe("new-stack");
    expect(decideTarget("/api/interventions/9", {})).toBe("legacy"); // tRPC interventions (legacy)
    // PDF devis portail (public par token) → new-stack
    expect(decideTarget("/api/portail/abc123/devis/42/pdf", {})).toBe("new-stack");
    expect(decideTarget("/api/portail/abc123/devis/42", {})).toBe("legacy"); // pas le PDF
    expect(decideTarget("/api/portail/abc123/factures/42/pdf", {})).toBe("new-stack");
    // Factur-X (auth cookie) → new-stack ; XML et PDF distincts, pas de collision de motif
    expect(decideTarget("/api/comptabilite/facturx-xml/42", {})).toBe("new-stack");
    expect(decideTarget("/api/comptabilite/facturx/42", {})).toBe("new-stack");
    // exports en LOT (ZIP par période, auth cookie) → new-stack ; pas de collision avec facturx/:id
    expect(decideTarget("/api/comptabilite/export-facturx-lot", {})).toBe("new-stack");
    expect(decideTarget("/api/comptabilite/export-pdf-lot", {})).toBe("new-stack");
    // polices Roboto (PUBLIC, statique) → new-stack ; nom vide → legacy
    expect(decideTarget("/api/fonts/roboto-regular.ttf", {})).toBe("new-stack");
    expect(decideTarget("/api/fonts/roboto-bold.ttf", {})).toBe("new-stack");
    expect(matchesMigratedRoute("/api/fonts/")).toBe(false);
    // chemins voisins NON migrés → legacy
    expect(decideTarget("/api/calendar/abc.json", {})).toBe("legacy"); // pas .ics
    expect(decideTarget("/api/calendar.ics", {})).toBe("legacy"); // pas le bon préfixe
    expect(decideTarget("/api/stripe/webhook/extra", {})).toBe("legacy"); // pas exact
    expect(matchesMigratedRoute("/api/calendar/")).toBe(false);
  });

  it("isolation : activer un domaine n'en détourne pas un autre", () => {
    // `articles` + NON_DEFAULT ne sont PAS activés par défaut → on teste l'isolation via env.
    const env = { NEW_STACK_DOMAINS: "articles" };
    expect(decideTarget("/api/trpc/articles.list", env)).toBe("new-stack");
    expect(decideTarget(`/api/trpc/${NON_DEFAULT}.list`, env)).toBe("legacy");
  });
});
