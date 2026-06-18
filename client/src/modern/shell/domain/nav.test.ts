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
