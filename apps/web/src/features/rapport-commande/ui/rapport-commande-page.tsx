import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Package, Building2, FileDown, AlertTriangle, Printer, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { useRapportCommande } from "../application/use-rapport-commande";
import { formatCurrency, totalArticles, totalMontant, type CommandeFournisseur } from "../domain/rapport-commande";
import { exportBonCommande, exportRapportGlobal } from "./pdf-export";

/*
 * Page `rapport-commande` (articles en rupture à commander) — migration clean-archi de
 * `pages/RapportCommande.tsx`. Markup à l'identique. Export PDF dans `pdf-export.ts` (autoTable typé).
 */
export default function RapportCommandePage() {
  const { t } = useTranslation("rapportCommande");
  const { rapport, artisan, isLoading } = useRapportCommande();

  const handleExportBon = (commande: CommandeFournisseur) => {
    exportBonCommande(commande, artisan);
    toast.success(t("toastBonExporte"));
  };
  const handleExportGlobal = () => {
    exportRapportGlobal(rapport);
    toast.success(t("toastGlobalExporte"));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("titre")}</h1>
          <p className="text-muted-foreground">{t("sousTitre")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportGlobal} disabled={rapport.length === 0}>
            <FileDown className="mr-2 h-4 w-4" />
            {t("exporterTout")}
          </Button>
        </div>
      </div>

      {/* Résumé */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("articlesACommander")}</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalArticles(rapport)}</div>
            <p className="text-xs text-muted-foreground">{t("enRupture")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("fournisseursConcernes")}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rapport.length}</div>
            <p className="text-xs text-muted-foreground">{t("aContacter")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("montantEstime")}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalMontant(rapport))}</div>
            <p className="text-xs text-muted-foreground">{t("ht")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Liste par fournisseur */}
      {rapport.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">{t("aucunTitre")}</h3>
            <p className="text-muted-foreground text-center mt-2">{t("aucunDesc")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {rapport.map((commande, index) => (
            <Card key={index}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-6 w-6 text-primary" />
                    <div>
                      <CardTitle>{commande.fournisseur?.nom || t("sansFournisseur")}</CardTitle>
                      {commande.fournisseur && (
                        <CardDescription>
                          {commande.fournisseur.contact && `Contact: ${commande.fournisseur.contact}`}
                          {commande.fournisseur.email && ` • ${commande.fournisseur.email}`}
                          {commande.fournisseur.telephone && ` • ${commande.fournisseur.telephone}`}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{t("articlesCount", { count: commande.lignes.length })}</Badge>
                    <Button variant="outline" size="sm" onClick={() => handleExportBon(commande)}>
                      <Printer className="mr-2 h-4 w-4" />
                      {t("bonCommande")}
                    </Button>
                    {commande.fournisseur?.email && (
                      <Button variant="outline" size="sm" onClick={() => {
                        window.location.href = `mailto:${commande.fournisseur!.email}?subject=${encodeURIComponent(t("mailSubject"))}`;
                        toast.info(t("toastEmail"));
                      }}>
                        <Mail className="mr-2 h-4 w-4" />
                        {t("email")}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2 font-medium">{t("colDesignation")}</th>
                        <th className="text-right p-2 font-medium whitespace-nowrap">{t("colStock")}</th>
                        <th className="text-right p-2 font-medium whitespace-nowrap">{t("colACommander")}</th>
                        <th className="text-right p-2 font-medium whitespace-nowrap">{t("colTotal")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commande.lignes.map((ligne, ligneIndex) => (
                        <tr key={ligneIndex} className="border-t">
                          <td className="p-2">{ligne.stock.designation}</td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <Badge variant={Number(ligne.stock.quantiteEnStock) <= 0 ? "destructive" : "outline"}>
                              {ligne.stock.quantiteEnStock} {ligne.stock.unite}
                            </Badge>
                          </td>
                          <td className="p-2 text-right font-medium whitespace-nowrap">{ligne.quantiteACommander} {ligne.stock.unite}</td>
                          <td className="p-2 text-right font-medium whitespace-nowrap">{formatCurrency(ligne.montantTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/50">
                      <tr>
                        <td colSpan={3} className="p-2 text-right font-medium">{t("totalCommande")}</td>
                        <td className="p-2 text-right font-bold text-lg">{formatCurrency(commande.totalCommande)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
