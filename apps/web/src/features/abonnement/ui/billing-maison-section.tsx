import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { CreditCard, Calendar, Receipt, Loader2, Trash2, Star, Plus, XCircle, RotateCcw, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { useBillingMaison } from "../application/use-billing-maison";
import type { BillingPaymentMethod, BillingSubscription, BillingInvoice, PlanId } from "../application/use-billing-maison";
import { AddCardDialog } from "./add-card-dialog";
import { PlanChangeDialog } from "./plan-change-dialog";

const fmtDate = (d: Date | string | null | undefined): string =>
  d ? format(new Date(d), "dd MMM yyyy", { locale: fr }) : "—";

const fmtAmount = (cents: number, currency = "eur"): string =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

const STATUS_LABELS: Record<string, string> = {
  trialing: "Période d'essai",
  active: "Actif",
  past_due: "Paiement en retard",
  canceled: "Annulé",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  open: "En attente",
  paid: "Payé",
  void: "Annulé",
  uncollectible: "Irrécouvrable",
};

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  jcb: "JCB",
  diners: "Diners Club",
  unionpay: "UnionPay",
};

function subStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "trialing") return "secondary";
  if (status === "past_due" || status === "canceled") return "destructive";
  return "outline";
}

function SubscriptionCard({
  sub,
  planName,
  onCancel,
  onReactivate,
  isCanceling,
  isReactivating,
}: {
  sub: BillingSubscription;
  planName: string | undefined;
  onCancel: () => Promise<void>;
  onReactivate: () => Promise<void>;
  isCanceling: boolean;
  isReactivating: boolean;
}) {
  const { t } = useTranslation("abonnement");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const isCancelScheduled = sub.cancel_at !== null;

  const handleCancel = async () => {
    try {
      await onCancel();
      toast.success(t("billingMaison.annulationProgrammee", "Annulation programmée à fin de période."));
    } catch {
      toast.error(t("billingMaison.erreurAnnulation", "Impossible d'annuler l'abonnement."));
    } finally {
      setConfirmCancel(false);
    }
  };

  const handleReactivate = async () => {
    try {
      await onReactivate();
      toast.success(t("billingMaison.reactivationOk", "Abonnement réactivé."));
    } catch {
      toast.error(t("billingMaison.erreurReactivation", "Impossible de réactiver l'abonnement."));
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {t("billingMaison.abonnement", "Abonnement")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("billingMaison.plan", "Plan")}</span>
            <span className="font-medium">{planName ?? sub.plan_id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("billingMaison.statut", "Statut")}</span>
            <Badge variant={subStatusVariant(sub.status)}>
              {STATUS_LABELS[sub.status] ?? sub.status}
            </Badge>
          </div>
          {sub.current_period_start && sub.current_period_end && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("billingMaison.periode", "Période en cours")}
              </span>
              <span className="text-sm">
                {fmtDate(sub.current_period_start)} → {fmtDate(sub.current_period_end)}
              </span>
            </div>
          )}
          {sub.status === "trialing" && sub.trial_ends_at && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("billingMaison.finEssai", "Fin de l'essai")}
              </span>
              <span className="text-sm">{fmtDate(sub.trial_ends_at)}</span>
            </div>
          )}
          {isCancelScheduled && sub.cancel_at && (
            <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
              <span className="text-sm text-destructive">
                {t("billingMaison.annulationLe", "Annulation le")} {fmtDate(sub.cancel_at)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={isReactivating}
                onClick={handleReactivate}
                className="gap-1.5"
              >
                {isReactivating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                {t("billingMaison.reactiverBtn", "Réactiver")}
              </Button>
            </div>
          )}
          {!isCancelScheduled && (sub.status === "active" || sub.status === "trialing") && (
            <div className="pt-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={isCanceling}
                onClick={() => setConfirmCancel(true)}
                className="gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <XCircle className="h-3.5 w-3.5" />
                {t("billingMaison.annulerBtn", "Annuler l'abonnement")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("billingMaison.confirmAnnulTitre", "Annuler l'abonnement ?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("billingMaison.confirmAnnulDesc", "L'abonnement restera actif jusqu'à la fin de la période en cours, puis ne sera pas renouvelé.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("billingMaison.annuler", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCanceling ? <Loader2 className="h-4 w-4 animate-spin" /> : t("billingMaison.confirmerAnnul", "Confirmer l'annulation")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PaymentMethodsCard({
  paymentMethods,
  onRevoke,
  onSetDefault,
  onAddCard,
  isRevoking,
  isSettingDefault,
}: {
  paymentMethods: BillingPaymentMethod[];
  onRevoke: (id: number) => Promise<void>;
  onSetDefault: (id: number) => Promise<void>;
  onAddCard: () => void;
  isRevoking: boolean;
  isSettingDefault: boolean;
}) {
  const { t } = useTranslation("abonnement");
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);

  const handleRevoke = async () => {
    if (confirmRevokeId == null) return;
    try {
      await onRevoke(confirmRevokeId);
      toast.success(t("billingMaison.carteSuprimee", "Carte supprimée."));
    } catch {
      toast.error(t("billingMaison.erreurRevoke", "Impossible de supprimer la carte."));
    } finally {
      setConfirmRevokeId(null);
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await onSetDefault(id);
      toast.success(t("billingMaison.carteDefautOk", "Carte définie par défaut."));
    } catch {
      toast.error(t("billingMaison.erreurSetDefault", "Impossible de changer la carte par défaut."));
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              {t("billingMaison.cartes", "Cartes enregistrées")}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={onAddCard} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t("billingMaison.ajouterCarte", "Ajouter")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {paymentMethods.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("billingMaison.aucuneCarte", "Aucune carte enregistrée.")}
            </p>
          ) : (
            <ul className="space-y-2">
              {paymentMethods.map((pm) => (
                <li
                  key={pm.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {pm.brand ? (BRAND_LABELS[pm.brand] ?? pm.brand) : "Carte"} •••• {pm.last4 ?? "????"}
                    </span>
                    {pm.exp_month != null && pm.exp_year != null && (
                      <span className="text-xs text-muted-foreground">
                        {String(pm.exp_month).padStart(2, "0")}/{pm.exp_year}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {pm.is_default ? (
                      <Badge variant="secondary">
                        {t("billingMaison.parDefaut", "Par défaut")}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isSettingDefault}
                        onClick={() => handleSetDefault(pm.id)}
                        title={t("billingMaison.definirParDefaut", "Définir par défaut")}
                      >
                        {isSettingDefault ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Star className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isRevoking}
                      onClick={() => setConfirmRevokeId(pm.id)}
                      title={t("billingMaison.supprimer", "Supprimer cette carte")}
                      className="text-destructive hover:text-destructive"
                    >
                      {isRevoking && confirmRevokeId === pm.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmRevokeId != null} onOpenChange={(open) => { if (!open) setConfirmRevokeId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("billingMaison.confirmSupprTitre", "Supprimer cette carte ?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("billingMaison.confirmSupprDesc", "Cette action est irréversible. La carte sera révoquée immédiatement.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("billingMaison.annuler", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isRevoking ? <Loader2 className="h-4 w-4 animate-spin" /> : t("billingMaison.supprimer", "Supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const PLAN_CATALOG: Array<{ id: PlanId; name: string; monthly: number }> = [
  { id: "starter", name: "Starter", monthly: 29 },
  { id: "pro", name: "Pro", monthly: 49 },
  { id: "enterprise", name: "Enterprise", monthly: 99 },
];

function PlanSelectorCard({
  currentPlanId,
  onChangePlan,
  isChangingPlan,
}: {
  currentPlanId: string;
  onChangePlan: (planId: PlanId) => Promise<void>;
  isChangingPlan: boolean;
}) {
  const { t } = useTranslation("abonnement");
  const [confirmingPlan, setConfirmingPlan] = useState<PlanId | null>(null);

  const handleConfirm = async () => {
    if (!confirmingPlan) return;
    try {
      await onChangePlan(confirmingPlan);
      toast.success(t("billingMaison.planChange", "Plan mis à jour."));
      setConfirmingPlan(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      toast.error(msg ?? t("billingMaison.erreurPlan", "Impossible de changer de plan."));
    }
  };

  const confirmingPlanDef = PLAN_CATALOG.find((p) => p.id === confirmingPlan);
  const currentPlanDef = PLAN_CATALOG.find((p) => p.id === currentPlanId);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {t("billingMaison.changerPlan", "Changer de plan")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {PLAN_CATALOG.map((plan) => {
              const isCurrent = plan.id === currentPlanId;
              return (
                <div
                  key={plan.id}
                  className={`flex flex-col gap-2 rounded-lg border p-4 ${isCurrent ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{plan.name}</span>
                    {isCurrent && (
                      <Badge variant="secondary" className="text-xs">
                        {t("billingMaison.planActuel", "Actuel")}
                      </Badge>
                    )}
                  </div>
                  <span className="text-2xl font-bold tabular-nums">
                    {plan.monthly}€
                    <span className="text-sm font-normal text-muted-foreground">{t("billingMaison.parMois", "/mois TTC")}</span>
                  </span>
                  {!isCurrent && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isChangingPlan}
                      onClick={() => setConfirmingPlan(plan.id)}
                      className="mt-auto"
                    >
                      {t("billingMaison.choisir", "Choisir")}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {confirmingPlan && confirmingPlanDef && (
        <PlanChangeDialog
          open
          targetPlanId={confirmingPlan}
          targetPlanName={confirmingPlanDef.name}
          currentPlanName={currentPlanDef?.name ?? currentPlanId}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmingPlan(null)}
          isConfirming={isChangingPlan}
        />
      )}
    </>
  );
}

function InvoicesCard({
  invoices,
  onDownload,
  isDownloading,
}: {
  invoices: BillingInvoice[];
  onDownload: (invoiceId: number) => Promise<{ url: string }>;
  isDownloading: boolean;
}) {
  const { t } = useTranslation("abonnement");
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          {t("billingMaison.factures", "Factures récentes")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("billingMaison.aucuneFacture", "Aucune facture.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{inv.number ?? `#${inv.id}`}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(inv.paid_at ?? inv.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{fmtAmount(inv.total_cents, inv.currency)}</span>
                  <Badge variant={inv.status === "paid" ? "default" : "secondary"}>
                    {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isDownloading}
                    onClick={() => {
                      onDownload(inv.id).then(({ url }: { url: string }) => {
                        window.open(url, "_blank", "noopener,noreferrer");
                      }).catch(() => {
                        toast.error(t("billingMaison.erreurTelechargement", "Impossible de télécharger la facture."));
                      });
                    }}
                    title={t("billingMaison.telecharger", "Télécharger la facture PDF")}
                  >
                    {isDownloading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function BillingMaisonSection() {
  const { t } = useTranslation("abonnement");
  const {
    billingInfo, isLoading, isError,
    revokePaymentMethod, isRevoking,
    setDefaultPaymentMethod, isSettingDefault,
    changePlan, isChangingPlan,
    cancelAtPeriodEnd, isCanceling,
    reactivate, isReactivating,
    downloadInvoice, isDownloadingInvoice,
  } = useBillingMaison();
  const [addCardOpen, setAddCardOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        {t("billingMaison.erreur", "Impossible de charger les informations de facturation.")}
      </p>
    );
  }

  if (!billingInfo) return null;

  const { subscription, paymentMethods, recentInvoices, plan } = billingInfo;

  return (
    <div className="space-y-4">
      {subscription ? (
        <>
          <SubscriptionCard
            sub={subscription}
            planName={plan?.name}
            onCancel={cancelAtPeriodEnd}
            onReactivate={reactivate}
            isCanceling={isCanceling}
            isReactivating={isReactivating}
          />
          <PlanSelectorCard
            currentPlanId={subscription.plan_id}
            onChangePlan={changePlan}
            isChangingPlan={isChangingPlan}
          />
        </>
      ) : (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              {t("billingMaison.aucunAbonnement", "Aucun abonnement maison actif.")}
            </p>
          </CardContent>
        </Card>
      )}
      <PaymentMethodsCard
        paymentMethods={paymentMethods}
        onRevoke={revokePaymentMethod}
        onSetDefault={setDefaultPaymentMethod}
        onAddCard={() => setAddCardOpen(true)}
        isRevoking={isRevoking}
        isSettingDefault={isSettingDefault}
      />
      <AddCardDialog open={addCardOpen} onOpenChange={setAddCardOpen} />
      <InvoicesCard
        invoices={recentInvoices}
        onDownload={downloadInvoice}
        isDownloading={isDownloadingInvoice}
      />
    </div>
  );
}
