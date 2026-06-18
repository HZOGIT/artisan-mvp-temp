import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Euro, FileText, Receipt, Target, TrendingUp, Users, Settings2, LayoutGrid, Check, CircleDashed, CreditCard, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { StatCard, type StatCardColor } from "./widgets/stat-card";
import { WelcomeBanner } from "./widgets/welcome-banner";
import { AlertsBar, type DashboardAlert } from "./widgets/alerts-bar";
import { QuickActions } from "./widgets/quick-actions";
import { DashboardWidget } from "./widgets/dashboard-widget";
import { CustomizePanel } from "./widgets/customize-panel";
import { ConseillerIAWidget } from "@/components/ConseillerIAWidget";
import { RevenueChartWidget } from "./widgets/revenue-chart";
import { DevisRepartitionWidget } from "./widgets/devis-repartition";
import { TopClientsWidget } from "@/components/dashboard/widgets/TopClients";
import { RecentActivityWidget } from "./widgets/recent-activity";
import { UpcomingInterventionsWidget } from "./widgets/upcoming-interventions";
import { ObjectifsWidget } from "./widgets/objectifs";
import { ActivitesAFaireWidget } from "@/components/dashboard/widgets/ActivitesAFaire";
import { TresoreriePrevisionnelleWidget } from "@/components/dashboard/widgets/TresoreriePrevisionnelle";
import { LivraisonsEnRetardWidget } from "./widgets/livraisons-en-retard";
import { ContratsAFacturerWidget } from "./widgets/contrats-a-facturer";
import { StockBasWidget } from "./widgets/stock-bas";
import { useDashboard } from "../application/use-dashboard";
import {
  formatEUR, computeDashboardState, resolveWidgetOrder, parseHidden, visibleWidgetIds, firstNameOf,
  ORDER_KEY, HIDDEN_KEY, DEFAULT_ORDER,
} from "../domain/dashboard";

const WIDGET_RENDERERS: Record<string, () => React.ReactNode> = {
  activitesAFaire: () => <ActivitesAFaireWidget />,
  tresoreriePrevisionnelle: () => <TresoreriePrevisionnelleWidget />,
  livraisonsEnRetard: () => <LivraisonsEnRetardWidget />,
  contratsAFacturer: () => <ContratsAFacturerWidget />,
  stockBas: () => <StockBasWidget />,
  revenue: () => <RevenueChartWidget />,
  devisRepartition: () => <DevisRepartitionWidget />,
  topClients: () => <TopClientsWidget />,
  recentActivity: () => <RecentActivityWidget />,
  upcomingInterventions: () => <UpcomingInterventionsWidget />,
  objectifs: () => <ObjectifsWidget />,
};
const ALL_IDS = [...DEFAULT_ORDER];

