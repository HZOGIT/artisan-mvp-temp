import { useTranslation } from "react-i18next";
import { Button } from "@/modern/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { XCircle, ArrowLeft, RefreshCw } from "lucide-react";

// Page PUBLIQUE (post-Stripe) du FRONT NEUF (`/v2/paiement/annule`) — PORT CONFORME de
// `pages/PaiementAnnule.tsx`. Montée hors auth (cf. public-router). i18n namespace `paiement`.
// (Le legacy importe `useLocation` mais ne l'utilise pas — supprimé ici.)
export default function PaiementAnnulePage() {
  const { t } = useTranslation("paiement");

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <XCircle className="w-10 h-10 text-orange-600" />
          </div>
          <CardTitle className="text-2xl text-orange-700">{t("titleAnnule")}</CardTitle>
          <CardDescription className="text-base">
            {t("descAnnule")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-orange-50 p-4 rounded-lg">
            <p className="text-sm text-orange-800">
              {t("infoAnnule")}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => window.history.back()}
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("retry")}
            </Button>
            <Button
              variant="outline"
              onClick={() => window.close()}
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("closeWindow")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
