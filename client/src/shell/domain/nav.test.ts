import { describe, expect, it } from "vitest";
import {
  NAV_GROUPS, filterGroupByPermissions, filterGroupByModules, getAssistantContextForPath,
  formatRelativeDate, pathPermissionMap, MODULE_TO_LABELS,
} from "./nav";

const group = (id: string) => NAV_GROUPS.find((g) => g.id === id)!;

describe("shell/nav — domain pur (port fidèle DashboardLayout)", () => {
  it("NAV_GROUPS : 8 groupes, items non vides, paths absolus uniques", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(["assistant", "dashboard", "commercial", "clients", "terrain", "gestion", "finance", "parametres"]);
    const paths: string[] = [];
    for (const g of NAV_GROUPS) {
      expect(g.items.length).toBeGreaterThan(0);
      for (const it of g.items) { expect(it.path.startsWith("/")).toBe(true); paths.push(it.path); }
    }
    expect(new Set(paths).size).toBe(paths.length); // pas de doublon de route
    // pathPermissionMap consultable mais NON exhaustif (path absent → item visible, cf. filterGroupByPermissions)
    expect(pathPermissionMap["/devis"]).toBe("devis.voir");
  });

  it("filterGroupByPermissions : vide → show-all ; sinon filtre selon pathPermissionMap (vide = toujours visible)", () => {
    const commercial = group("commercial");
    expect(filterGroupByPermissions(commercial, []).items).toHaveLength(commercial.items.length); // show-all
    const onlyDevis = filterGroupByPermissions(commercial, ["devis.voir", "devis.creer"]);
    expect(onlyDevis.items.map((i) => i.path)).toContain("/devis"); // devis.voir
    expect(onlyDevis.items.map((i) => i.path)).toContain("/devis/nouveau"); // devis.creer
    expect(onlyDevis.items.map((i) => i.path)).not.toContain("/factures"); // factures.voir absent
    // un item sans permission requise (ex. /profil dans parametres) reste visible
    const params = filterGroupByPermissions(group("parametres"), ["x.y"]);
    expect(params.items.map((i) => i.path)).toContain("/profil");
  });

  it("filterGroupByModules : null → show-all ; ALWAYS_VISIBLE toujours là ; item filtré si module inactif", () => {
    const commercial = group("commercial");
    expect(filterGroupByModules(commercial, null).items).toHaveLength(commercial.items.length);
    const actifs = filterGroupByModules(commercial, ["factures"]); // devis inactif
    expect(actifs.items.map((i) => i.label)).toContain("Factures");
    expect(actifs.items.map((i) => i.label)).not.toContain("Devis");
    // ALWAYS_VISIBLE : Statistiques visible même sans module
    const dash = filterGroupByModules(group("dashboard"), ["zzz"]);
    expect(dash.items.map((i) => i.label)).toContain("Statistiques");
    expect(dash.items.map((i) => i.label)).toContain("Tableau de bord");
    // label non rattaché à un module (ex. Support n'est pas dans MODULE_TO_LABELS) reste visible
    expect(Object.values(MODULE_TO_LABELS).flat()).not.toContain("Support");
    expect(filterGroupByModules(group("parametres"), ["zzz"]).items.map((i) => i.label)).toContain("Support");
  });

  it("getAssistantContextForPath : exact, parent, fallback", () => {
    expect(getAssistantContextForPath("/devis").context).toContain("liste de devis");
    expect(getAssistantContextForPath("/devis/nouveau").context).toContain("crée un nouveau devis");
    expect(getAssistantContextForPath("/devis/123").context).toContain("liste de devis"); // remonte au parent /devis
    expect(getAssistantContextForPath("/route-inconnue").context).toBe("L'artisan utilise Operioz."); // fallback
  });

  it("formatRelativeDate : seuils", () => {
    const now = Date.now();
    expect(formatRelativeDate(new Date(now - 30 * 1000))).toBe("À l'instant");
    expect(formatRelativeDate(new Date(now - 5 * 60000))).toBe("Il y a 5 min");
    expect(formatRelativeDate(new Date(now - 3 * 3600000))).toBe("Il y a 3h");
    expect(formatRelativeDate(new Date(now - 24 * 3600000))).toBe("Hier");
    expect(formatRelativeDate(new Date(now - 3 * 24 * 3600000))).toBe("Il y a 3 jours");
  });
});

import { buildSidebarGroups, isPathActive, resolveActiveGroup, resolveActiveItem, MOBILE_PRIMARY } from "./nav";
import { RAIL_COLORS } from "./rail-colors";

