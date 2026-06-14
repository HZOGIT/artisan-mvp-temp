import { describe, it, expect } from "vitest";
import { shouldRouteToNewStack, domainFromTrpcPath } from "./router-decision";
import { parseFlagsFromEnv, NO_FLAGS, type FeatureFlags } from "./flags";
import { MIGRATED_DOMAINS, isMigratedDomainAvailable } from "./migrated-domains";

describe("shouldRouteToNewStack", () => {
  it("OFF par défaut : aucun flag → legacy", () => {
    expect(shouldRouteToNewStack("vehicules", 1, NO_FLAGS)).toBe(false);
    expect(shouldRouteToNewStack("factures", undefined, NO_FLAGS)).toBe(false);
  });

  it("flag enabled global → nouveau stack pour tous les tenants", () => {
    const flags: FeatureFlags = { vehicules: { enabled: true } };
    expect(shouldRouteToNewStack("vehicules", 1, flags)).toBe(true);
    expect(shouldRouteToNewStack("vehicules", 999, flags)).toBe(true);
    // un autre domaine reste legacy
    expect(shouldRouteToNewStack("factures", 1, flags)).toBe(false);
  });

  it("canary : allowlist tenant active le nouveau stack même si enabled=false", () => {
    const flags: FeatureFlags = { vehicules: { enabled: false, tenantAllowlist: [12, 34] } };
    expect(shouldRouteToNewStack("vehicules", 12, flags)).toBe(true);
    expect(shouldRouteToNewStack("vehicules", 99, flags)).toBe(false);
    expect(shouldRouteToNewStack("vehicules", undefined, flags)).toBe(false);
  });

  it("denylist : rollback ciblé prioritaire sur enabled global", () => {
    const flags: FeatureFlags = { vehicules: { enabled: true, tenantDenylist: [7] } };
    expect(shouldRouteToNewStack("vehicules", 7, flags)).toBe(false);
    expect(shouldRouteToNewStack("vehicules", 8, flags)).toBe(true);
  });
});

describe("bascule du domaine avis (flag gateway)", () => {
  it("avis routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    // OFF par défaut
    expect(shouldRouteToNewStack("avis", 5, NO_FLAGS)).toBe(false);
    // canary : seul le tenant allowlisté bascule
    const canary: FeatureFlags = { avis: { enabled: false, tenantAllowlist: [5] } };
    expect(shouldRouteToNewStack("avis", 5, canary)).toBe(true);
    expect(shouldRouteToNewStack("avis", 6, canary)).toBe(false);
    // global enabled + rollback ciblé prioritaire
    const global: FeatureFlags = { avis: { enabled: true, tenantDenylist: [9] } };
    expect(shouldRouteToNewStack("avis", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("avis", 9, global)).toBe(false);
  });

  it("le chemin tRPC du workflow avis extrait bien le domaine", () => {
    expect(domainFromTrpcPath("avis.envoyerDemandeParClient")).toBe("avis");
    expect(domainFromTrpcPath("/avis.moderer")).toBe("avis");
  });

  it("parse env : avis enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "vehicules,avis" } as NodeJS.ProcessEnv).avis).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_AVIS: "5,5" } as NodeJS.ProcessEnv).avis?.tenantAllowlist).toEqual([5, 5]);
  });
});

