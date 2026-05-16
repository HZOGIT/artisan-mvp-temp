import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  CheckCircle2, AlertTriangle, AlertCircle, Hourglass, Smartphone, Laptop, Tablet,
  CreditCard, ExternalLink, Loader2, XCircle, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type Plan = "essentiel" | "pro" | "entreprise";

interface PlanDef {
  id: Plan;
  name: string;
  monthly: number;
  yearly: number;
  users: number;
  description: string;
  features: string[];
  extraUserMonth?: number;
  highlight?: boolean;
}

const PLANS: PlanDef[] = [
  {
    id: "essentiel",
    name: "Essentiel",
    monthly: 29,
    yearly: 29 * 12 * 0.8,
    users: 1,
    description: "Pour artisan seul",
    features: ["1 utilisateur", "3 appareils max", "2 sessions simultanées", "Toutes les fonctionnalités"],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 49,
    yearly: 49 * 12 * 0.8,
    users: 3,
    description: "Petite équipe",
    features: ["3 utilisateurs inclus", "+10€/mois par user supplémentaire", "3 appareils par user", "3 sessions simultanées"],
    extraUserMonth: 10,
    highlight: true,
  },
  {
    id: "entreprise",
    name: "Entreprise",
    monthly: 89,
    yearly: 89 * 12 * 0.8,
    users: 10,
    description: "Equipe constituee",
    features: ["10 utilisateurs inclus", "+8€/mois par user supplémentaire", "3 appareils par user", "4 sessions simultanées"],
    extraUserMonth: 8,
  },
];

function deviceIcon(type: string) {
  if (type === "mobile") return Smartphone;
  if (type === "tablet") return Tablet;
  return Laptop;
}

function relativeTime(date: Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "il y a quelques secondes";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return format(d, "dd MMM yyyy", { locale: fr });
}

