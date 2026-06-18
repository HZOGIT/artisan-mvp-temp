import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { XCircle, RefreshCw, Download, MessageCircle } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { Card, CardContent } from "@/modern/shared/ui/card";
import { trpc } from "@/modern/shared/trpc";

// Écran de blocage du SHELL modern (abonnement expiré). PORT FIDÈLE d'ExpiredBlocker : rendu À LA PLACE des
// children quand `accountBlockState().isBlocked` et que la route n'est pas tolérée (cf. layout/câblage).
// Renouvellement → /v2 abonnement ; portail Stripe ; auto-reload si le sub redevient actif.
export function ExpiredBlocker({ onExportData }: { onExportData?: () => void }) {
  const { t } = useTranslation("shell");
  const [, setLocation] = useLocation();
  const { data: sub } = trpc.subscription.getCurrent.useQuery();
  const portalMut = trpc.subscription.createPortal.useMutation({
    onSuccess: (res) => { if (res.url) window.location.href = res.url; },
  });

  useEffect(() => {
    if (sub && (sub.status === "active" || sub.status === "trialing")) window.location.reload();
  }, [sub?.status]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardContent className="py-10 px-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40 mb-4">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{t("aboExpire")}</h1>
          <p className="text-muted-foreground mb-6">
            {t("renouvelezAcces")}<br /><span className="text-sm">{t("donneesConservees")}</span>
          </p>
          <div className="space-y-2">
            <Button className="w-full" onClick={() => setLocation("/v2/parametres?tab=abonnement")}>
              <RefreshCw className="h-4 w-4 mr-2" />{t("renouvelerAbo")}
            </Button>
            {sub?.stripeSubscriptionId && (
              <Button variant="outline" className="w-full" onClick={() => portalMut.mutate()} disabled={portalMut.isPending}>
                {t("gererAboStripe")}
              </Button>
            )}
            {onExportData && (
              <Button variant="ghost" className="w-full" onClick={onExportData}>
                <Download className="h-4 w-4 mr-2" />{t("exporterDonnees")}
              </Button>
            )}
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => window.open("mailto:contact@operioz.com", "_blank")}>
              <MessageCircle className="h-4 w-4 mr-2" />{t("contacterSupport")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
