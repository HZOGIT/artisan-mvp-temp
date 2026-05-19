import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FileText, Plus, CheckCircle2, XCircle, Send, Eye, ArrowLeft, Clock,
  AlertCircle, Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const STATUT_LABEL: Record<string, string> = {
  brouillon: "Brouillon",
  soumise: "Soumise",
  approuvee: "Approuvée",
  rejetee: "Rejetée",
  payee: "Payée",
};
const STATUT_COLOR: Record<string, string> = {
  brouillon: "bg-slate-100 text-slate-700",
  soumise: "bg-blue-100 text-blue-700",
  approuvee: "bg-emerald-100 text-emerald-700",
  rejetee: "bg-rose-100 text-rose-700",
  payee: "bg-purple-100 text-purple-700",
};

function eur(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export default function NotesFrais() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [newForm, setNewForm] = useState({
    titre: "",
    periodeDebut: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    periodeFin: new Date().toISOString().slice(0, 10),
    depenseIds: [] as number[],
  });

  const { data: notes, refetch } = trpc.depenses.listNotesFrais.useQuery();
  const { data: detail, refetch: refetchDetail } = trpc.depenses.getNoteFraisById.useQuery(
    { id: selectedId || 0 },
    { enabled: !!selectedId }
  );
  const { data: depensesBrouillon } = trpc.depenses.list.useQuery({ statut: "brouillon" });

  const createMut = trpc.depenses.createNoteFrais.useMutation({
    onSuccess: () => { toast.success("Note créée"); setIsNewOpen(false); refetch(); },
  });
  const soumettreMut = trpc.depenses.soumettreNoteFrais.useMutation({
    onSuccess: () => { toast.success("Note soumise"); refetch(); refetchDetail(); },
  });
  const approuverMut = trpc.depenses.approuverNoteFrais.useMutation({
    onSuccess: () => { toast.success("Note approuvée"); refetch(); refetchDetail(); },
  });
  const rejeterMut = trpc.depenses.rejeterNoteFrais.useMutation({
    onSuccess: () => {
      toast.success("Note rejetée");
      setIsRejectOpen(false);
      setRejectComment("");
      refetch();
      refetchDetail();
    },
  });
  const payerMut = trpc.depenses.payerNoteFrais.useMutation({
    onSuccess: () => { toast.success("Note marquée payée"); refetch(); refetchDetail(); },
  });
  const addDepMut = trpc.depenses.addDepenseToNoteFrais.useMutation({
    onSuccess: () => { refetchDetail(); },
  });
  const removeDepMut = trpc.depenses.removeDepenseFromNoteFrais.useMutation({
    onSuccess: () => { refetchDetail(); },
  });

  if (selectedId && detail) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold flex-1">{detail.numero} — {detail.titre}</h1>
          <Badge className={STATUT_COLOR[detail.statut]}>{STATUT_LABEL[detail.statut]}</Badge>
        </div>

        {/* Timeline workflow */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2 overflow-x-auto">
              {["brouillon", "soumise", "approuvee", "payee"].map((etape, i) => {
                const reached = ["brouillon", "soumise", "approuvee", "payee"]
                  .indexOf(detail.statut) >= i || detail.statut === "rejetee";
                const isCurrent = detail.statut === etape;
                return (
                  <div key={etape} className="flex items-center gap-2 flex-1">
                    <div
                      className={
                        "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 " +
                        (reached ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500") +
                        (isCurrent ? " ring-4 ring-emerald-200" : "")
                      }
                    >
                      {i + 1}
                    </div>
                    <span className={"text-xs whitespace-nowrap " + (reached ? "font-semibold" : "text-muted-foreground")}>
                      {STATUT_LABEL[etape]}
                    </span>
                    {i < 3 && <div className={"h-0.5 flex-1 " + (reached ? "bg-emerald-500" : "bg-slate-200")} />}
                  </div>
                );
              })}
            </div>
            {detail.statut === "rejetee" && (
              <div className="mt-3 p-2 rounded bg-rose-50 border border-rose-200 text-sm text-rose-800">
                <AlertCircle className="h-4 w-4 inline mr-1" /> Rejetée
                {detail.commentaire_approbateur && ` : ${detail.commentaire_approbateur}`}
              </div>
            )}
            {detail.statut === "approuvee" && detail.commentaire_approbateur && (
              <div className="mt-3 p-2 rounded bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
                {detail.commentaire_approbateur}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Dépenses incluses</span>
              <span className="text-base font-normal text-muted-foreground">
                Total : <strong className="text-primary">{eur(detail.montant_total)}</strong>
              </span>
            </CardTitle>
            <CardDescription>
              Période : {format(new Date(detail.periode_debut), "dd/MM/yyyy")} → {format(new Date(detail.periode_fin), "dd/MM/yyyy")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(detail.depenses || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucune dépense incluse.</p>
            ) : (
              <div className="space-y-2">
                {detail.depenses.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{d.fournisseur || d.numero}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(d.date_depense), "dd MMM", { locale: fr })} · {d.categorie}
                      </div>
                    </div>
                    <div className="font-medium">{eur(d.montant_ttc)}</div>
                    {detail.statut === "brouillon" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeDepMut.mutate({ noteId: detail.id, depenseId: d.id })}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {detail.statut === "brouillon" && (depensesBrouillon || []).length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <Label className="text-xs text-muted-foreground mb-2 block">
                  Ajouter une dépense brouillon :
                </Label>
                <div className="flex flex-wrap gap-1">
                  {(depensesBrouillon || []).filter((d: any) => !(detail.depenses || []).some((dd: any) => dd.id === d.id)).slice(0, 10).map((d: any) => (
                    <Button
                      key={d.id}
                      size="sm"
                      variant="outline"
                      onClick={() => addDepMut.mutate({ noteId: detail.id, depenseId: d.id })}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {d.fournisseur || d.numero} ({eur(d.montant_ttc)})
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {detail.statut === "brouillon" && (
            <Button
              onClick={() => soumettreMut.mutate({ id: detail.id })}
              disabled={soumettreMut.isPending}
              className="min-h-[44px]"
            >
              <Send className="h-4 w-4 mr-2" /> Soumettre pour approbation
            </Button>
          )}
          {detail.statut === "soumise" && (
            <>
              <Button
                onClick={() => approuverMut.mutate({ id: detail.id })}
                disabled={approuverMut.isPending}
                className="min-h-[44px]"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Approuver
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsRejectOpen(true)}
                className="min-h-[44px] text-rose-600"
              >
                <XCircle className="h-4 w-4 mr-2" /> Rejeter
              </Button>
            </>
          )}
          {detail.statut === "approuvee" && (
            <Button
              onClick={() => payerMut.mutate({ id: detail.id })}
              disabled={payerMut.isPending}
              className="min-h-[44px]"
            >
              <Wallet className="h-4 w-4 mr-2" /> Marquer comme payée
            </Button>
          )}
        </div>

        <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rejeter la note de frais</DialogTitle>
              <DialogDescription>Le commentaire sera visible par l'auteur de la note.</DialogDescription>
            </DialogHeader>
            <Textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={3}
              placeholder="Raison du rejet…"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRejectOpen(false)}>Annuler</Button>
              <Button
                variant="destructive"
                onClick={() => rejeterMut.mutate({ id: detail.id, commentaire: rejectComment })}
                disabled={!rejectComment.trim() || rejeterMut.isPending}
              >
                Confirmer le rejet
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
            <FileText className="h-7 w-7 text-blue-600" /> Notes de frais
          </h1>
          <p className="text-muted-foreground mt-1">
            Regroupe tes dépenses pour soumettre une note unique à l'approbation.
          </p>
        </div>
        <Button onClick={() => setIsNewOpen(true)} className="min-h-[44px]">
          <Plus className="h-4 w-4 mr-2" /> Nouvelle note
        </Button>
      </div>

      {!notes || notes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground mb-3">Aucune note de frais pour le moment</p>
            <Button onClick={() => setIsNewOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Créer ma première note
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {notes.map((n: any) => (
            <Card
              key={n.id}
              onClick={() => setSelectedId(n.id)}
              className="cursor-pointer hover:border-blue-300 transition-colors"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{n.titre}</CardTitle>
                    <CardDescription className="font-mono text-xs">{n.numero}</CardDescription>
                  </div>
                  <Badge className={STATUT_COLOR[n.statut]}>{STATUT_LABEL[n.statut]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  <Clock className="h-3 w-3 inline mr-1" />
                  {format(new Date(n.periode_debut), "dd MMM", { locale: fr })}
                  {" → "}
                  {format(new Date(n.periode_fin), "dd MMM yyyy", { locale: fr })}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">{n.nb_depenses || 0} dépense{(n.nb_depenses || 0) > 1 ? "s" : ""}</span>
                  <span className="float-right font-bold text-lg">{eur(n.montant_total)}</span>
                </div>
                <Button variant="ghost" size="sm" className="w-full">
                  <Eye className="h-3 w-3 mr-1" /> Voir le détail
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle note de frais</DialogTitle>
            <DialogDescription>Regroupe plusieurs dépenses dans une note unique.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Titre *</Label>
              <Input
                value={newForm.titre}
                onChange={(e) => setNewForm({ ...newForm, titre: e.target.value })}
                placeholder="Ex : Frais de chantier Dupont — Mai 2026"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Période début</Label>
                <Input
                  type="date"
                  value={newForm.periodeDebut}
                  onChange={(e) => setNewForm({ ...newForm, periodeDebut: e.target.value })}
                />
              </div>
              <div>
                <Label>Période fin</Label>
                <Input
                  type="date"
                  value={newForm.periodeFin}
                  onChange={(e) => setNewForm({ ...newForm, periodeFin: e.target.value })}
                />
              </div>
            </div>
            {(depensesBrouillon || []).length > 0 && (
              <div>
                <Label className="text-xs">Dépenses brouillon à inclure (optionnel)</Label>
                <div className="max-h-40 overflow-y-auto space-y-1 mt-1 border rounded p-2">
                  {(depensesBrouillon || []).map((d: any) => (
                    <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newForm.depenseIds.includes(d.id)}
                        onChange={(e) => {
                          setNewForm({
                            ...newForm,
                            depenseIds: e.target.checked
                              ? [...newForm.depenseIds, d.id]
                              : newForm.depenseIds.filter((x) => x !== d.id),
                          });
                        }}
                      />
                      <span className="flex-1 truncate">{d.fournisseur || d.numero} · {d.categorie}</span>
                      <span className="font-medium">{eur(d.montant_ttc)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewOpen(false)}>Annuler</Button>
            <Button
              onClick={() => {
                if (!newForm.titre.trim()) {
                  toast.error("Titre requis");
                  return;
                }
                createMut.mutate(newForm);
              }}
              disabled={createMut.isPending}
            >
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
