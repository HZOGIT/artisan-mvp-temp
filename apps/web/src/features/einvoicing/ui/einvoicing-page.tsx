import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { useEinvoicing } from "../application/use-einvoicing";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";

function statutVariant(s: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (s === "done") return "default";
  if (s === "pending") return "secondary";
  if (s != null) return "destructive";
  return "outline";
}

export default function EinvoicingPage() {
  const { t } = useTranslation("einvoicing");
  const {
    statut,
    isLoadingStatut,
    facturesEntrantes,
    isLoadingFactures,
    onboard,
    isOnboarding,
    marquerLu,
  } = useEinvoicing();

  const handleActivate = async () => {
    try {
      await onboard();
    } catch {
      toast.error(t("erreur_activation"));
    }
  };

  const statutLabel =
    statut?.statutProvisioning === "done"
      ? t("done")
      : statut?.statutProvisioning === "pending"
        ? t("pending")
        : statut?.statutProvisioning != null
          ? t("error")
          : t("non_provisionne");

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("statutSection")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {statut?.paDisponible === false && (
            <div className="rounded-md bg-yellow-50 border border-yellow-300 px-4 py-3 text-sm text-yellow-800">
              {t("pa_non_configure")}
            </div>
          )}
          {isLoadingStatut ? (
            <div className="h-5 w-36 bg-muted animate-pulse rounded" />
          ) : (
            <div className="flex items-center gap-3">
              <Badge variant={statutVariant(statut?.statutProvisioning)}>
                {statutLabel}
              </Badge>
              {statut?.kybStatut && (
                <span className="text-sm text-muted-foreground">{statut.kybStatut}</span>
              )}
            </div>
          )}
          {!isLoadingStatut && statut?.statutProvisioning !== "done" && statut?.paDisponible !== false && (
            <Button onClick={handleActivate} disabled={isOnboarding}>
              {isOnboarding ? t("activation_en_cours") : t("activate")}
            </Button>
          )}
          {statut?.derniereErreur && (
            <p className="text-sm text-destructive">{statut.derniereErreur}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("factures_entrantes")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingFactures ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : facturesEntrantes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucune_facture")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="pb-2 font-medium">{t("emetteur")}</th>
                  <th className="pb-2 font-medium">{t("montant")}</th>
                  <th className="pb-2 font-medium">{t("date")}</th>
                  <th className="pb-2 font-medium">{t("statut")}</th>
                </tr>
              </thead>
              <tbody>
                {facturesEntrantes.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => { if (!f.lu) marquerLu(f.id); }}
                  >
                    <td className="py-2">{f.emetteurSiret ?? "—"}</td>
                    <td className="py-2">{f.montantTTC ?? "—"}</td>
                    <td className="py-2">
                      {f.date ? format(new Date(f.date), "dd/MM/yyyy") : "—"}
                    </td>
                    <td className="py-2">
                      <Badge variant={f.lu ? "secondary" : "default"}>
                        {f.lu ? t("lu") : t("non_lu")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