export default function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const [, setLocation] = useLocation();
  const { stats, statsLoading, conversionRate, alerts, objectifs, artisan, currentUserName } = useDashboard();

  const [order, setOrder] = useState<string[]>(() => resolveWidgetOrder(typeof window !== "undefined" ? window.localStorage.getItem(ORDER_KEY) : null, ALL_IDS));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(parseHidden(typeof window !== "undefined" ? window.localStorage.getItem(HIDDEN_KEY) : null)));
  const [customizeOpen, setCustomizeOpen] = useState(false);

  useEffect(() => { try { window.localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* noop */ } }, [order]);
  useEffect(() => { try { window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(hidden))); } catch { /* noop */ } }, [hidden]);

  const handleToggleHidden = (id: string, visible: boolean) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(id); else next.add(id);
      return next;
    });
  };
  const handleReset = () => { setOrder([...DEFAULT_ORDER]); setHidden(new Set()); };

  const firstName = firstNameOf(currentUserName);
  const rate = conversionRate;
  const facturesImpayeesCount = stats?.facturesImpayees?.count || 0;
  const facturesImpayeesTotal = stats?.facturesImpayees?.total || 0;
  const totalClients = stats?.totalClients || 0;
  const totalDevis = stats?.totalDevis || 0;
  const totalFactures = stats?.totalFactures || 0;
  const dashboardState = useMemo(() => computeDashboardState(totalClients, totalDevis), [totalClients, totalDevis]);

  const checklist = useMemo(() => [
    { id: "profil", label: t("checkProfil"), done: !!artisan?.logo && !!artisan?.siret, icon: UserPlus, action: () => setLocation("/profil") },
    { id: "client", label: t("checkClient"), done: totalClients > 0, icon: Users, action: () => setLocation("/clients/nouveau") },
    { id: "devis", label: t("checkDevis"), done: totalDevis > 0, icon: FileText, action: () => setLocation("/devis/nouveau") },
    { id: "facture", label: t("checkFacture"), done: totalFactures > 0, icon: Receipt, action: () => setLocation("/factures") },
    { id: "paiement", label: t("checkPaiement"), done: false, icon: CreditCard, action: () => setLocation("/parametres") },
  ], [artisan, totalClients, totalDevis, totalFactures, setLocation, t]);
  const checklistDone = checklist.filter((c) => c.done).length;
  const checklistProgress = Math.round((checklistDone / checklist.length) * 100);

  const visibleOrder = visibleWidgetIds(order, hidden, ALL_IDS);

  const widgetMeta = (id: string) => ({ label: t(`widgets.${id}.label`), description: t(`widgets.${id}.description`) });
  const customizableWidgets = ALL_IDS.map((id) => ({ id, ...widgetMeta(id) }));

  const statCards: Array<{ title: string; value: number | string; subtitle?: string; icon: typeof Euro; color: StatCardColor; formatter?: (v: number) => string; suffix?: string; onClick?: () => void; badge?: number; pulse?: boolean; footer?: React.ReactNode }> = [
    { title: t("statCaMois"), value: stats?.caMonth || 0, subtitle: t("statCaMoisSub", { montant: formatEUR(stats?.caYear || 0) }), icon: Euro, color: "blue", formatter: formatEUR, onClick: () => setLocation("/rapports") },
    { title: t("statCaAnnee"), value: stats?.caYear || 0, subtitle: objectifs?.objectifCA && objectifs.objectifCA > 0 ? t("statObjectif", { montant: formatEUR(objectifs.objectifCA) }) : t("statCumulAnnuel"), icon: TrendingUp, color: "green", formatter: formatEUR, onClick: () => setLocation("/rapports") },
    { title: t("statDevisEnAttente"), value: stats?.devisEnCours || 0, subtitle: stats?.devisEnCours ? t("statDevisARelancer", { count: stats.devisEnCours }) : t("statAucunDevis"), icon: FileText, color: "orange", onClick: () => setLocation("/devis?filtre=envoye"), badge: (stats?.devisEnCours || 0) > 10 ? stats?.devisEnCours : undefined },
    { title: t("statFacturesImpayees"), value: facturesImpayeesCount, subtitle: t("statAEncaisser", { montant: formatEUR(facturesImpayeesTotal) }), icon: Receipt, color: "red", onClick: () => setLocation("/factures?filtre=impayees"), pulse: facturesImpayeesCount > 0 },
    { title: t("statClients"), value: totalClients, subtitle: t("statClientsSub"), icon: Users, color: "violet", onClick: () => setLocation("/clients") },
    { title: t("statTauxConversion"), value: Math.round(rate), suffix: "%", subtitle: t("statDevisAcceptes"), icon: Target, color: "cyan", onClick: () => setLocation("/statistiques"), footer: (
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, rate))}%` }} />
      </div>
    ) },
  ];

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <div className="h-32 rounded-2xl bg-muted/60 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (<div key={i} className="h-28 rounded-xl bg-muted/60 animate-pulse" />))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-64 rounded-xl bg-muted/60 animate-pulse" />))}
        </div>
      </div>
    );
  }

  const dashboardAlerts: DashboardAlert[] = alerts;
  const welcomeProps = {
    firstName,
    devisEnAttente: stats?.devisEnCours || 0,
    facturesImpayees: facturesImpayeesCount,
    interventionsAVenir: stats?.interventionsAVenir || 0,
    onCreateDevis: () => setLocation("/devis/nouveau"),
    onCreateFacture: () => setLocation("/factures"),
    onCreateIntervention: () => setLocation("/interventions"),
  };

  const customizePanel = (
    <CustomizePanel
      isOpen={customizeOpen}
      onClose={() => setCustomizeOpen(false)}
      widgets={customizableWidgets}
      hiddenIds={hidden}
      onToggle={handleToggleHidden}
      onReset={() => { handleReset(); setCustomizeOpen(false); }}
    />
  );

  if (dashboardState === "nouveau") {
    return (
      <div className="space-y-6">
        <WelcomeBanner {...welcomeProps} onOpenSearch={() => window.dispatchEvent(new CustomEvent("operioz:open-search"))} />

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">{t("premieresEtapes")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t("checklistProgress", { done: checklistDone, total: checklist.length, count: checklistDone })}</p>
            </div>
            <span className="text-2xl font-bold tabular-nums">{checklistProgress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-4">
            <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-500 transition-all" style={{ width: `${checklistProgress}%` }} />
          </div>
          <ul className="space-y-2">
            {checklist.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button type="button" onClick={item.action} className="w-full flex items-center gap-3 rounded-lg p-3 hover:bg-accent/50 transition-colors text-left">
                    <span className={`shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-full ${item.done ? "bg-emerald-500 text-white" : "border-2 border-muted-foreground/30 text-muted-foreground"}`}>
                      {item.done ? <Check className="h-3.5 w-3.5" /> : <CircleDashed className="h-3 w-3" />}
                    </span>
                    <Icon className={`h-4 w-4 shrink-0 ${item.done ? "text-emerald-500" : "text-muted-foreground"}`} />
                    <span className={`text-sm flex-1 ${item.done ? "line-through text-muted-foreground" : "font-medium"}`}>{item.label}</span>
                    {!item.done && <span className="text-xs text-primary font-medium">{t("commencer")}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800 text-white p-6 shadow-lg">
          <div aria-hidden className="absolute -top-16 -right-10 h-64 w-64 rounded-full bg-fuchsia-400/20 blur-3xl animate-blob" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <span className="h-12 w-12 inline-flex items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm"><Sparkles className="h-6 w-6" /></span>
              <div>
                <h2 className="text-xl font-bold tracking-tight">{t("assistantTitre")}</h2>
                <p className="text-sm text-violet-100/80">{t("assistantSousTitre")}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { label: t("ctaCreeDevis"), path: "/devis/nouveau" },
                { label: t("ctaAjouteClient"), path: "/clients/nouveau" },
                { label: t("ctaPlanifie"), path: "/interventions" },
              ].map((s) => (
                <button key={s.label} type="button" onClick={() => setLocation(s.path)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 px-3 py-2 text-xs font-medium transition-all">
                  {s.label}
                </button>
              ))}
              <button type="button" onClick={() => setLocation("/assistant")} className="inline-flex items-center gap-1.5 rounded-lg bg-white text-violet-700 hover:bg-violet-50 px-3 py-2 text-xs font-semibold transition-all shadow">
                {t("ctaOuvrirAssistant")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (dashboardState === "demarrage") {
    const minimalWidgets = ["recentActivity", "upcomingInterventions"];
    return (
      <div className="space-y-6">
        <WelcomeBanner {...welcomeProps} onOpenSearch={() => window.dispatchEvent(new CustomEvent("operioz:open-search"))} />
        <AlertsBar alerts={dashboardAlerts} onNavigate={(path) => setLocation(path)} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[statCards[0], statCards[2], statCards[3], statCards[4]].map((card, i) => (<StatCard key={card.title} {...card} index={i} />))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {minimalWidgets.map((id) => (
            <DashboardWidget key={id} id={id} title={widgetMeta(id).label} subtitle={widgetMeta(id).description}>
              {WIDGET_RENDERERS[id]?.()}
            </DashboardWidget>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <span className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shrink-0"><Sparkles className="h-5 w-5" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t("aideAssistantTitre")}</p>
            <p className="text-xs text-muted-foreground">{t("aideAssistantSousTitre")}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setLocation("/assistant")}>{t("ouvrir")}</Button>
        </div>
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setCustomizeOpen(true)}><Settings2 className="h-3.5 w-3.5 mr-2" />{t("personnaliser")}</Button>
        </div>
        {customizePanel}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WelcomeBanner {...welcomeProps} />
      <AlertsBar alerts={dashboardAlerts} onNavigate={(path) => setLocation(path)} />
      <ConseillerIAWidget />
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((card, i) => (<StatCard key={card.title} {...card} index={i} />))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visibleOrder.map((id) => (
          <DashboardWidget key={id} id={id} title={widgetMeta(id).label} subtitle={widgetMeta(id).description} removable onRemove={() => handleToggleHidden(id, false)}>
            {WIDGET_RENDERERS[id]?.()}
          </DashboardWidget>
        ))}
      </div>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <LayoutGrid className="h-3.5 w-3.5" /> {t("actionsRapides")}
        </h2>
        <QuickActions
          onNewDevis={() => setLocation("/devis/nouveau")}
          onNewFacture={() => setLocation("/factures")}
          onNewClient={() => setLocation("/clients/nouveau")}
          onNewIntervention={() => setLocation("/interventions")}
        />
      </div>
      <div className="flex justify-center pt-2">
        <Button variant="outline" size="sm" onClick={() => setCustomizeOpen(true)}><Settings2 className="h-3.5 w-3.5 mr-2" />{t("personnaliser")}</Button>
      </div>
      {customizePanel}
    </div>
  );
}
