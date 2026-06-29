import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "@/shared/router/navigation";
import { Outlet } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { trpc } from "@/shared/trpc";
import { apiUrl } from "@/shared/backend-url";
import { useShell } from "../application/use-shell";
import { usePushSubscription } from "../application/use-push-subscription";
import { accountBlockState } from "../domain/subscription";
import { DashboardLayout } from "./dashboard-layout";
import { NotificationBell } from "./notification-bell";
import { GlobalSearch } from "./global-search";
import { TrialBanner } from "./trial-banner";
import { ExpiredBlocker } from "./expired-blocker";
import { AssistantFAB } from "./assistant-fab";
import { AssistantDrawer } from "./assistant-drawer";
import { readPanelSize, writePanelSize, initialAssistantOpen, PANEL_MARGIN_CLASS, type AssistantPanelSize } from "../domain/assistant-panel";

/** Routes authentifiées accessibles MEME quand l'onboarding n'est pas terminé (gate ci-dessous). */
const ONBOARDING_BYPASS = new Set(["/onboarding", "/profil", "/parametres", "/abonnement", "/assistant", "/assistant/conversations", "/notifications"]);

/*
 * MOUNT du SHELL modern — composant du layout `app-shell` (routeur unifié). Branche données (useShell +
 * subscription) + remplit TOUS les slots de la chrome (recherche Ctrl+K, notifs, bannière essai, blocage
 * expiré, FAB+drawer assistant) + porte le GATE onboarding. Enveloppe l'<Outlet/> TanStack des pages auth.
 */
export function DashboardLayoutMount() {
  const { t } = useTranslation("shell");
  const [location, setLocation] = useLocation();
  const { user, permissions, modulesActifs, logout } = useShell();
  const { data: sub } = trpc.subscription.getCurrent.useQuery(undefined, { staleTime: 60 * 1000 });
  /*
   * Gate onboarding (relocalisé d'App.tsx au shell,/F1) : un artisan dont l'onboarding n'est pas
   * terminé est redirigé vers /onboarding (sauf routes bypass). /onboarding est HORS du sous-arbre du
   * shell (route dédiée sous la racine). On y va par une VRAIE navigation (`window.location.replace`),
   * comme la redirection sœur /home→/dashboard (cf. home-page) : un `tsNavigate` in-router fait franchir
   * deux arbres de routes et entre en collision avec la ré-assertion d'historique de TanStack → boucle
   * /dashboard↔/onboarding. Une navigation pleine page recharge OnboardingPage proprement.
   */
  const { data: onboardingStatus, isLoading: onbLoading } = trpc.modules.getOnboardingStatus.useQuery();
  useEffect(() => {
    if (onbLoading || !onboardingStatus) return;
    if (!onboardingStatus.onboardingCompleted && !ONBOARDING_BYPASS.has(location)) {
      const plan = new URLSearchParams(window.location.search).get("plan");
      window.location.replace(plan ? `/onboarding?plan=${encodeURIComponent(plan)}` : "/onboarding");
    }
  }, [onboardingStatus, onbLoading, location]);
  const [searchOpen, setSearchOpen] = useState(false);
  /** Auto-open du panneau assistant sur desktop large (port du comportement legacy). */
  const [assistantOpen, setAssistantOpen] = useState(initialAssistantOpen);
  const [pendingPreprompt, setPendingPreprompt] = useState<string | null>(null);
  /** Taille du panneau (sm/md/lg) persistée en localStorage. */
  const [panelSize, setPanelSize] = useState<AssistantPanelSize>(readPanelSize);
  useEffect(() => { writePanelSize(panelSize); }, [panelSize]);

  /** Raccourci Ctrl/Cmd+K → recherche globale. */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((v) => !v); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /*
   * Bus event 'operioz:open-assistant' : permet à la page Support (et l'action 'navigate' de l'assistant)
   * de rouvrir le panneau IA sans prop-drilling (port du comportement legacy).
   */
  useEffect(() => {
    const onOpen = (e: Event) => {
      setAssistantOpen(true);
      const pp = (e as CustomEvent<{ preprompt?: string }>).detail?.preprompt ?? null;
      if (pp) setPendingPreprompt(pp);
    };
    window.addEventListener("operioz:open-assistant", onOpen);
    return () => window.removeEventListener("operioz:open-assistant", onOpen);
  }, []);

  usePushSubscription();

  const { isBlocked, blockerAllowed } = accountBlockState(sub, location);
  const isAssistantPage = location === "/assistant";

  const topBarActions = (
    <>
      <button type="button" onClick={() => setSearchOpen(true)} aria-label={t("rechercherHint")} className="hidden sm:inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/40 hover:bg-accent px-3 text-xs text-muted-foreground transition-colors min-w-[200px]">
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">{t("rechercher")}</span>
        <kbd className="hidden md:inline-flex h-5 items-center rounded border border-border bg-background px-1.5 font-mono">{t("cmdK")}</kbd>
      </button>
      <button type="button" onClick={() => setSearchOpen(true)} aria-label={t("rechercher")} className="sm:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-accent"><Search className="h-4 w-4" /></button>
      <NotificationBell />
    </>
  );

  return (
    <>
      <DashboardLayout
        location={location} permissions={permissions} modulesActifs={modulesActifs} user={user}
        onNavigate={setLocation} onLogout={logout}
        assistantOpen={assistantOpen}
        mainExtraClass={PANEL_MARGIN_CLASS[panelSize]}
        topBarActions={topBarActions}
        banners={<TrialBanner />}
        assistant={
          <>
            <AssistantFAB onClick={() => setAssistantOpen(true)} hidden={isAssistantPage || assistantOpen} />
            <AssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} panelSize={panelSize} onPanelSizeChange={setPanelSize} preprompt={pendingPreprompt} onPrepromptConsumed={() => setPendingPreprompt(null)} />
          </>
        }
      >
        {isBlocked && !blockerAllowed ? <ExpiredBlocker onExportData={() => { window.location.href = apiUrl("/api/rgpd/export"); }} /> : <Outlet />}
      </DashboardLayout>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
