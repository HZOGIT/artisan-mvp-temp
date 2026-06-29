import { describe, expect, it, vi, afterEach } from "vitest";
import { isPanelSize, PANEL_WIDTH_CLASS, PANEL_MARGIN_CLASS, PANEL_SIZE_OPTIONS, initialAssistantOpen } from "./assistant-panel";

describe("assistant-panel — domain pur", () => {
  it("isPanelSize : valide sm/md/lg uniquement", () => {
    expect(isPanelSize("sm")).toBe(true);
    expect(isPanelSize("md")).toBe(true);
    expect(isPanelSize("lg")).toBe(true);
    expect(isPanelSize("xl")).toBe(false);
    expect(isPanelSize(null)).toBe(false);
  });
  it("classes largeur/marge cohérentes par taille (380/520/700)", () => {
    expect(PANEL_WIDTH_CLASS.sm).toContain("380px");
    expect(PANEL_WIDTH_CLASS.md).toContain("520px");
    expect(PANEL_WIDTH_CLASS.lg).toContain("700px");
    expect(PANEL_MARGIN_CLASS.sm).toContain("380px");
    expect(PANEL_MARGIN_CLASS.lg).toContain("700px");
  });
  it("3 options de taille, dans l'ordre sm→md→lg", () => {
    expect(PANEL_SIZE_OPTIONS.map((o) => o.size)).toEqual(["sm", "md", "lg"]);
    expect(PANEL_SIZE_OPTIONS.map((o) => o.labelKey)).toEqual(["tailleCompact", "tailleNormal", "tailleLarge"]);
  });
});

describe("initialAssistantOpen", () => {
  const mockMedia = (matches: boolean) => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches }) });
  };
  afterEach(() => vi.unstubAllGlobals());

  it("fermé par défaut sur 1024px (OPE-733 : évite troncature — contenu < 440px)", () => {
    mockMedia(false);
    expect(initialAssistantOpen()).toBe(false);
  });
  it("ouvert sur ≥1440px (laisse ≥856px de contenu)", () => {
    mockMedia(true);
    expect(initialAssistantOpen()).toBe(true);
  });
});