describe("shell/nav — composition sidebar + actif (pur)", () => {
  it("buildSidebarGroups : compose permissions + modules + drop vides", () => {
    const all = buildSidebarGroups([], null); // show-all
    expect(all.map((g) => g.id)).toContain("commercial");
    // un seul module actif (clients) + ALWAYS_VISIBLE → les groupes sans item visible disparaissent
    const onlyClients = buildSidebarGroups([], ["clients"]);
    for (const g of onlyClients) expect(g.items.length).toBeGreaterThan(0);
    expect(onlyClients.find((g) => g.id === "clients")?.items.map((i) => i.label)).toContain("Clients");
  });

  it("isPathActive : match direct sur le path courant", () => {
    expect(isPathActive("/clients", "/clients")).toBe(true);
    expect(isPathActive("/clients", "/devis")).toBe(false);
  });

  it("resolveActiveGroup/Item : trouve le groupe+item de l'URL courante", () => {
    const groups = buildSidebarGroups([], null);
    expect(resolveActiveItem(groups, "/clients")?.path).toBe("/clients");
    expect(resolveActiveGroup(groups, "/clients")?.id).toBe("clients");
    expect(resolveActiveGroup(groups, "/route-x")).toBeUndefined();
  });

  it("MOBILE_PRIMARY : 4 entrées ; RAIL_COLORS couvre les 8 couleurs (dont purple)", () => {
    expect(MOBILE_PRIMARY.map((m) => m.id)).toEqual(["dashboard", "commercial", "clients", "terrain"]);
    for (const c of ["violet", "blue", "emerald", "orange", "rose", "cyan", "slate", "purple"] as const) {
      expect(RAIL_COLORS[c]?.iconActive).toBeTruthy();
    }
  });
});

import { userInitial } from "./nav";
describe("shell/nav — userInitial (pur)", () => {
  it("1re lettre du nom, sinon email, sinon ?", () => {
    expect(userInitial("Dupont", "x@y.z")).toBe("D");
    expect(userInitial("", "alice@op.com")).toBe("A");
    expect(userInitial(null, null)).toBe("?");
    expect(userInitial(undefined, undefined)).toBe("?");
  });
});

import { notifTypeMeta } from "./notif-style";
describe("shell/notif-style (pur)", () => {
  it("type connu → icône+couleur ; inconnu → Info + muted", () => {
    expect(notifTypeMeta("succes").color).toBe("text-green-500");
    expect(notifTypeMeta("erreur").color).toBe("text-red-500");
    expect(notifTypeMeta("zzz").color).toBe("text-muted-foreground");
    expect(notifTypeMeta("zzz").Icon).toBeTruthy();
  });
});

import { trialBannerSeverity, accountBlockState, type Subscription } from "./subscription";
const sub = (o: Partial<Subscription>) => o as Subscription;
describe("shell/subscription (pur)", () => {
  it("trialBannerSeverity : seuils + non affichée", () => {
    expect(trialBannerSeverity(null)).toBeNull();
    expect(trialBannerSeverity(sub({ status: "active" }))).toBeNull();
    expect(trialBannerSeverity(sub({ status: "trialing", trialDaysLeft: 8 }))).toBeNull();
    expect(trialBannerSeverity(sub({ status: "trialing", trialDaysLeft: 5 }))).toBe("normal");
    expect(trialBannerSeverity(sub({ status: "trialing", trialDaysLeft: 3 }))).toBe("urgent");
    expect(trialBannerSeverity(sub({ status: "trialing", trialDaysLeft: 1 }))).toBe("critical");
    expect(trialBannerSeverity(sub({ status: "trialing", trialDaysLeft: 0 }))).toBe("critical");
  });
  it("accountBlockState : expiré/essai fini bloque ; /parametres et /profil tolérés", () => {
    expect(accountBlockState(sub({ status: "active" }), "/clients").isBlocked).toBe(false);
    expect(accountBlockState(sub({ status: "expired" }), "/clients").isBlocked).toBe(true);
    expect(accountBlockState(sub({ status: "trialing", trialDaysLeft: 0 }), "/clients").isBlocked).toBe(true);
    expect(accountBlockState(sub({ status: "expired" }), "/parametres").blockerAllowed).toBe(true);
    expect(accountBlockState(sub({ status: "expired" }), "/profil").blockerAllowed).toBe(true);
    expect(accountBlockState(sub({ status: "expired" }), "/clients").blockerAllowed).toBe(false);
  });
});

import { groupResults, flattenGroups, type SearchResult } from "./search";
const res = (id: number, type: string): SearchResult => ({ id, type, title: `${type}${id}`, subtitle: "", url: `/${type}/${id}` } as SearchResult);
describe("shell/search (pur)", () => {
  it("groupResults : ordre fixe (client→fournisseur), groupes vides retirés", () => {
    const g = groupResults([res(1, "facture"), res(2, "client"), res(3, "devis"), res(4, "client")]);
    expect(g.map((x) => x.type)).toEqual(["client", "devis", "facture"]); // ordre fixe, pas d'intervention/fournisseur
    expect(g[0].items).toHaveLength(2); // 2 clients
  });
  it("flattenGroups : aplatit en préservant l'ordre du groupage", () => {
    const g = groupResults([res(1, "devis"), res(2, "client")]);
    expect(flattenGroups(g).map((r) => `${r.type}${r.id}`)).toEqual(["client2", "devis1"]);
  });
});
