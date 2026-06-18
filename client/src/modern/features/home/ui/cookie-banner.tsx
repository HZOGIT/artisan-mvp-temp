import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Cookie, X } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";

// Bandeau cookies RGPD (landing). Re-port de components/CookieBanner (i18n, lien /v2).
const STORAGE_KEY = "operioz:cookie-consent";
export function CookieBanner() {
  const { t } = useTranslation("home");
  const [visible, setVisible] = useState(false);
  useEffect(() => { try { if (!localStorage.getItem(STORAGE_KEY)) setVisible(true); } catch { /* incognito */ } }, []);
  const decide = (value: "accepted" | "refused") => { try { localStorage.setItem(STORAGE_KEY, value); } catch { /* noop */ } setVisible(false); };
  if (!visible) return null;
  return (
    <div role="region" aria-label={t("cb_region")} className="fixed bottom-4 inset-x-4 sm:bottom-6 sm:right-6 sm:left-auto sm:max-w-md z-50 rounded-xl border border-border bg-card text-card-foreground shadow-2xl p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-600 shrink-0"><Cookie className="h-5 w-5" /></div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{t("cb_titre")}</h3>
          <p className="text-xs text-muted-foreground mt-1">{t("cb_texte1")} <strong>{t("cb_necessaires")}</strong> {t("cb_texte2")} <Link to="/v2/confidentialite" className="underline">{t("cb_enSavoirPlus")}</Link>.</p>
        </div>
        <button type="button" onClick={() => decide("refused")} aria-label={t("cb_fermer")} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex gap-2 mt-4">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => decide("refused")}>{t("cb_refuser")}</Button>
        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => decide("accepted")}>{t("cb_accepter")}</Button>
      </div>
    </div>
  );
}
