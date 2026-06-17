import { Trans, useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Layers, FileText, ArrowRight, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";

// Page /v2/devis-options — port conforme du placeholder explicatif legacy `pages/DevisOptions.tsx`.
// Présentation pure (aucune donnée tRPC) : renvoie l'utilisateur vers la gestion des variantes depuis
// le détail d'un devis. Navigation via wouter `Link` (le routeur neuf est monté dans l'arbre wouter ;
// la bascule strangler redirige `/devis` vers `/v2/devis` le cas échéant).
export default function DevisOptionsPage() {
  const { t } = useTranslation("devisOptions");
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Layers className="h-7 w-7 text-blue-600" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
            <Info className="h-5 w-5" /> {t("cardTitle")}
          </CardTitle>
          <CardDescription>{t("cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside text-sm space-y-2 text-foreground">
            <li>{t("step1")}</li>
            <li>{t("step2")}</li>
            <li><Trans i18nKey="step3" ns="devisOptions" components={{ strong: <strong />, em: <em /> }} /></li>
            <li>{t("step4")}</li>
          </ol>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button asChild className="min-h-[44px] flex-1">
              <Link to="/devis">
                <FileText className="h-4 w-4 mr-2" />
                {t("ouvrirDevis")}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-[44px] flex-1">
              <Link to="/devis/nouveau">{t("creerDevis")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        <Trans i18nKey="astuce" ns="devisOptions" components={{ code: <code className="font-mono" /> }} />
      </p>
    </div>
  );
}
