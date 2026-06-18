import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Clock, User, AlertTriangle, Check, X, CalendarDays, ArrowRight, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/ui/dialog";
import { Textarea } from "@/shared/ui/textarea";
import { Input } from "@/shared/ui/input";
import { useLocation } from "@/shared/router/navigation";
import { useRdvEnLigne } from "../application/use-rdv-en-ligne";
import { STATUT_FILTERS, statutClass, urgenceClass, clientName, filterByStatut, type RdvItem } from "../domain/rdv-en-ligne";

// Page `rdv-en-ligne` (demandes de RDV) — migration clean-archi de `pages/RdvEnLigne.tsx`. Markup à
// l'identique. tRPC encapsulé dans `use-rdv-en-ligne`, classes/règles en domain.
export default function RdvEnLignePage() {
  const { t } = useTranslation("rdvEnLigne");
  const [, setLocation] = useLocation();
  const [filterStatut, setFilterStatut] = useState("tous");
  const [refuseDialogOpen, setRefuseDialogOpen] = useState(false);
  const [proposeDialogOpen, setProposeDialogOpen] = useState(false);
  const [selectedRdv, setSelectedRdv] = useState<RdvItem | null>(null);
  const [motifRefus, setMotifRefus] = useState("");
  const [nouvelleDateProposee, setNouvelleDateProposee] = useState("");

  const { rdvList, stats, isLoading, confirm, refuse, proposeAutreCreneau } = useRdvEnLigne();
  const filteredRdv = filterByStatut(rdvList, filterStatut);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("titre")}</h1>
          <p className="text-muted-foreground mt-1">{t("sousTitre")}</p>
        </div>
        <div className="flex gap-2">
          {stats && (
            <>
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">{t("enAttenteBadge", { count: stats.enAttente })}</Badge>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">{t("confirmesBadge", { count: stats.confirmes })}</Badge>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {STATUT_FILTERS.map((key) => (
          <Button key={key} variant={filterStatut === key ? "default" : "outline"} size="sm" onClick={() => setFilterStatut(key)}>
            {t(`filtre.${key}`)}
            {key === "en_attente" && stats ? ` (${stats.enAttente})` : ""}
          </Button>
        ))}
      </div>

      {/* RDV List */}
      {filteredRdv.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{t("aucun")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("aucunAstuce")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredRdv.map((rdv) => (
            <Card key={rdv.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg">{rdv.titre}</h3>
                      <Badge className={statutClass(rdv.statut)}>{t(`statut.${rdv.statut}`, rdv.statut)}</Badge>
                      <Badge className={urgenceClass(rdv.urgence)}>
                        {rdv.urgence === "tres_urgente" && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {t(`urgence.${rdv.urgence}`, rdv.urgence)}
                      </Badge>
                    </div>

                    {rdv.description && <p className="text-sm text-muted-foreground">{rdv.description}</p>}

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {clientName(rdv.client) || t("clientInconnu")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {format(new Date(rdv.dateProposee), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}
                      </span>
                      <span className="text-xs">{t("duree", { min: rdv.dureeEstimee || 60 })}</span>
                    </div>

                    {rdv.statut === "refuse" && rdv.motifRefus && (
                      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-2 text-sm">
                        <span className="font-medium text-red-700 dark:text-red-400">{t("motif")}</span>
                        <span className="text-red-600 dark:text-red-300">{rdv.motifRefus}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {rdv.statut === "en_attente" && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => confirm.mutate({ rdvId: rdv.id }, { onSuccess: () => toast.success(t("toastConfirme")), onError: (e) => toast.error(e.message || t("errConfirm")) })} disabled={confirm.isPending}>
                        <Check className="h-4 w-4 mr-1" />{t("confirmer")}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => { setSelectedRdv(rdv); setRefuseDialogOpen(true); }}>
                        <X className="h-4 w-4 mr-1" />{t("refuser")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedRdv(rdv); setProposeDialogOpen(true); }}>
                        <RefreshCw className="h-4 w-4 mr-1" />{t("autreCreneau")}
                      </Button>
                    </div>
                  )}

                  {rdv.statut === "confirme" && rdv.interventionId && (
                    <Button size="sm" variant="outline" onClick={() => setLocation("/interventions")}>
                      <ArrowRight className="h-4 w-4 mr-1" />{t("intervention", { id: rdv.interventionId })}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Refuse Dialog */}
      <Dialog open={refuseDialogOpen} onOpenChange={setRefuseDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("refuserTitre")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {selectedRdv && (
              <div className="text-sm text-muted-foreground">
                <p><strong>{selectedRdv.titre}</strong></p>
                <p>{t("clientLabel", { nom: clientName(selectedRdv.client) || t("inconnu") })}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">{t("motifRefus")}</label>
              <Textarea value={motifRefus} onChange={(e) => setMotifRefus(e.target.value)} placeholder={t("motifPlaceholder")} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefuseDialogOpen(false)}>{t("annuler")}</Button>
            <Button
              variant="destructive"
              onClick={() => selectedRdv && refuse.mutate({ rdvId: selectedRdv.id, motif: motifRefus }, {
                onSuccess: () => { toast.success(t("toastRefuse")); setRefuseDialogOpen(false); setMotifRefus(""); setSelectedRdv(null); },
                onError: (e) => toast.error(e.message || t("errRefuse")),
              })}
              disabled={!motifRefus.trim() || refuse.isPending}
            >
              {refuse.isPending ? t("envoi") : t("confirmerRefus")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Propose Alternative Dialog */}
      <Dialog open={proposeDialogOpen} onOpenChange={setProposeDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("proposerTitre")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {selectedRdv && (
              <div className="text-sm text-muted-foreground">
                <p><strong>{selectedRdv.titre}</strong></p>
                <p>{t("creneauDemande", { date: format(new Date(selectedRdv.dateProposee), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr }) })}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">{t("nouveauCreneau")}</label>
              <Input type="datetime-local" value={nouvelleDateProposee} onChange={(e) => setNouvelleDateProposee(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposeDialogOpen(false)}>{t("annuler")}</Button>
            <Button
              onClick={() => selectedRdv && nouvelleDateProposee && proposeAutreCreneau.mutate(
                { rdvId: selectedRdv.id, nouvelleDateProposee: new Date(nouvelleDateProposee).toISOString() },
                {
                  onSuccess: () => { toast.success(t("toastPropose")); setProposeDialogOpen(false); setNouvelleDateProposee(""); setSelectedRdv(null); },
                  onError: (e) => toast.error(e.message || t("errPropose")),
                },
              )}
              disabled={!nouvelleDateProposee || proposeAutreCreneau.isPending}
            >
              {proposeAutreCreneau.isPending ? t("envoi") : t("proposerCreneau")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
