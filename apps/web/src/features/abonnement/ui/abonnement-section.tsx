import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Smartphone, Laptop, Tablet, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { useAbonnement } from "../application/use-abonnement";
import { BillingMaisonSection } from "./billing-maison-section";
import { relativeTime } from "../domain/abonnement";
import { trpc } from "@/shared/trpc";

function deviceIcon(type: string) {
  if (type === "mobile") return Smartphone;
  if (type === "tablet") return Tablet;
  return Laptop;
}

export function AbonnementSection() {
  const { t } = useTranslation("abonnement");
  const { devices, isLoading, revoke, revokeAll } = useAbonnement();
  const subQ = trpc.subscription.getCurrent.useQuery();
  const sub = subQ.data;

  return (
    <div className="space-y-6">
      <BillingMaisonSection />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            {t("mesAppareils")}
          </CardTitle>
          <CardDescription>
            {t("appareilsDesc", { count: devices.length, max: sub?.maxDevicesPerUser ?? 3 })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : devices.length === 0 ? (
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={() => revoke.mutate({ deviceId: d.id }, { onSuccess: () => toast.success(t("appareilRevoque")) })}
                      disabled={revoke.isPending}
                    >
                      {t("revoquer")}
                    </Button>
                  </div>
                );
              })}
              {devices.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => revokeAll.mutate(undefined, { onSuccess: (res) => toast.success(t("appareilsDeconnectes", { count: res.removed })) })}
                  disabled={revokeAll.isPending}
                >
                  {t("deconnecterAutres")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
