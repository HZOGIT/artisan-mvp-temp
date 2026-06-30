import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CreditCard, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { navigate } from "@/shared/router/navigation";
import { useConnect } from "../application/use-connect";

export default function PaiementsPage() {
  const { t } = useTranslation("paiements");
  const { connectStatus, startOnboarding } = useConnect();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connect") === "return") {
      toast.info(t("connectRetourStripe"));
      navigate("/paiements", { replace: true });
    }
  }, []);

  const statusBadge = () => {
    const s = connectStatus.data?.status;
    if (s === "active") return <Badge className="bg-green-100 text-green-800">{t("connectActif")}</Badge>;
    if (s === "pending") return <Badge className="bg-yellow-100 text-yellow-800">{t("connectEnCours")}</Badge>;
    if (s === "restricted") return <Badge className="bg-orange-100 text-orange-800">{t("connectRestreint")}</Badge>;
    if (s === "deauthorized") return <Badge variant="destructive">{t("connectDeconnecte")}</Badge>;
    return null;
  };

  const handleOnboard = () => {
    startOnboarding.mutate(undefined, {
      onSuccess: (d) => { window.location.href = d.url; },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t("connectTitre")}
            {statusBadge()}
          </CardTitle>
          <CardDescription>{t("connectDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectStatus.isLoading ? (
            <div className="animate-pulse h-8 bg-muted rounded" />
          ) : connectStatus.data?.status === "active" ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-800">{t("connectActifMsg")}</p>
                <p className="text-sm text-green-700">{t("connectActifDetail")}</p>
              </div>
            </div>
          ) : connectStatus.data?.status === "pending" || connectStatus.data?.status === "restricted" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <Clock className="h-6 w-6 text-yellow-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-yellow-800">{t("connectIncompletMsg")}</p>
                  <p className="text-sm text-yellow-700">{t("connectIncompletDetail")}</p>
                </div>
              </div>
              <Button onClick={handleOnboard} disabled={startOnboarding.isPending}>
                {startOnboarding.isPending ? t("connectChargement") : t("connectCompleter")}
              </Button>
            </div>
          ) : connectStatus.data?.status === "deauthorized" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
                <p className="font-medium text-red-800">{t("connectDeconnecteMsg")}</p>
              </div>
              <Button onClick={handleOnboard} disabled={startOnboarding.isPending}>
                {startOnboarding.isPending ? t("connectChargement") : t("connectReconnecter")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t("connectNonConnecteDetail")}</p>
              <Button onClick={handleOnboard} disabled={startOnboarding.isPending}>
                {startOnboarding.isPending ? t("connectChargement") : t("connectCTA")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
