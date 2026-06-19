import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CheckCircle2, AlertTriangle, AlertCircle, Hourglass, Smartphone, Laptop, Tablet,
  CreditCard, ExternalLink, Loader2, XCircle, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Switch } from "@/shared/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/shared/ui/dialog";
import { useAbonnement } from "../application/use-abonnement";
import { BillingMaisonSection } from "./billing-maison-section";
import {
  PLANS, calcPrice, isCurrentPlan, trialColorTier, trialProgressPct, planLabel, relativeTime,
  type Plan, type BillingInterval, type PlanDef,
} from "../domain/abonnement";

function deviceIcon(type: string) {
  if (type === "mobile") return Smartphone;
  if (type === "tablet") return Tablet;
  return Laptop;
}
const fmtDate = (d: Date | string) => format(new Date(d), "dd MMMM yyyy", { locale: fr });

export function AbonnementSection() {
  const { t } = useTranslation("abonnement");
  const { sub, devices, isLoading, checkout, portal, cancel, reactivate, revoke, revokeAll } = useAbonnement();

  const [interval, setInterval] = useState<BillingInterval>("month");
  const [extraUsersByPlan, setExtraUsersByPlan] = useState<Record<Plan, number>>({ essentiel: 0, pro: 0, entreprise: 0 });
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const statusMeta = useMemo(() => {
    if (!sub) return null;
    const s = sub.status;
    if (s === "trialing") {
      const tier = trialColorTier(sub.trialDaysLeft);
      const cls = tier === "danger"
        ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900"
        : tier === "warning"
          ? "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900"
          : "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900";
      return {
        icon: Hourglass, iconCls: "text-blue-600", cls,
        title: t("trialTitre", { count: sub.trialDaysLeft }),
        subtitle: sub.trialEndsAt ? t("trialSousTitre", { date: fmtDate(sub.trialEndsAt) }) : "",
      };
    }
    if (s === "active") {
      return {
        icon: CheckCircle2, iconCls: "text-emerald-600",
        cls: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900",
        title: t("activeTitre", { plan: planLabel(sub.plan) }),
        subtitle: sub.currentPeriodEnd ? t("activeSousTitre", { date: fmtDate(sub.currentPeriodEnd) }) : "",
      };
    }
    if (s === "past_due") {
      return { icon: AlertTriangle, iconCls: "text-orange-600", cls: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900", title: t("pastDueTitre"), subtitle: t("pastDueSousTitre") };
    }
    if (s === "canceled") {
      return {
        icon: AlertCircle, iconCls: "text-orange-600",
        cls: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900",
        title: t("canceledTitre"),
        subtitle: sub.currentPeriodEnd ? t("canceledSousTitre", { date: fmtDate(sub.currentPeriodEnd) }) : "",
      };
    }
    return { icon: XCircle, iconCls: "text-red-600", cls: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900", title: t("expiredTitre"), subtitle: t("expiredSousTitre") };
  }, [sub, t]);

  if (isLoading || !sub) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const planPriceLabel = (def: PlanDef) => `${calcPrice(def, extraUsersByPlan[def.id], interval).toFixed(0)}€`;

  return (
    <div className="space-y-6">
      {statusMeta && (() => {
        const Icon = statusMeta.icon;
        return (
          <Card className={`border-2 ${statusMeta.cls}`}>
            <CardContent className="py-6 flex items-start gap-4">
              <Icon className={`h-8 w-8 shrink-0 ${statusMeta.iconCls}`} />
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold">{statusMeta.title}</h3>
                {statusMeta.subtitle && <p className="text-sm text-muted-foreground mt-0.5">{statusMeta.subtitle}</p>}
                {sub.status === "trialing" && sub.trialEndsAt && (
                  <div className="mt-3 h-1.5 w-full bg-white/50 dark:bg-black/30 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${trialProgressPct(sub.trialDaysLeft)}%` }} />
                  </div>
                )}
                {sub.status === "canceled" && (
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => reactivate.mutate(undefined, { onSuccess: () => toast.success(t("toastReactive")), onError: (e) => toast.error(e.message || t("errReactivation")) })} disabled={reactivate.isPending}>
                    {t("reactiver")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardHeader>
          <CardTitle>{t("choisirPlan")}</CardTitle>
          <CardDescription>{t("choisirPlanDesc")}</CardDescription>
          <div className="flex items-center gap-3 pt-3">
            <span className={interval === "month" ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{t("mensuel")}</span>
            <Switch checked={interval === "year"} onCheckedChange={(v) => setInterval(v ? "year" : "month")} />
            <span className={interval === "year" ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{t("annuel")}</span>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">{t("remiseAnnee")}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((def) => {
              const extra = extraUsersByPlan[def.id];
              const current = isCurrentPlan(sub, def.id);
              return (
                <div key={def.id} className={`relative rounded-xl border p-5 flex flex-col ${def.highlight ? "border-blue-500 shadow-md" : "border-border"}`}>
                  {def.highlight && <Badge className="absolute -top-2 left-4 bg-blue-600 text-white">{t("leePlusPopulaire")}</Badge>}
                  <div className="mb-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      {def.name}
                      {current && <Badge variant="outline" className="text-xs">{t("planActuel")}</Badge>}
                    </h3>
                    <p className="text-sm text-muted-foreground">{def.description}</p>
                  </div>
                  <div className="mb-3">
                    <span className="text-3xl font-bold tabular-nums">{planPriceLabel(def)}</span>
                    <span className="text-sm text-muted-foreground ml-1">{interval === "month" ? t("parMois") : t("parAn")}</span>
                  </div>
                  <ul className="space-y-1.5 text-sm flex-1 mb-4">
                    {def.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {def.extraUserMonth && (
                    <div className="mb-3">
                      <label className="text-xs text-muted-foreground">{t("usersSupp")}</label>
                      <div className="flex items-center gap-2 mt-1">
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setExtraUsersByPlan((p) => ({ ...p, [def.id]: Math.max(0, p[def.id] - 1) }))}>−</Button>
                        <span className="text-sm font-medium tabular-nums w-8 text-center">+{extra}</span>
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setExtraUsersByPlan((p) => ({ ...p, [def.id]: Math.min(50, p[def.id] + 1) }))}>+</Button>
                      </div>
                    </div>
                  )}
                  <Button
                    onClick={() => checkout.mutate({ plan: def.id, interval, extraUsers: extra }, { onSuccess: (res) => { if (res.url) window.location.href = res.url; }, onError: (e) => toast.error(e.message || t("errCheckout")) })}
                    disabled={current || checkout.isPending}
                    variant={current ? "outline" : "default"}
                  >
                    {current ? t("planActuel") : checkout.isPending ? t("chargement") : t("choisir", { plan: def.name })}
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            {t("contactAgence")} <a href="mailto:contact@operioz.com" className="underline">{t("contactAgenceLien")}</a>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" />{t("mesAppareils")}</CardTitle>
          <CardDescription>{t("appareilsDesc", { count: devices.length, max: sub.maxDevicesPerUser })}</CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucunAppareil")}</p>
          ) : (
            <div className="space-y-2">
              {devices.map((d) => {
                const Icon = deviceIcon(d.deviceType);
                return (
                  <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{d.browser || t("navigateur")} — {d.os || t("osInconnu")}</p>
                      <p className="text-xs text-muted-foreground">{relativeTime(d.lastActiveAt)}{d.lastIp ? ` · ${d.lastIp}` : ""}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => revoke.mutate({ deviceId: d.id }, { onSuccess: () => toast.success(t("appareilRevoque")) })} disabled={revoke.isPending}>
                      {t("revoquer")}
                    </Button>
                  </div>
                );
              })}
              {devices.length > 1 && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => revokeAll.mutate(undefined, { onSuccess: (res) => toast.success(t("appareilsDeconnectes", { count: res.removed })) })} disabled={revokeAll.isPending}>
                  {t("deconnecterAutres")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {sub.stripeSubscriptionId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />{t("facturation")}</CardTitle>
            <CardDescription>{t("facturationDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => portal.mutate(undefined, { onSuccess: (res) => { if (res.url) window.location.href = res.url; }, onError: (e) => toast.error(e.message || t("errPortal")) })} disabled={portal.isPending}>
              {portal.isPending ? t("chargement") : t("gererAbonnement")}
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}

      {sub.stripeSubscriptionId && sub.status === "active" && !sub.cancelAtPeriodEnd && (
        <div className="text-center pt-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-red-600" onClick={() => setCancelDialogOpen(true)}>
            {t("annulerAbonnement")}
          </Button>
        </div>
      )}

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("annulerTitre")}</DialogTitle>
            <DialogDescription>{t("annulerDesc", { date: sub.currentPeriodEnd ? fmtDate(sub.currentPeriodEnd) : "—" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>{t("garderAbonnement")}</Button>
            <Button variant="destructive" onClick={() => cancel.mutate(undefined, { onSuccess: () => { toast.success(t("toastAnnule")); setCancelDialogOpen(false); }, onError: (e) => toast.error(e.message || t("errAnnulation")) })} disabled={cancel.isPending}>
              <Sparkles className="h-4 w-4 mr-2" />
              {t("confirmerAnnulation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BillingMaisonSection />
    </div>
  );
}