describe("bascule du domaine badges (flag gateway)", () => {
  it("badges routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("badges", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { badges: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("badges", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("badges", 8, canary)).toBe(false);
    const global: FeatureFlags = { badges: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("badges", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("badges", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine badges extraient bien le domaine", () => {
    expect(domainFromTrpcPath("badges.attribuerBadge")).toBe("badges");
    expect(domainFromTrpcPath("/badges.calculerClassement")).toBe("badges");
  });

  it("parse env : badges enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "badges" } as NodeJS.ProcessEnv).badges).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_BADGES: "7" } as NodeJS.ProcessEnv).badges?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine techniciens (flag gateway)", () => {
  it("techniciens routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("techniciens", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { techniciens: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("techniciens", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("techniciens", 8, canary)).toBe(false);
    const global: FeatureFlags = { techniciens: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("techniciens", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("techniciens", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine techniciens extraient bien le domaine", () => {
    expect(domainFromTrpcPath("techniciens.setDisponibilite")).toBe("techniciens");
    expect(domainFromTrpcPath("/techniciens.enregistrerPosition")).toBe("techniciens");
  });

  it("parse env : techniciens enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "techniciens" } as NodeJS.ProcessEnv).techniciens).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_TECHNICIENS: "7" } as NodeJS.ProcessEnv).techniciens?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine notifications (flag gateway)", () => {
  it("notifications routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("notifications", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { notifications: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("notifications", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("notifications", 8, canary)).toBe(false);
    const global: FeatureFlags = { notifications: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("notifications", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("notifications", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine notifications extraient bien le domaine", () => {
    expect(domainFromTrpcPath("notifications.markAsRead")).toBe("notifications");
    expect(domainFromTrpcPath("/notifications.generateOverdueReminders")).toBe("notifications");
  });

  it("parse env : notifications enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "notifications" } as NodeJS.ProcessEnv).notifications).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_NOTIFICATIONS: "7" } as NodeJS.ProcessEnv).notifications?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine fournisseurs (flag gateway)", () => {
  it("fournisseurs routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("fournisseurs", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { fournisseurs: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("fournisseurs", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("fournisseurs", 8, canary)).toBe(false);
    const global: FeatureFlags = { fournisseurs: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("fournisseurs", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("fournisseurs", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine fournisseurs extraient bien le domaine", () => {
    expect(domainFromTrpcPath("fournisseurs.associateArticle")).toBe("fournisseurs");
    expect(domainFromTrpcPath("/fournisseurs.getArticleFournisseurs")).toBe("fournisseurs");
  });

  it("parse env : fournisseurs enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "fournisseurs" } as NodeJS.ProcessEnv).fournisseurs).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_FOURNISSEURS: "7" } as NodeJS.ProcessEnv).fournisseurs?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine commandes (flag gateway)", () => {
  it("commandes routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("commandes", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { commandes: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("commandes", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("commandes", 8, canary)).toBe(false);
    const global: FeatureFlags = { commandes: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("commandes", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("commandes", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine commandes extraient bien le domaine", () => {
    expect(domainFromTrpcPath("commandes.recevoir")).toBe("commandes");
    expect(domainFromTrpcPath("/commandes.setStatutFacturation")).toBe("commandes");
  });

  it("parse env : commandes enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "commandes" } as NodeJS.ProcessEnv).commandes).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_COMMANDES: "7" } as NodeJS.ProcessEnv).commandes?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine stocks (flag gateway)", () => {
  it("stocks routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("stocks", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { stocks: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("stocks", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("stocks", 8, canary)).toBe(false);
    const global: FeatureFlags = { stocks: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("stocks", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("stocks", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine stocks extraient bien le domaine (dont la voie sensible adjustQuantity)", () => {
    expect(domainFromTrpcPath("stocks.adjustQuantity")).toBe("stocks");
    expect(domainFromTrpcPath("/stocks.getMouvements")).toBe("stocks");
  });

  it("parse env : stocks enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "stocks" } as NodeJS.ProcessEnv).stocks).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_STOCKS: "7" } as NodeJS.ProcessEnv).stocks?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine clients (flag gateway)", () => {
  it("clients routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("clients", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { clients: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("clients", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("clients", 8, canary)).toBe(false);
    const global: FeatureFlags = { clients: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("clients", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("clients", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine clients extraient bien le domaine (dont search / encours)", () => {
    expect(domainFromTrpcPath("clients.search")).toBe("clients");
    expect(domainFromTrpcPath("/clients.getEncours")).toBe("clients");
  });

  it("parse env : clients enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "clients" } as NodeJS.ProcessEnv).clients).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_CLIENTS: "7" } as NodeJS.ProcessEnv).clients?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine interventions (flag gateway)", () => {
  it("interventions routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("interventions", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { interventions: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("interventions", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("interventions", 8, canary)).toBe(false);
    const global: FeatureFlags = { interventions: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("interventions", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("interventions", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine interventions extraient bien le domaine (dont getMine)", () => {
    expect(domainFromTrpcPath("interventions.getMine")).toBe("interventions");
    expect(domainFromTrpcPath("/interventions.create")).toBe("interventions");
  });

  it("parse env : interventions enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "interventions" } as NodeJS.ProcessEnv).interventions).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_INTERVENTIONS: "7" } as NodeJS.ProcessEnv).interventions?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine conges (flag gateway)", () => {
  it("conges routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("conges", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { conges: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("conges", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("conges", 8, canary)).toBe(false);
    const global: FeatureFlags = { conges: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("conges", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("conges", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine conges extraient bien le domaine (dont le workflow approuver)", () => {
    expect(domainFromTrpcPath("conges.approuver")).toBe("conges");
    expect(domainFromTrpcPath("/conges.annuler")).toBe("conges");
  });

  it("parse env : conges enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "conges" } as NodeJS.ProcessEnv).conges).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_CONGES: "7" } as NodeJS.ProcessEnv).conges?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine notesDeFrais (flag gateway)", () => {
  it("notesDeFrais routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("notesDeFrais", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { notesDeFrais: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("notesDeFrais", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("notesDeFrais", 8, canary)).toBe(false);
    const global: FeatureFlags = { notesDeFrais: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("notesDeFrais", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("notesDeFrais", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine notesDeFrais extraient bien le domaine (dont approuver/payer)", () => {
    expect(domainFromTrpcPath("notesDeFrais.approuver")).toBe("notesDeFrais");
    expect(domainFromTrpcPath("/notesDeFrais.payer")).toBe("notesDeFrais");
  });

  it("parse env : notesDeFrais enabled via NEW_STACK_DOMAINS (la casse du nom est préservée)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "notesDeFrais" } as NodeJS.ProcessEnv).notesDeFrais).toEqual({ enabled: true });
    // NB historique (corrigé depuis — cf. describe « canary env camelCase recanonicalisé ») :
    // (le parseur lowercase le suffixe → clé `notesdefrais`) — limitation tracée comme finding.
  });
});

describe("bascule du domaine chantiers (flag gateway)", () => {
  it("chantiers routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("chantiers", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { chantiers: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("chantiers", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("chantiers", 8, canary)).toBe(false);
    const global: FeatureFlags = { chantiers: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("chantiers", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("chantiers", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine chantiers extraient bien le domaine", () => {
    expect(domainFromTrpcPath("chantiers.create")).toBe("chantiers");
    expect(domainFromTrpcPath("/chantiers.update")).toBe("chantiers");
  });

  it("parse env : chantiers enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "chantiers" } as NodeJS.ProcessEnv).chantiers).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_CHANTIERS: "7" } as NodeJS.ProcessEnv).chantiers?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine depenses (flag gateway)", () => {
  it("depenses routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("depenses", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { depenses: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("depenses", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("depenses", 8, canary)).toBe(false);
    const global: FeatureFlags = { depenses: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("depenses", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("depenses", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine depenses extraient bien le domaine", () => {
    expect(domainFromTrpcPath("depenses.create")).toBe("depenses");
    expect(domainFromTrpcPath("/depenses.update")).toBe("depenses");
  });

  it("parse env : depenses enabled + canary (lowercase → canary env fonctionnel)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "depenses" } as NodeJS.ProcessEnv).depenses).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_DEPENSES: "7" } as NodeJS.ProcessEnv).depenses?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine devis (flag gateway)", () => {
  it("devis routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("devis", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { devis: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("devis", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("devis", 8, canary)).toBe(false);
    const global: FeatureFlags = { devis: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("devis", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("devis", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine devis extraient bien le domaine", () => {
    expect(domainFromTrpcPath("devis.create")).toBe("devis");
    expect(domainFromTrpcPath("/devis.accepter")).toBe("devis");
  });

  it("parse env : devis enabled + canary (lowercase → canary env fonctionnel)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "devis" } as NodeJS.ProcessEnv).devis).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_DEVIS: "7" } as NodeJS.ProcessEnv).devis?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine factures (flag gateway)", () => {
  it("factures routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("factures", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { factures: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("factures", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("factures", 8, canary)).toBe(false);
    const global: FeatureFlags = { factures: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("factures", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("factures", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine factures extraient bien le domaine", () => {
    expect(domainFromTrpcPath("factures.create")).toBe("factures");
    expect(domainFromTrpcPath("/factures.convertirDepuisDevis")).toBe("factures");
  });

  it("parse env : factures enabled + canary (lowercase → canary env fonctionnel)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "factures" } as NodeJS.ProcessEnv).factures).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_FACTURES: "7" } as NodeJS.ProcessEnv).factures?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine ecritures (flag gateway)", () => {
  it("ecritures routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("ecritures", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { ecritures: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("ecritures", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("ecritures", 8, canary)).toBe(false);
    const global: FeatureFlags = { ecritures: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("ecritures", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("ecritures", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine ecritures extraient bien le domaine", () => {
    expect(domainFromTrpcPath("ecritures.list")).toBe("ecritures");
    expect(domainFromTrpcPath("/ecritures.exportFec")).toBe("ecritures");
  });

  it("parse env : ecritures enabled + canary (lowercase → canary env fonctionnel)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "ecritures" } as NodeJS.ProcessEnv).ecritures).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_ECRITURES: "7" } as NodeJS.ProcessEnv).ecritures?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine articles (flag gateway)", () => {
  it("articles routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("articles", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { articles: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("articles", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("articles", 8, canary)).toBe(false);
    const global: FeatureFlags = { articles: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("articles", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("articles", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine articles extraient bien le domaine", () => {
    expect(domainFromTrpcPath("articles.create")).toBe("articles");
    expect(domainFromTrpcPath("/articles.byCategorie")).toBe("articles");
  });

  it("parse env : articles enabled + canary (lowercase → canary env fonctionnel)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "articles" } as NodeJS.ProcessEnv).articles).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_ARTICLES: "7" } as NodeJS.ProcessEnv).articles?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine parametres (flag gateway)", () => {
  it("parametres routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("parametres", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { parametres: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("parametres", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("parametres", 8, canary)).toBe(false);
    const global: FeatureFlags = { parametres: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("parametres", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("parametres", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine parametres extraient bien le domaine", () => {
    expect(domainFromTrpcPath("parametres.get")).toBe("parametres");
    expect(domainFromTrpcPath("/parametres.update")).toBe("parametres");
  });

  it("parse env : parametres enabled + canary (lowercase → canary env fonctionnel)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "parametres" } as NodeJS.ProcessEnv).parametres).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_PARAMETRES: "7" } as NodeJS.ProcessEnv).parametres?.tenantAllowlist).toEqual([7]);
  });
});

describe("bascule du domaine modelesEmail (flag gateway)", () => {
  it("modelesEmail routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("modelesEmail", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { modelesEmail: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("modelesEmail", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("modelesEmail", 8, canary)).toBe(false);
    const global: FeatureFlags = { modelesEmail: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("modelesEmail", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("modelesEmail", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine modelesEmail extraient bien le domaine", () => {
    expect(domainFromTrpcPath("modelesEmail.create")).toBe("modelesEmail");
    expect(domainFromTrpcPath("/modelesEmail.byType")).toBe("modelesEmail");
  });

  it("parse env : modelesEmail enabled via NEW_STACK_DOMAINS (la casse du nom est préservée)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "modelesEmail" } as NodeJS.ProcessEnv).modelesEmail).toEqual({ enabled: true });
    // NB historique (corrigé depuis — cf. describe « canary env camelCase recanonicalisé ») :
    // (le parseur lowercase le suffixe → clé `modelesemail`) — même limitation que notesDeFrais.
  });
});

describe("bascule du domaine modelesDevis (flag gateway)", () => {
  it("modelesDevis routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("modelesDevis", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { modelesDevis: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("modelesDevis", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("modelesDevis", 8, canary)).toBe(false);
    const global: FeatureFlags = { modelesDevis: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("modelesDevis", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("modelesDevis", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine modelesDevis extraient bien le domaine", () => {
    expect(domainFromTrpcPath("modelesDevis.create")).toBe("modelesDevis");
    expect(domainFromTrpcPath("/modelesDevis.getById")).toBe("modelesDevis");
  });

  it("parse env : modelesDevis enabled via NEW_STACK_DOMAINS (la casse du nom est préservée)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "modelesDevis" } as NodeJS.ProcessEnv).modelesDevis).toEqual({ enabled: true });
    // NB historique (corrigé depuis — cf. describe « canary env camelCase recanonicalisé ») :
    // (le parseur lowercase le suffixe → clé `modelesdevis`) — même limitation que notesDeFrais.
  });
});

describe("bascule du domaine configRelances (flag gateway)", () => {
  it("configRelances routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("configRelances", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { configRelances: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("configRelances", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("configRelances", 8, canary)).toBe(false);
    const global: FeatureFlags = { configRelances: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("configRelances", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("configRelances", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine configRelances extraient bien le domaine", () => {
    expect(domainFromTrpcPath("configRelances.get")).toBe("configRelances");
    expect(domainFromTrpcPath("/configRelances.update")).toBe("configRelances");
  });

  it("parse env : configRelances enabled via NEW_STACK_DOMAINS (la casse du nom est préservée)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "configRelances" } as NodeJS.ProcessEnv).configRelances).toEqual({ enabled: true });
    // NB historique (corrigé depuis — cf. describe « canary env camelCase recanonicalisé ») :
    // (le parseur lowercase le suffixe → clé `configrelances`) — même limitation que notesDeFrais.
  });
});

describe("bascule du domaine rdvEnLigne (flag gateway)", () => {
  it("rdvEnLigne routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("rdvEnLigne", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { rdvEnLigne: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("rdvEnLigne", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("rdvEnLigne", 8, canary)).toBe(false);
    const global: FeatureFlags = { rdvEnLigne: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("rdvEnLigne", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("rdvEnLigne", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine rdvEnLigne extraient bien le domaine (dont confirmer/refuser)", () => {
    expect(domainFromTrpcPath("rdvEnLigne.create")).toBe("rdvEnLigne");
    expect(domainFromTrpcPath("/rdvEnLigne.confirmer")).toBe("rdvEnLigne");
  });

  it("parse env : rdvEnLigne enabled via NEW_STACK_DOMAINS (la casse du nom est préservée)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "rdvEnLigne" } as NodeJS.ProcessEnv).rdvEnLigne).toEqual({ enabled: true });
    // NB historique (corrigé depuis — cf. describe « canary env camelCase recanonicalisé ») :
    // (le parseur lowercase le suffixe → clé `rdvenligne`) — même limitation que notesDeFrais.
  });
});

describe("bascule du domaine relancesDevis (flag gateway)", () => {
  it("relancesDevis routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("relancesDevis", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { relancesDevis: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("relancesDevis", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("relancesDevis", 8, canary)).toBe(false);
    const global: FeatureFlags = { relancesDevis: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("relancesDevis", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("relancesDevis", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine relancesDevis extraient bien le domaine", () => {
    expect(domainFromTrpcPath("relancesDevis.create")).toBe("relancesDevis");
    expect(domainFromTrpcPath("/relancesDevis.byDevis")).toBe("relancesDevis");
  });

  it("parse env : relancesDevis enabled via NEW_STACK_DOMAINS (la casse du nom est préservée)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "relancesDevis" } as NodeJS.ProcessEnv).relancesDevis).toEqual({ enabled: true });
    // NB historique (corrigé depuis — cf. describe « canary env camelCase recanonicalisé ») :
    // (le parseur lowercase le suffixe → clé `relancesdevis`) — même limitation que notesDeFrais.
  });
});

describe("bascule du domaine categoriesDepenses (flag gateway)", () => {
  it("categoriesDepenses routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("categoriesDepenses", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { categoriesDepenses: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("categoriesDepenses", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("categoriesDepenses", 8, canary)).toBe(false);
    const global: FeatureFlags = { categoriesDepenses: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("categoriesDepenses", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("categoriesDepenses", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine categoriesDepenses extraient bien le domaine", () => {
    expect(domainFromTrpcPath("categoriesDepenses.create")).toBe("categoriesDepenses");
    expect(domainFromTrpcPath("/categoriesDepenses.getById")).toBe("categoriesDepenses");
  });

  it("parse env : categoriesDepenses enabled via NEW_STACK_DOMAINS (la casse du nom est préservée)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "categoriesDepenses" } as NodeJS.ProcessEnv).categoriesDepenses).toEqual({ enabled: true });
    // NB historique (corrigé depuis — cf. describe « canary env camelCase recanonicalisé ») :
    // (le parseur lowercase le suffixe → clé `categoriesdepenses`) — même limitation que notesDeFrais.
  });
});

describe("bascule du domaine contratsMaintenance (flag gateway)", () => {
  it("contratsMaintenance routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("contratsMaintenance", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { contratsMaintenance: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("contratsMaintenance", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("contratsMaintenance", 8, canary)).toBe(false);
    const global: FeatureFlags = { contratsMaintenance: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("contratsMaintenance", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("contratsMaintenance", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine contratsMaintenance extraient bien le domaine (dont suspendre)", () => {
    expect(domainFromTrpcPath("contratsMaintenance.create")).toBe("contratsMaintenance");
    expect(domainFromTrpcPath("/contratsMaintenance.suspendre")).toBe("contratsMaintenance");
  });

  it("parse env : contratsMaintenance enabled via NEW_STACK_DOMAINS (la casse du nom est préservée)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "contratsMaintenance" } as NodeJS.ProcessEnv).contratsMaintenance).toEqual({ enabled: true });
    // NB historique (corrigé depuis — cf. describe « canary env camelCase recanonicalisé ») :
    // (le parseur lowercase le suffixe → clé `contratsmaintenance`) — même limitation que notesDeFrais.
  });
});

describe("bascule du domaine demandesContact (flag gateway)", () => {
  it("demandesContact routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("demandesContact", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { demandesContact: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("demandesContact", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("demandesContact", 8, canary)).toBe(false);
    const global: FeatureFlags = { demandesContact: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("demandesContact", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("demandesContact", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine demandesContact extraient bien le domaine (dont convertir)", () => {
    expect(domainFromTrpcPath("demandesContact.create")).toBe("demandesContact");
    expect(domainFromTrpcPath("/demandesContact.convertir")).toBe("demandesContact");
  });

  it("parse env : demandesContact enabled via NEW_STACK_DOMAINS (la casse du nom est préservée)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "demandesContact" } as NodeJS.ProcessEnv).demandesContact).toEqual({ enabled: true });
    // NB historique (corrigé depuis — cf. describe « canary env camelCase recanonicalisé ») :
    // (le parseur lowercase le suffixe → clé `demandescontact`) — même limitation que notesDeFrais.
  });
});

describe("bascule du domaine budgetsCategories (flag gateway)", () => {
  it("budgetsCategories routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("budgetsCategories", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { budgetsCategories: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("budgetsCategories", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("budgetsCategories", 8, canary)).toBe(false);
    const global: FeatureFlags = { budgetsCategories: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("budgetsCategories", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("budgetsCategories", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine budgetsCategories extraient bien le domaine (dont byMois)", () => {
    expect(domainFromTrpcPath("budgetsCategories.create")).toBe("budgetsCategories");
    expect(domainFromTrpcPath("/budgetsCategories.byMois")).toBe("budgetsCategories");
  });

  it("parse env : budgetsCategories enabled via NEW_STACK_DOMAINS (la casse du nom est préservée)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "budgetsCategories" } as NodeJS.ProcessEnv).budgetsCategories).toEqual({ enabled: true });
    // NB historique (corrigé depuis — cf. describe « canary env camelCase recanonicalisé ») :
    // (le parseur lowercase le suffixe → clé `budgetscategories`) — même limitation que notesDeFrais.
  });
});

describe("bascule du domaine reglesCategorisation (flag gateway)", () => {
  it("reglesCategorisation routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("reglesCategorisation", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { reglesCategorisation: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("reglesCategorisation", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("reglesCategorisation", 8, canary)).toBe(false);
    const global: FeatureFlags = { reglesCategorisation: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("reglesCategorisation", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("reglesCategorisation", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine reglesCategorisation extraient bien le domaine", () => {
    expect(domainFromTrpcPath("reglesCategorisation.create")).toBe("reglesCategorisation");
    expect(domainFromTrpcPath("/reglesCategorisation.getById")).toBe("reglesCategorisation");
  });

  it("parse env : reglesCategorisation enabled via NEW_STACK_DOMAINS (la casse du nom est préservée)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "reglesCategorisation" } as NodeJS.ProcessEnv).reglesCategorisation).toEqual({ enabled: true });
    // NB historique (corrigé depuis — cf. describe « canary env camelCase recanonicalisé ») :
    // (le parseur lowercase le suffixe → clé `reglescategorisation`) — même limitation que notesDeFrais.
  });
});

describe("bascule du domaine previsionsCA (flag gateway)", () => {
  it("previsionsCA routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("previsionsCA", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { previsionsCA: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("previsionsCA", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("previsionsCA", 8, canary)).toBe(false);
    const global: FeatureFlags = { previsionsCA: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("previsionsCA", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("previsionsCA", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine previsionsCA extraient bien le domaine (dont byAnnee)", () => {
    expect(domainFromTrpcPath("previsionsCA.create")).toBe("previsionsCA");
    expect(domainFromTrpcPath("/previsionsCA.byAnnee")).toBe("previsionsCA");
  });

  it("parse env : previsionsCA enabled via NEW_STACK_DOMAINS (la casse du nom est préservée)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "previsionsCA" } as NodeJS.ProcessEnv).previsionsCA).toEqual({ enabled: true });
    // NB historique (corrigé depuis — cf. describe « canary env camelCase recanonicalisé ») :
    // (le parseur lowercase le suffixe → clé `previsionsca`) — même limitation que notesDeFrais.
  });
});

describe("canary env camelCase recanonicalisé (NEW_STACK_CANARY_<DOMAINE>)", () => {
  it("recanonicalise le suffixe lowercased vers le nom réel du domaine (camelCase) via le registre", () => {
    // Avant correction, le suffixe était lowercasé → clé `budgetscategories` ≠ domaine `budgetsCategories`.
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_BUDGETSCATEGORIES: "7" } as NodeJS.ProcessEnv).budgetsCategories?.tenantAllowlist).toEqual([7]);
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_REGLESCATEGORISATION: "7,8" } as NodeJS.ProcessEnv).reglesCategorisation?.tenantAllowlist).toEqual([7, 8]);
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_PREVISIONSCA: "9" } as NodeJS.ProcessEnv).previsionsCA?.tenantAllowlist).toEqual([9]);
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_NOTESDEFRAIS: "3" } as NodeJS.ProcessEnv).notesDeFrais?.tenantAllowlist).toEqual([3]);
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_RDVENLIGNE: "5" } as NodeJS.ProcessEnv).rdvEnLigne?.tenantAllowlist).toEqual([5]);
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_MODELESEMAIL: "2" } as NodeJS.ProcessEnv).modelesEmail?.tenantAllowlist).toEqual([2]);
  });

  it("le canary camelCase pilote bien la bascule (shouldRouteToNewStack)", () => {
    const flags = parseFlagsFromEnv({ NEW_STACK_CANARY_BUDGETSCATEGORIES: "7" } as NodeJS.ProcessEnv);
    expect(shouldRouteToNewStack("budgetsCategories", 7, flags)).toBe(true);
    expect(shouldRouteToNewStack("budgetsCategories", 8, flags)).toBe(false);
  });

  it("un suffixe inconnu (hors registre) retombe sur la clé minuscule (rétro-compat)", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_SUPPORT: "1" } as NodeJS.ProcessEnv).support?.tenantAllowlist).toEqual([1]);
  });
});

describe("registre des domaines migrés", () => {
  it("les 30 domaines portés sont éligibles à la bascule, pas un domaine non porté", () => {
    for (const d of ["vehicules", "avis", "badges", "techniciens", "notifications", "fournisseurs", "commandes", "stocks", "clients", "interventions", "conges", "notesDeFrais", "chantiers", "depenses", "devis", "factures", "ecritures", "articles", "parametres", "modelesEmail", "modelesDevis", "configRelances", "rdvEnLigne", "relancesDevis", "categoriesDepenses", "contratsMaintenance", "demandesContact", "budgetsCategories", "reglesCategorisation", "previsionsCA"]) {
      expect(MIGRATED_DOMAINS).toContain(d);
      expect(isMigratedDomainAvailable(d)).toBe(true);
    }
    expect(isMigratedDomainAvailable("support")).toBe(false);
  });
});

describe("domainFromTrpcPath", () => {
  it("extrait le domaine du chemin tRPC", () => {
    expect(domainFromTrpcPath("vehicules.list")).toBe("vehicules");
    expect(domainFromTrpcPath("/factures.getById")).toBe("factures");
  });
  it("null si pas de préfixe de domaine", () => {
    expect(domainFromTrpcPath("health")).toBeNull();
    expect(domainFromTrpcPath(".list")).toBeNull();
    expect(domainFromTrpcPath("")).toBeNull();
  });
});

describe("parseFlagsFromEnv", () => {
  it("NEW_STACK_DOMAINS → domaines enabled globalement", () => {
    const flags = parseFlagsFromEnv({ NEW_STACK_DOMAINS: "vehicules, badges" } as NodeJS.ProcessEnv);
    expect(flags.vehicules).toEqual({ enabled: true });
    expect(flags.badges).toEqual({ enabled: true });
    expect(flags.factures).toBeUndefined();
  });

  it("NEW_STACK_CANARY_<DOMAINE> → allowlist tenants", () => {
    const flags = parseFlagsFromEnv({ NEW_STACK_CANARY_VEHICULES: "12, 34" } as NodeJS.ProcessEnv);
    expect(flags.vehicules?.tenantAllowlist).toEqual([12, 34]);
    expect(flags.vehicules?.enabled).toBe(false);
  });

  it("env vide → aucun flag", () => {
    expect(parseFlagsFromEnv({} as NodeJS.ProcessEnv)).toEqual({});
  });
});
