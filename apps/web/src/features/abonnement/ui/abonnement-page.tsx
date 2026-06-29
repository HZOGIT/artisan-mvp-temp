import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AbonnementSection } from "./abonnement-section";

export default function AbonnementPage() {
  const { t } = useTranslation("abonnement");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      toast.success("Abonnement actif. Bienvenue !");
      window.history.replaceState(null, "", "/abonnement");
    } else if (params.get("canceled") === "1") {
      toast("Paiement annulé, vous pouvez réessayer quand vous voulez.");
      window.history.replaceState(null, "", "/abonnement");
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("pageTitre")}</h1>
        <p className="text-muted-foreground mt-1">{t("pageSousTitre")}</p>
      </div>
      <AbonnementSection />
    </div>
  );
}
