import { PanelLeft, Maximize2, type LucideIcon } from "lucide-react";

// Logique PURE du panneau latéral MonAssistant : tailles (largeur desktop), persistance, auto-open.
// Re-port d'AssistantDrawer/DashboardLayout legacy (perdu au cutover : largeurs sm/md/lg + auto-open desktop).

export type AssistantPanelSize = "sm" | "md" | "lg";

const PANEL_SIZE_KEY = "operioz.assistant.panelSize";

// Largeur du panneau (desktop ; plein écran sur mobile). md = défaut historique.
export const PANEL_WIDTH_CLASS: Record<AssistantPanelSize, string> = {
  sm: "sm:w-[380px]",
  md: "sm:w-[520px]",
  lg: "sm:w-[700px]",
};

// Marge droite du contenu principal pour faire de la place au panneau (desktop, non-modal).
export const PANEL_MARGIN_CLASS: Record<AssistantPanelSize, string> = {
  sm: "md:mr-[380px]",
  md: "md:mr-[520px]",
  lg: "md:mr-[700px]",
};

// Options du sélecteur de taille (header du drawer). `labelKey` = clé i18n (ns shell).
export const PANEL_SIZE_OPTIONS: { size: AssistantPanelSize; labelKey: string; icon: LucideIcon; iconClass: string }[] = [
  { size: "sm", labelKey: "tailleCompact", icon: PanelLeft, iconClass: "h-3.5 w-3.5" },
  { size: "md", labelKey: "tailleNormal", icon: PanelLeft, iconClass: "h-4 w-4" },
  { size: "lg", labelKey: "tailleLarge", icon: Maximize2, iconClass: "h-4 w-4" },
];

export function isPanelSize(raw: unknown): raw is AssistantPanelSize {
  return raw === "sm" || raw === "md" || raw === "lg";
}

export function readPanelSize(): AssistantPanelSize {
  if (typeof window === "undefined") return "md";
  const raw = window.localStorage.getItem(PANEL_SIZE_KEY);
  return isPanelSize(raw) ? raw : "md";
}

export function writePanelSize(size: AssistantPanelSize): void {
  try { window.localStorage.setItem(PANEL_SIZE_KEY, size); } catch { /* noop */ }
}

// Auto-open du panneau au montage : ouvert d'office sur desktop large (≥1024px), fermé sur mobile/tablette.
export function initialAssistantOpen(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 1024px)").matches;
}
