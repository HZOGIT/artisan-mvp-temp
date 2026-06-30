import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "./app";
import { MIGRATED_DOMAINS, type MigratedDomain } from "./interface/gateway/migrated-domains";

// buildApp() construit les repos Drizzle par défaut (→ getDbHandle()) : nécessite une URL de base.
// Sans DB, on skippe proprement (comme les e2e `.skipIf(!URL)`) plutôt que de planter la collecte.
const HAS_DB = !!(process.env.APP_DATABASE_URL || process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("app Fastify (scaffold + tRPC)", () => {
  let app: ReturnType<typeof buildApp>;
  beforeAll(() => {
    app = buildApp();
  });
  afterAll(() => app?.close());

  it("GET /health → 200 { status: 'ok' }", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("route inconnue → 404", async () => {
    const res = await app.inject({ method: "GET", url: "/inexistant" });
    expect(res.statusCode).toBe(404);
  });

  it("tRPC: GET /api/trpc/health → 200 (procedure publique servie)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/trpc/health" });
    expect(res.statusCode).toBe(200);
    // Format tRPC v11 (non-batché) + transformer superjson : { result: { data: { json: { status: 'ok' } } } }
    expect(res.json()).toMatchObject({ result: { data: { json: { status: "ok" } } } });
  });

  it("tRPC: une procédure inexistante → 404", async () => {
    const res = await app.inject({ method: "GET", url: "/api/trpc/nope" });
    expect(res.statusCode).toBe(404);
  });

  it("tRPC: batch LONG (chemin > 100 car.) → route matchée, PAS un 404 Fastify (régression maxParamLength)", async () => {
    // `httpBatchLink` concatène les procédures dans le segment d'URL : /api/trpc/p1,p2,…,pN.
    // Le défaut find-my-way (maxParamLength=100) 404-erait ce chemin AVANT le handler tRPC → le
    // client recevrait un 404 sur tout le lot (dashboard sans données, portail « expiré »).
    const procs = [
      "clients.list", "factures.list", "devis.list", "interventions.list",
      "notifications.list", "artisan.getProfile", "modules.getMine", "dashboard.getStats",
    ].join(",");
    expect(procs.length).toBeGreaterThan(100);
    const res = await app.inject({ method: "GET", url: `/api/trpc/${procs}?batch=1&input=%7B%7D` });
    // Sans cookie → 401 (auth requise) ou réponses d'erreur par procédure ; surtout PAS un 404
    // « route not found » (qui signifierait que la route Fastify n'a pas matché).
    expect(res.statusCode).not.toBe(404);
  });

  // Garde-fou bascule : chaque domaine du registre MIGRATED_DOMAINS est réellement monté
  // dans le nouveau stack (procédure `list` présente → 401 auth requise, pas 404 inexistant).
  const sampleProcedure: Record<MigratedDomain, string> = { vehicules: "vehicules.list", avis: "avis.list", badges: "badges.list", techniciens: "techniciens.list", notifications: "notifications.list", fournisseurs: "fournisseurs.list", commandesFournisseurs: "commandesFournisseurs.list", stocks: "stocks.list", clients: "clients.list", interventions: "interventions.list", conges: "conges.list", notesDeFrais: "notesDeFrais.list", chantiers: "chantiers.list", depenses: "depenses.list", devis: "devis.list", factures: "factures.list", ecritures: "ecritures.list", articles: "articles.list", parametres: "parametres.get", modelesEmail: "modelesEmail.list", modelesDevis: "modelesDevis.list", configRelances: "configRelances.get", rdv: "rdv.list", relances: "relances.list", categoriesDepenses: "categoriesDepenses.list", contrats: "contrats.list", demandesContact: "demandesContact.list", budgetsCategories: "budgetsCategories.list", reglesCategorisation: "reglesCategorisation.list", previsions: "previsions.list", artisan: "artisan.getProfile", devisOptions: "devisOptions.getByDevisId", activites: "activites.list", modules: "modules.list", statistiques: "statistiques.getDevisStats", calendrier: "calendrier.getIcalFeed", emails: "emails.list", search: "search.global", geolocalisation: "geolocalisation.getPositions", dashboard: "dashboard.getStats", rapports: "rapports.list", utilisateurs: "utilisateurs.list", comptabilite: "comptabilite.getBalance", auth: "auth.me", subscription: "subscription.getCurrent", signature: "signature.getSignatureByDevis", conseilsIA: "conseilsIA", assistant: "assistant.getThreads", chat: "chat.getConversations", support: "support.contact", devices: "devices.list", alertesPrevisions: "alertesPrevisions.getConfig", importErp: "importErp.importClients", interventionsMobile: "interventionsMobile.getTodayInterventions", vitrine: "vitrine.getDemandesContact", clientPortal: "clientPortal.getStatus", integrationsComptables: "integrationsComptables.getConfig", devisIA: "devisIA.list", feedback: "feedback.submit", billing: "billing.previewPlanChange", platformAdmin: "platformAdmin.artisans.list", events: "events.list", einvoicing: "einvoicing.statutEntite", piecesJointes: "piecesJointes.listByDevis", connect: "connect.status" };
  for (const domain of MIGRATED_DOMAINS) {
    it(`domaine migré « ${domain} » monté dans le nouveau stack (≠ 404)`, async () => {
      const res = await app.inject({ method: "GET", url: `/api/trpc/${sampleProcedure[domain]}` });
      // `auth.me` est PUBLIC (renvoie l'utilisateur courant ou null) → 200 même sans cookie ; prouve
      // que le domaine est monté (≠ 404). `support.contact` est une MUTATION → GET = 405 (méthode non
      // supportée), ce qui prouve aussi qu'elle est montée (≠ 404). Les autres échantillons (queries
      // protégées) → 401.
      // `support`/`importErp` n'exposent que des MUTATIONS → GET = 405.
      const mutationOnly = domain === "support" || domain === "importErp" || domain === "feedback";
      const expected = domain === "auth" ? 200 : mutationOnly ? 405 : 401;
      expect(res.statusCode).toBe(expected);
    });
  }

  it("un domaine non migré (supportZZZ) n'est PAS monté → 404", async () => {
    const res = await app.inject({ method: "GET", url: "/api/trpc/supportZZZ.list" });
    expect(res.statusCode).toBe(404);
  });
});
