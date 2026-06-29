import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Loader2, ClipboardList, CheckCircle, AlertTriangle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useInventaire, useInventaireDetail } from "../application/use-stocks";
import type { InventaireLigne } from "../domain/stock";

function fmt2(v: string | null | undefined) {
  return v != null ? parseFloat(v).toFixed(2) : "—";
}

function EcartBadge({ ecart }: { ecart: string | null }) {
  if (ecart === null) return <span className="text-muted-foreground text-xs">—</span>;
  const n = parseFloat(ecart);
  if (n === 0) return <Badge variant="secondary">0</Badge>;
  return (
    <Badge variant={n > 0 ? "default" : "destructive"}>
      {n > 0 ? "+" : ""}{ecart}
    </Badge>
  );
}

function ComptageRow({
  ligne,
  onSaisir,
  pending,
}: {
  ligne: InventaireLigne;
  onSaisir: (ligneId: number, qte: string) => void;
  pending: boolean;
}) {
  const [val, setVal] = useState(ligne.quantiteReelle ?? "");
  return (
    <tr className="border-t">
      <td className="p-2">
        <div className="font-medium text-sm">{ligne.designation}</div>
        <div className="text-xs text-muted-foreground">{ligne.reference}</div>
      </td>
      <td className="text-right p-2 font-mono text-sm">{fmt2(ligne.quantiteTheorique)}</td>
      <td className="p-2 w-28">
        <Input
          type="number"
          min="0"
          step="1"
          className="h-8 text-sm text-right"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            if (val !== "" && val !== (ligne.quantiteReelle ?? "")) {
              onSaisir(ligne.id, val);
            }
          }}
          disabled={pending}
        />
      </td>
      <td className="text-right p-2">
        <EcartBadge ecart={ligne.ecart} />
      </td>
    </tr>
  );
}

export default function InventaireTab() {
  const { t } = useTranslation("stocks");
  const { inventaires, isLoading, demarrer, saisirComptage, valider } = useInventaire();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmValiderOpen, setConfirmValiderOpen] = useState(false);
  const { detail, isLoading: detailLoading } = useInventaireDetail(selectedId);

  const handleDemarrer = () =>
    demarrer.mutate(
      { date: new Date().toISOString().slice(0, 10) },
      {
        onSuccess: (data) => {
          setSelectedId(data.inventaire.id);
          toast.success(t("invStarted", { count: data.lignes.length }));
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const handleSaisir = (ligneId: number, qte: string) =>
    saisirComptage.mutate(
      { ligneId, quantiteReelle: qte },
      { onError: (e) => toast.error(e.message) },
    );

  const handleValider = () => {
    if (selectedId === null) return;
    valider.mutate(
      { id: selectedId },
      {
        onSuccess: (data) => {
          setConfirmValiderOpen(false);
          toast.success(
            t("invValidated", { count: data.ajustementsCreees, valeur: data.valeurEcart.toFixed(2) }),
          );
        },
        onError: (e) => {
          setConfirmValiderOpen(false);
          toast.error(e.message);
        },
      },
    );
  };

  const activeDetail = selectedId !== null ? detail : null;
  const invSelected = activeDetail?.inventaire ?? null;
  const lignes = activeDetail?.lignes ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("invSubtitle")}</p>
        <Button onClick={handleDemarrer} disabled={demarrer.isPending}>
          {demarrer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <ClipboardList className="mr-2 h-4 w-4" />
          {t("invStart")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Liste des inventaires */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("invList")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {inventaires.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t("invEmpty")}</div>
            ) : (
              <ul className="divide-y">
                {inventaires.map((inv) => (
                  <li key={inv.id}>
                    <button
                      type="button"
                      className={`w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors ${selectedId === inv.id ? "bg-muted" : ""}`}
                      onClick={() => setSelectedId(inv.id)}
                    >
                      <div>
                        <div className="text-sm font-medium">
                          {new Date(inv.date).toLocaleDateString("fr-FR")}
                        </div>
                        {inv.note && <div className="text-xs text-muted-foreground">{inv.note}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={inv.statut === "valide" ? "secondary" : "outline"}>
                          {inv.statut === "valide" ? (
                            <><CheckCircle className="h-3 w-3 mr-1" />{t("invValide")}</>
                          ) : t("invBrouillon")}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Détail inventaire sélectionné */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {invSelected
                  ? t("invDetailTitle", { date: new Date(invSelected.date).toLocaleDateString("fr-FR") })
                  : t("invSelectPrompt")}
              </CardTitle>
              {invSelected?.statut === "brouillon" && (
                <Button size="sm" onClick={() => setConfirmValiderOpen(true)} disabled={valider.isPending}>
                  <CheckCircle className="mr-1 h-4 w-4" />
                  {t("invValiderBtn")}
                </Button>
              )}
            </div>
            {invSelected?.valeurEcart && (
              <CardDescription>
                {t("invValeurEcart", { valeur: parseFloat(invSelected.valeurEcart).toFixed(2) })}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {selectedId === null ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t("invSelectPrompt")}</div>
            ) : detailLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : lignes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t("invNoLines")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">{t("invThArticle")}</th>
                      <th className="text-right p-2 whitespace-nowrap">{t("invThTheorique")}</th>
                      <th className="p-2 whitespace-nowrap">{t("invThReelle")}</th>
                      <th className="text-right p-2">{t("invThEcart")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l: InventaireLigne) =>
                      invSelected?.statut === "brouillon" ? (
                        <ComptageRow
                          key={l.id}
                          ligne={l}
                          onSaisir={handleSaisir}
                          pending={saisirComptage.isPending}
                        />
                      ) : (
                        <tr key={l.id} className="border-t">
                          <td className="p-2">
                            <div className="font-medium text-sm">{l.designation}</div>
                            <div className="text-xs text-muted-foreground">{l.reference}</div>
                          </td>
                          <td className="text-right p-2 font-mono text-sm">{fmt2(l.quantiteTheorique)}</td>
                          <td className="text-right p-2 font-mono text-sm">{fmt2(l.quantiteReelle)}</td>
                          <td className="text-right p-2"><EcartBadge ecart={l.ecart} /></td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
                {invSelected?.statut === "brouillon" && (
                  <div className="p-2 text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {t("invSaisieHint")}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de confirmation de validation */}
      <Dialog open={confirmValiderOpen} onOpenChange={setConfirmValiderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("invConfirmDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmValiderOpen(false)}>{t("cancel", { ns: "common" })}</Button>
            <Button onClick={handleValider} disabled={valider.isPending}>
              {valider.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("invConfirmOk")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
