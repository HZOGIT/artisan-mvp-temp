import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CreditCard, Calendar, Receipt, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { useBillingMaison } from "../application/use-billing-maison";
import type { BillingPaymentMethod, BillingSubscription, BillingInvoice } from "../application/use-billing-maison";

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
}: {
  sub: BillingSubscription;
  planName: string | undefined;
}) {
  const { t } = useTranslation("abonnement");
  return (
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
      </CardContent>
    </Card>
  );
}

function PaymentMethodsCard({ paymentMethods }: { paymentMethods: BillingPaymentMethod[] }) {
  const { t } = useTranslation("abonnement");
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          {t("billingMaison.cartes", "Cartes enregistrées")}
        </CardTitle>
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
                {pm.is_default && (
                  <Badge variant="secondary">
                    {t("billingMaison.parDefaut", "Par défaut")}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function InvoicesCard({ invoices }: { invoices: BillingInvoice[] }) {
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
  const { billingInfo, isLoading, isError } = useBillingMaison();

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
        <SubscriptionCard sub={subscription} planName={plan?.name} />
      ) : (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              {t("billingMaison.aucunAbonnement", "Aucun abonnement maison actif.")}
            </p>
          </CardContent>
        </Card>
      )}
      <PaymentMethodsCard paymentMethods={paymentMethods} />
      <InvoicesCard invoices={recentInvoices} />
    </div>
  );
}
