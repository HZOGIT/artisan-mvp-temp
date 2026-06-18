import { useEffect } from "react";
import { useLocation } from "@/modern/shared/router/navigation";
import { useTranslation } from "react-i18next";
import { Button } from "@/modern/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { CheckCircle2, ArrowLeft, Receipt } from "lucide-react";

// Page PUBLIQUE (post-Stripe) du FRONT NEUF (`/paiement/succes`) — PORT CONFORME de
// `pages/PaiementSucces.tsx`. Montée hors auth (cf. public-router). i18n namespace `paiement`.
export default function PaiementSuccesPage() {
  const { t } = useTranslation("paiement");
  const [, setLocation] = useLocation();

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  const token = params.get("token");

  useEffect(() => {
    console.log("Payment success - Session:", sessionId, "Token:", token);
  }, [sessionId, token]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl text-green-700">{t("titleSucces")}</CardTitle>
          <CardDescription className="text-base">
            {t("descSucces")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-sm text-green-800">
              {t("infoSucces")}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => window.close()}
              className="w-full"
            >
              <Receipt className="mr-2 h-4 w-4" />
              {t("closeWindow")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/")}
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("backHome")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
