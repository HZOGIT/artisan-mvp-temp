import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { fr } from "date-fns/locale";
import { FileText, Plus, CheckCircle2, XCircle, Send, Eye, ArrowLeft, Clock, AlertCircle, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { Textarea } from "@/shared/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { useNotesFrais } from "../application/use-notes-frais";
import { eur, fmtDate, etapeReached, availableBrouillons, TIMELINE } from "../domain/note-frais";

const STATUT_COLOR: Record<string, string> = {
  brouillon: "bg-slate-100 text-slate-700",
  soumise: "bg-blue-100 text-blue-700",
  approuvee: "bg-emerald-100 text-emerald-700",
  rejetee: "bg-rose-100 text-rose-700",
  payee: "bg-purple-100 text-purple-700",
};

const initialForm = () => ({
  titre: "",
  periodeDebut: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  periodeFin: new Date().toISOString().slice(0, 10),
  depenseIds: [] as number[],
});

export default function NotesFraisPage() {
  const { t } = useTranslation("notesFrais");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [newForm, setNewForm] = useState(initialForm);

  const { notes, detail, depensesBrouillon, create, soumettre, approuver, rejeter, payer, addDep, removeDep } = useNotesFrais(selectedId);

  const statutLabel = (s: string) => t(`statut.${s}`, s);

  if (selectedId && detail) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold flex-1">{detail.numero} — {detail.titre}</h1>
          <Badge className={STATUT_COLOR[detail.statut]}>{statutLabel(detail.statut)}</Badge>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2 overflow-x-auto">
              {TIMELINE.map((etape, i) => {
                const reached = etapeReached(detail.statut, i);
                const isCurrent = detail.statut === etape;
                return (
                  <div key={etape} className="flex items-center gap-2 flex-1">
                    <div className={"h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 " + (reached ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500") + (isCurrent ? " ring-4 ring-emerald-200" : "")}>
                      {i + 1}
                    </div>
                    <span className={"text-xs whitespace-nowrap " + (reached ? "font-semibold" : "text-muted-foreground")}>{statutLabel(etape)}</span>
                    {i < 3 && <div className={"h-0.5 flex-1 " + (reached ? "bg-emerald-500" : "bg-slate-200")} />}
                  </div>
                );
              })}
            </div>
            {detail.statut === "rejetee" && (
              <div className="mt-3 p-2 rounded bg-rose-50 border border-rose-200 text-sm text-rose-800">
                <AlertCircle className="h-4 w-4 inline mr-1" /> {t("rejetee")}
                {detail.commentaireApprobateur && ` : ${detail.commentaireApprobateur}`}
              </div>
            )}
            {detail.statut === "approuvee" && detail.commentaireApprobateur && (
              <div className="mt-3 p-2 rounded bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
                {detail.commentaireApprobateur}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t("depensesIncluses")}</span>
              <span className="text-base font-normal text-muted-foreground">
                {t("total")} <strong className="text-primary">{eur(detail.montantTotal)}</strong>
              </span>
            </CardTitle>
            <CardDescription>{t("periode", { debut: fmtDate(detail.periodeDebut, "dd/MM/yyyy"), fin: fmtDate(detail.periodeFin, "dd/MM/yyyy") })}</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.depenses.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("aucuneDepenseIncluse")}</p>
            ) : (
              <div className="space-y-2">
                {detail.depenses.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{d.fournisseur || d.numero}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(d.dateDepense, "dd MMM", { locale: fr })} · {d.categorie}</div>
                    </div>
                    <div className="font-medium">{eur(d.montantTtc)}</div>
                    {detail.statut === "brouillon" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeDep.mutate({ noteId: detail.id, depenseId: d.id }, { onError: (e) => toast.error(e.message) })}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {detail.statut === "brouillon" && availableBrouillons(depensesBrouillon, detail.depenses).length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <Label className="text-xs text-muted-foreground mb-2 block">{t("ajouterBrouillon")}</Label>
                <div className="flex flex-wrap gap-1">
                  {availableBrouillons(depensesBrouillon, detail.depenses).map((d) => (
                    <Button key={d.id} size="sm" variant="outline" onClick={() => addDep.mutate({ noteId: detail.id, depenseId: d.id }, { onError: (e) => toast.error(e.message) })}>
                      <Plus className="h-3 w-3 mr-1" />
                      {d.fournisseur || d.numero} ({eur(d.montantTtc)})
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {detail.statut === "brouillon" && (
            <Button onClick={() => soumettre.mutate({ id: detail.id }, { onSuccess: () => toast.success(t("toastSoumise")), onError: (e) => toast.error(e.message) })} disabled={soumettre.isPending} className="min-h-[44px]">
              <Send className="h-4 w-4 mr-2" /> {t("soumettre")}
            </Button>
          )}
          {detail.statut === "soumise" && (
            <>
              <Button onClick={() => approuver.mutate({ id: detail.id }, { onSuccess: () => toast.success(t("toastApprouvee")), onError: (e) => toast.error(e.message) })} disabled={approuver.isPending} className="min-h-[44px]">
                <CheckCircle2 className="h-4 w-4 mr-2" /> {t("approuver")}
              </Button>
              <Button variant="outline" onClick={() => setIsRejectOpen(true)} className="min-h-[44px] text-rose-600">
                <XCircle className="h-4 w-4 mr-2" /> {t("rejeter")}
              </Button>
            </>
          )}
          {detail.statut === "approuvee" && (
            <Button onClick={() => payer.mutate({ id: detail.id }, { onSuccess: () => toast.success(t("toastPayee")), onError: (e) => toast.error(e.message) })} disabled={payer.isPending} className="min-h-[44px]">
              <Wallet className="h-4 w-4 mr-2" /> {t("marquerPayee")}
            </Button>
          )}
        </div>

        <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("rejetDialogTitre")}</DialogTitle>
              <DialogDescription>{t("rejetDialogDesc")}</DialogDescription>
            </DialogHeader>
            <Textarea value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} rows={3} placeholder={t("rejetPlaceholder")} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRejectOpen(false)}>{t("annuler")}</Button>
              <Button variant="destructive" onClick={() => rejeter.mutate({ id: detail.id, commentaire: rejectComment }, { onSuccess: () => { toast.success(t("toastRejetee")); setIsRejectOpen(false); setRejectComment(""); }, onError: (e) => toast.error(e.message) })} disabled={!rejectComment.trim() || rejeter.isPending}>
                {t("confirmerRejet")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="h-7 w-7 text-blue-600" /> {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setIsNewOpen(true)} className="min-h-[44px]">
          <Plus className="h-4 w-4 mr-2" /> {t("nouvelleNote")}
        </Button>
      </div>

      {notes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground mb-3">{t("aucuneNote")}</p>
            <Button onClick={() => setIsNewOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> {t("creerPremiere")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {notes.map((n) => (
            <Card key={n.id} onClick={() => setSelectedId(n.id)} className="cursor-pointer hover:border-blue-300 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{n.titre}</CardTitle>
                    <CardDescription className="font-mono text-xs">{n.numero}</CardDescription>
                  </div>
                  <Badge className={STATUT_COLOR[n.statut]}>{statutLabel(n.statut)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  <Clock className="h-3 w-3 inline mr-1" />
                  {fmtDate(n.periodeDebut, "dd MMM", { locale: fr })}{" → "}{fmtDate(n.periodeFin, "dd MMM yyyy", { locale: fr })}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">{t("nbDepenses", { count: n.nbDepenses || 0 })}</span>
                  <span className="float-right font-bold text-lg">{eur(n.montantTotal)}</span>
                </div>
                <Button variant="ghost" size="sm" className="w-full">
                  <Eye className="h-3 w-3 mr-1" /> {t("voirDetail")}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newDialogTitre")}</DialogTitle>
            <DialogDescription>{t("newDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("titre")}</Label>
              <Input value={newForm.titre} onChange={(e) => setNewForm({ ...newForm, titre: e.target.value })} placeholder={t("titrePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t("periodeDebut")}</Label>
                <Input type="date" value={newForm.periodeDebut} onChange={(e) => setNewForm({ ...newForm, periodeDebut: e.target.value })} />
              </div>
              <div>
                <Label>{t("periodeFin")}</Label>
                <Input type="date" value={newForm.periodeFin} onChange={(e) => setNewForm({ ...newForm, periodeFin: e.target.value })} />
              </div>
            </div>
            {depensesBrouillon.length > 0 && (
              <div>
                <Label className="text-xs">{t("brouillonsAInclure")}</Label>
                <div className="max-h-40 overflow-y-auto space-y-1 mt-1 border rounded p-2">
                  {depensesBrouillon.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newForm.depenseIds.includes(d.id)}
                        onChange={(e) => setNewForm({ ...newForm, depenseIds: e.target.checked ? [...newForm.depenseIds, d.id] : newForm.depenseIds.filter((x) => x !== d.id) })}
                      />
                      <span className="flex-1 truncate">{d.fournisseur || d.numero} · {d.categorie}</span>
                      <span className="font-medium">{eur(d.montantTtc)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewOpen(false)}>{t("annuler")}</Button>
            <Button
              onClick={() => {
                if (!newForm.titre.trim()) { toast.error(t("titreRequis")); return; }
                create.mutate(newForm, { onSuccess: () => { toast.success(t("toastCreee")); setIsNewOpen(false); setNewForm(initialForm()); }, onError: (e) => toast.error(e.message) });
              }}
              disabled={create.isPending}
            >
              {t("creer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