export function AbonnementSection() {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [extraUsersByPlan, setExtraUsersByPlan] = useState<Record<Plan, number>>({
    essentiel: 0, pro: 0, entreprise: 0,
  });
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const { data: sub, isLoading, refetch } = trpc.subscription.getCurrent.useQuery();
  const { data: devices = [], refetch: refetchDevices } = trpc.devices.list.useQuery();

  const checkoutMut = trpc.subscription.createCheckout.useMutation({
    onSuccess: (res) => {
      if (res.url) window.location.href = res.url;
    },
    onError: (e) => toast.error(e.message || "Erreur lors de la creation du paiement"),
  });
  const portalMut = trpc.subscription.createPortal.useMutation({
    onSuccess: (res) => {
      if (res.url) window.location.href = res.url;
    },
    onError: (e) => toast.error(e.message || "Erreur portail"),
  });
  const cancelMut = trpc.subscription.cancel.useMutation({
    onSuccess: () => {
      toast.success("Abonnement annule a la fin de la periode");
      setCancelDialogOpen(false);
      refetch();
    },
    onError: (e) => toast.error(e.message || "Erreur annulation"),
  });
  const reactivateMut = trpc.subscription.reactivate.useMutation({
    onSuccess: () => {
      toast.success("Abonnement reactive");
      refetch();
    },
    onError: (e) => toast.error(e.message || "Erreur reactivation"),
  });
  const revokeMut = trpc.devices.revoke.useMutation({
    onSuccess: () => { toast.success("Appareil revoque"); refetchDevices(); },
  });
  const revokeAllMut = trpc.devices.revokeAll.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.removed} appareil(s) deconnecte(s)`);
      refetchDevices();
    },
  });

  const statusMeta = useMemo(() => {
    if (!sub) return null;
    const s = sub.status;
    if (s === "trialing") {
      const cls = sub.trialDaysLeft <= 1
        ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900"
        : sub.trialDaysLeft <= 3
          ? "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900"
          : "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900";
      return {
        icon: Hourglass,
        iconCls: "text-blue-600",
        cls,
        title: `Essai gratuit — ${sub.trialDaysLeft} jour${sub.trialDaysLeft > 1 ? "s" : ""} restant${sub.trialDaysLeft > 1 ? "s" : ""}`,
        subtitle: sub.trialEndsAt ? `Se termine le ${format(new Date(sub.trialEndsAt), "dd MMMM yyyy", { locale: fr })}` : "",
      };
    }
    if (s === "active") {
      return {
        icon: CheckCircle2,
        iconCls: "text-emerald-600",
        cls: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900",
        title: `Plan ${sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)} — Actif`,
        subtitle: sub.currentPeriodEnd
          ? `Renouvellement le ${format(new Date(sub.currentPeriodEnd), "dd MMMM yyyy", { locale: fr })}`
          : "",
      };
    }
    if (s === "past_due") {
      return {
        icon: AlertTriangle,
        iconCls: "text-orange-600",
        cls: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900",
        title: "Paiement en attente",
        subtitle: "Mettez a jour votre moyen de paiement pour eviter la suspension.",
      };
    }
    if (s === "canceled") {
      return {
        icon: AlertCircle,
        iconCls: "text-orange-600",
        cls: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900",
        title: "Abonnement resilie",
        subtitle: sub.currentPeriodEnd
          ? `Actif jusqu'au ${format(new Date(sub.currentPeriodEnd), "dd MMMM yyyy", { locale: fr })}`
          : "",
      };
    }
    // expired
    return {
      icon: XCircle,
      iconCls: "text-red-600",
      cls: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900",
      title: "Abonnement expire",
      subtitle: "Renouvelez pour retrouver l'acces complet.",
    };
  }, [sub]);

  const calcPrice = (def: PlanDef, extra: number) => {
    const base = interval === "month" ? def.monthly : def.yearly;
    const extraCost = extra * (def.extraUserMonth || 0) * (interval === "month" ? 1 : 12 * 0.8);
    return base + extraCost;
  };

  if (isLoading || !sub) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isCurrentPlan = (p: Plan) => sub.plan === p && sub.status !== "expired" && sub.status !== "canceled";

  return (
    <div className="space-y-6">
      {/* SECTION 1 : Statut actuel */}
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
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${Math.max(0, Math.min(100, (sub.trialDaysLeft / 30) * 100))}%` }}
                    />
                  </div>
                )}
                {sub.status === "canceled" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => reactivateMut.mutate()}
                    disabled={reactivateMut.isPending}
                  >
                    Reactiver mon abonnement
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* SECTION 2 : Choix du plan */}
      <Card>
        <CardHeader>
          <CardTitle>Choisir un plan</CardTitle>
          <CardDescription>
            Tous les plans incluent 30 jours d'essai gratuit. Sans engagement, resiliez quand vous voulez.
          </CardDescription>
          <div className="flex items-center gap-3 pt-3">
            <span className={interval === "month" ? "text-sm font-medium" : "text-sm text-muted-foreground"}>Mensuel</span>
            <Switch
              checked={interval === "year"}
              onCheckedChange={(v) => setInterval(v ? "year" : "month")}
            />
            <span className={interval === "year" ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
              Annuel
            </span>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              -20% sur l'annee
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((def) => {
              const extra = extraUsersByPlan[def.id];
              const price = calcPrice(def, extra);
              const periodLabel = interval === "month" ? "/ mois" : "/ an";
              const current = isCurrentPlan(def.id);
              return (
                <div
                  key={def.id}
                  className={`relative rounded-xl border p-5 flex flex-col ${def.highlight ? "border-blue-500 shadow-md" : "border-border"}`}
                >
                  {def.highlight && (
                    <Badge className="absolute -top-2 left-4 bg-blue-600 text-white">Le plus populaire</Badge>
                  )}
                  <div className="mb-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      {def.name}
                      {current && <Badge variant="outline" className="text-xs">Plan actuel</Badge>}
                    </h3>
                    <p className="text-sm text-muted-foreground">{def.description}</p>
                  </div>
                  <div className="mb-3">
                    <span className="text-3xl font-bold tabular-nums">{price.toFixed(0)}€</span>
                    <span className="text-sm text-muted-foreground ml-1">{periodLabel}</span>
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
                      <label className="text-xs text-muted-foreground">Users supplementaires</label>
                      <div className="flex items-center gap-2 mt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0"
                          onClick={() => setExtraUsersByPlan((p) => ({ ...p, [def.id]: Math.max(0, p[def.id] - 1) }))}
                        >−</Button>
                        <span className="text-sm font-medium tabular-nums w-8 text-center">+{extra}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0"
                          onClick={() => setExtraUsersByPlan((p) => ({ ...p, [def.id]: Math.min(50, p[def.id] + 1) }))}
                        >+</Button>
                      </div>
                    </div>
                  )}
                  <Button
                    onClick={() => checkoutMut.mutate({ plan: def.id, interval, extraUsers: extra })}
                    disabled={current || checkoutMut.isPending}
                    className={def.highlight ? "" : "variant-outline"}
                    variant={current ? "outline" : "default"}
                  >
                    {current ? "Plan actuel" : checkoutMut.isPending ? "..." : `Choisir ${def.name}`}
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Besoin de 20+ utilisateurs ? <a href="mailto:contact@operioz.com" className="underline">Contactez-nous pour un devis Agence</a>.
          </p>
        </CardContent>
      </Card>

      {/* SECTION 3 : Mes appareils */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Mes appareils
          </CardTitle>
          <CardDescription>
            {devices.length}/{sub.maxDevicesPerUser} appareil(s) utilise(s). Au-dela, vous devez en deconnecter un.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun appareil enregistre pour le moment.</p>
          ) : (
            <div className="space-y-2">
              {devices.map((d: any) => {
                const Icon = deviceIcon(d.deviceType);
                return (
                  <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {d.browser || "Navigateur"} — {d.os || "OS inconnu"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {relativeTime(d.lastActiveAt)}{d.lastIp ? ` · ${d.lastIp}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={() => revokeMut.mutate({ deviceId: d.id })}
                      disabled={revokeMut.isPending}
                    >
                      Revoquer
                    </Button>
                  </div>
                );
              })}
              {devices.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => revokeAllMut.mutate()}
                  disabled={revokeAllMut.isPending}
                >
                  Deconnecter tous les autres appareils
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 4 : Facturation */}
      {sub.stripeSubscriptionId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Facturation
            </CardTitle>
            <CardDescription>
              Historique des factures, moyen de paiement et gestion de l'abonnement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => portalMut.mutate()}
              disabled={portalMut.isPending}
            >
              {portalMut.isPending ? "..." : "Gerer mon abonnement"}
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* SECTION 5 : Annulation */}
      {sub.stripeSubscriptionId && sub.status === "active" && !sub.cancelAtPeriodEnd && (
        <div className="text-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-red-600"
            onClick={() => setCancelDialogOpen(true)}
          >
            Annuler mon abonnement
          </Button>
        </div>
      )}

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler votre abonnement ?</DialogTitle>
            <DialogDescription>
              Votre abonnement restera actif jusqu'au {sub.currentPeriodEnd ? format(new Date(sub.currentPeriodEnd), "dd MMMM yyyy", { locale: fr }) : "—"}.
              Apres cette date, vous perdrez l'acces a vos donnees (conservees 30 jours).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Garder mon abonnement</Button>
            <Button
              variant="destructive"
              onClick={() => cancelMut.mutate()}
              disabled={cancelMut.isPending}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Confirmer l'annulation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
