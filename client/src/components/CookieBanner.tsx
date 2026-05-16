import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Cookie, X } from "lucide-react";

// Banner cookies RGPD, affichee sur la landing page uniquement pour les
// visiteurs n'ayant pas encore fait de choix. Stocke le choix dans
// localStorage pour ne plus reapparaitre.

const STORAGE_KEY = "operioz:cookie-consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const choice = localStorage.getItem(STORAGE_KEY);
      if (!choice) setVisible(true);
    } catch {
      // localStorage indispo (mode incognito strict) — on n'affiche pas.
    }
  }, []);

  const decide = (value: "accepted" | "refused") => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch { /* noop */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Bandeau cookies"
      className="fixed bottom-4 inset-x-4 sm:bottom-6 sm:right-6 sm:left-auto sm:max-w-md z-50 rounded-xl border border-border bg-card text-card-foreground shadow-2xl p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-600 shrink-0">
          <Cookie className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">Cookies</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Nous utilisons uniquement des cookies <strong>strictement nécessaires</strong> au
            fonctionnement du service (session, préférences). Aucun cookie publicitaire ni de tracking.{" "}
            <Link to="/confidentialite" className="underline">En savoir plus</Link>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => decide("refused")}
          aria-label="Fermer"
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-2 mt-4">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => decide("refused")}>
          Refuser
        </Button>
        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => decide("accepted")}>
          Accepter
        </Button>
      </div>
    </div>
  );
}
