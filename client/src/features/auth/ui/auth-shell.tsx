import { useTranslation } from "react-i18next";
import { Wrench, ArrowRight } from "lucide-react";
import { Button } from "@/shared/ui/button";

// Coque commune des pages d'auth publiques : en-tête (logo + lien retour) + carte centrée. Markup legacy.
export function AuthShell({ backHref, backLabel, children }: { backHref: string; backLabel: string; children: React.ReactNode }) {
  const { t } = useTranslation("auth");
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-foreground">{t("operioz")}</span>
          </div>
          <Button variant="outline" asChild><a href={backHref}>{backLabel}<ArrowRight className="ml-2 h-4 w-4" /></a></Button>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center py-12 px-4">{children}</div>
    </div>
  );
}
