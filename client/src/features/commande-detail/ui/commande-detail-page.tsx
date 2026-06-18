import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, Pencil, Download, Mail, Trash2, ChevronDown, Truck, Building2, CalendarDays, MapPin, FileText, Package } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useCommandeDetail } from "../application/use-commande-detail";
import { formatCurrency, ligneTotal, receptionActive, estRecue, aDesQuantitesRecues, buildReceptionPayload, findFournisseur, depenseLabel, STATUS_LABEL_KEY, STATUS_COLORS, NEXT_STATUSES, type StatutCommande, type StatutFacturation } from "../domain/commande-detail";

// Page `/commandes/:id` — migration clean-archi de `pages/CommandeFournisseurDetail.tsx`. Markup à
// l'identique. Le new-stack getById ne renvoie ni lignes ni fournisseur → chargés séparément (cf. domain).
export default function CommandeDetailPage() {
  const { t } = useTranslation("commandeDetail");
  const { id: idParam } = useParams({ strict: false }) as { id?: string };
  const id = parseInt(idParam || "0");
  const { commande, isLoading, lignes, fournisseurs, depenses, updateStatut, remove, sendEmail, setFacturation, recevoir } = useCommandeDetail(id);
  const [recue, setRecue] = useState<Record<number, string>>({});

  const goBack = () => { window.location.href = "/commandes"; };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }
  if (!commande) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-2" />{t("retourCommandes")}</Button>
        <Card><CardContent className="flex flex-col items-center justify-center py-12"><Package className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="text-lg font-medium">{t("commandeNonTrouvee")}</h3></CardContent></Card>
      </div>
    );
  }

  const statut = commande.statut || "brouillon";
  const possibleNext = NEXT_STATUSES[statut] || [];
  const fournisseur = findFournisseur(fournisseurs, commande.fournisseurId);
  const rcptActive = receptionActive(statut);
  const aRecues = aDesQuantitesRecues(lignes);
  const statutFacturation = commande.statutFacturation || "a_facturer";
  const recue_ = estRecue(statut);
  const linkedDepense = depenses.find((d) => d.id === commande.depenseId);

  const changeStatut = (s: StatutCommande) => updateStatut.mutate({ id, statut: s }, { onSuccess: () => toast.success(t("toastStatut")), onError: () => toast.error(t("errStatut")) });
  const toggleFacturation = (next: StatutFacturation) => setFacturation.mutate({ id, statutFacturation: next }, { onSuccess: () => toast.success(t("toastFacturation")), onError: () => toast.error(t("errFacturation")) });
  const linkDepense = (depenseIdStr: string) => { const depId = parseInt(depenseIdStr); if (!depId) return; setFacturation.mutate({ id, statutFacturation: "facturee", depenseId: depId }, { onSuccess: () => toast.success(t("toastFacturation")), onError: () => toast.error(t("errFacturation")) }); };
  const enregistrerReception = () => { const payload = buildReceptionPayload(lignes, recue); if (payload.length === 0) return; recevoir.mutate({ id, lignes: payload }, { onSuccess: () => { toast.success(t("toastReception")); setRecue({}); }, onError: (e) => toast.error(e.message || t("errReception")) }); };
  const handleDelete = () => { if (confirm(t("confirmSupprimer"))) remove.mutate({ id }, { onSuccess: () => { toast.success(t("toastSupprimee")); goBack(); }, onError: () => toast.error(t("errSuppression")) }); };
  const handleSendEmail = () => { if (confirm(t("confirmEnvoyer"))) sendEmail.mutate({ id }, { onSuccess: () => toast.success(t("toastEmail")), onError: (e) => toast.error(e.message || t("errEmail")) }); };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={goBack}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{commande.numero || t("commande")}</h1>
            <Badge className={STATUS_COLORS[statut] || "bg-gray-100"}>{t(STATUS_LABEL_KEY[statut] ?? "statutBrouillon")}</Badge>
            {recue_ && (<Badge className={statutFacturation === "facturee" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}>{statutFacturation === "facturee" ? t("facturee") : t("aFacturer")}</Badge>)}
            {statutFacturation === "facturee" && linkedDepense && (<span className="text-sm text-muted-foreground">· {t("facture", { label: depenseLabel(linkedDepense), montant: formatCurrency(linkedDepense.montantTtc) })}</span>)}
          </div>
          {fournisseur && (<p className="text-muted-foreground">{fournisseur.nom}</p>)}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { window.location.href = `/commandes/${id}/modifier`; }}><Pencil className="h-4 w-4 mr-2" />{t("modifier")}</Button>
          <Button variant="outline" asChild><a href={`/api/commandes-fournisseurs/${id}/pdf`} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4 mr-2" />{t("pdf")}</a></Button>
          <Button variant="outline" onClick={handleSendEmail} disabled={sendEmail.isPending}><Mail className="h-4 w-4 mr-2" />{t("envoyer")}</Button>
          {recue_ && (<Button variant="outline" onClick={() => toggleFacturation(statutFacturation === "facturee" ? "a_facturer" : "facturee")} disabled={setFacturation.isPending}>{statutFacturation === "facturee" ? t("marquerAFacturer") : t("marquerFacturee")}</Button>)}
          {recue_ && statutFacturation !== "facturee" && depenses.length > 0 && (
            <Select value="" onValueChange={linkDepense} disabled={setFacturation.isPending}>
              <SelectTrigger className="w-[230px]"><SelectValue placeholder={t("lierFacture")} /></SelectTrigger>
              <SelectContent>{depenses.map((d) => (<SelectItem key={d.id} value={String(d.id)}>{depenseLabel(d)} — {formatCurrency(d.montantTtc)}</SelectItem>))}</SelectContent>
            </Select>
          )}
          {possibleNext.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button>{t("changerStatut")}<ChevronDown className="h-4 w-4 ml-2" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">{possibleNext.map((s) => (<DropdownMenuItem key={s} onClick={() => changeStatut(s)}><Badge className={`${STATUS_COLORS[s]} mr-2`}>{t(STATUS_LABEL_KEY[s])}</Badge></DropdownMenuItem>))}</DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="destructive" size="icon" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Building2 className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">{t("fournisseur")}</p><p className="font-medium">{fournisseur?.nom || "—"}</p>{fournisseur?.email && <p className="text-sm text-muted-foreground">{fournisseur.email}</p>}</div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">{t("dateCommande")}</p><p className="font-medium">{commande.dateCommande ? format(new Date(commande.dateCommande), "dd/MM/yyyy") : "—"}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Truck className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">{t("delaiLivraison")}</p><p className="font-medium">{commande.dateLivraisonPrevue ? format(new Date(commande.dateLivraisonPrevue), "dd/MM/yyyy") : "—"}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><FileText className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">{t("reference")}</p><p className="font-medium">{commande.reference || "—"}</p></div></div></CardContent></Card>
      </div>

      {(commande.adresseLivraison || commande.notes) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {commande.adresseLivraison && (<Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />{t("adresseLivraison")}</CardTitle></CardHeader><CardContent><p className="text-sm whitespace-pre-line">{commande.adresseLivraison}</p></CardContent></Card>)}
          {commande.notes && (<Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />{t("notes")}</CardTitle></CardHeader><CardContent><p className="text-sm whitespace-pre-line">{commande.notes}</p></CardContent></Card>)}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>{t("lignesCommande")}</CardTitle></CardHeader>
        <CardContent>
          {lignes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("colDesignation")}</th>
                    <th className="text-center whitespace-nowrap">{t("colQuantite")}</th>
                    {(rcptActive || aRecues) && (<th className="text-center whitespace-nowrap">{t("colRecu")}</th>)}
                    <th className="text-center">{t("colUnite")}</th>
                    <th className="text-right whitespace-nowrap">{t("colPuHt")}</th>
                    <th className="text-center">{t("colTva")}</th>
                    <th className="text-right whitespace-nowrap">{t("colTotalHt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne, idx) => {
                    const qty = parseFloat(String(ligne.quantite ?? "")) || 0;
                    const pu = parseFloat(String(ligne.prixUnitaire ?? "")) || 0;
                    const tva = parseFloat(String(ligne.tauxTVA ?? "")) || 20;
                    return (
                      <tr key={ligne.id || idx}>
                        <td><div><span className="font-medium">{ligne.designation}</span>{ligne.reference && (<span className="text-muted-foreground text-sm ml-2">({ligne.reference})</span>)}</div></td>
                        <td className="text-center">{qty}</td>
                        {(rcptActive || aRecues) && (
                          <td className="text-center">
                            {rcptActive ? (
                              <input type="number" min={0} step="0.01" value={ligne.id != null && recue[ligne.id] !== undefined ? recue[ligne.id] : String(parseFloat(String(ligne.quantiteRecue ?? "")) || 0)} onChange={(e) => { if (ligne.id != null) setRecue((prev) => ({ ...prev, [ligne.id]: e.target.value })); }} className="w-20 px-2 py-1 border border-gray-300 rounded-md text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            ) : (<span>{parseFloat(String(ligne.quantiteRecue ?? "")) || 0}</span>)}
                          </td>
                        )}
                        <td className="text-center">{ligne.unite || "unité"}</td>
                        <td className="text-right">{formatCurrency(pu)}</td>
                        <td className="text-center">{tva}%</td>
                        <td className="text-right font-medium">{formatCurrency(ligneTotal(ligne))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (<p className="text-center text-muted-foreground py-8">{t("aucuneLigne")}</p>)}
          {rcptActive && lignes.length > 0 && (
            <div className="mt-4 flex items-center justify-end gap-3">
              <p className="text-sm text-muted-foreground">{t("saisirReception")}</p>
              <Button onClick={enregistrerReception} disabled={recevoir.isPending}><Package className="h-4 w-4 mr-2" />{recevoir.isPending ? t("enregistrement") : t("enregistrerReception")}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("totalHt")}</span><span className="font-medium">{formatCurrency(commande.totalHT || 0)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("tva")}</span><span className="font-medium">{formatCurrency(commande.totalTVA || 0)}</span></div>
              <div className="border-t pt-2 flex justify-between text-base"><span className="font-semibold">{t("totalTtc")}</span><span className="font-bold text-lg">{formatCurrency(commande.totalTTC || commande.montantTotal || 0)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
