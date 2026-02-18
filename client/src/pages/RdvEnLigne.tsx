import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Clock,
  User,
  AlertTriangle,
  Check,
  X,
  CalendarDays,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente",
  confirme: "Confirmé",
  refuse: "Refusé",
  annule: "Annulé",
};
const STATUT_COLORS: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  confirme: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  refuse: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  annule: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};
const URGENCE_LABELS: Record<string, string> = {
  normale: "Normale",
  urgente: "Urgente",
  tres_urgente: "Très urgente",
};
const URGENCE_COLORS: Record<string, string> = {
  normale: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  urgente: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  tres_urgente: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function RdvEnLigne() {
  const [filterStatut, setFilterStatut] = useState<string>("tous");
  const [refuseDialogOpen, setRefuseDialogOpen] = useState(false);
  const [proposeDialogOpen, setProposeDialogOpen] = useState(false);
  const [selectedRdv, setSelectedRdv] = useState<any>(null);
  const [motifRefus, setMotifRefus] = useState("");
  const [nouvelleDateProposee, setNouvelleDateProposee] = useState("");

  const utils = trpc.useUtils();
  const { data: rdvList, isLoading } = trpc.rdv.list.useQuery(
    filterStatut !== "tous" ? { statut: filterStatut as any } : undefined
  );
  const { data: stats } = trpc.rdv.getStats.useQuery();

  const confirmMutation = trpc.rdv.confirm.useMutation({
    onSuccess: () => {
      toast.success("RDV confirmé et intervention créée");
      utils.rdv.list.invalidate();
      utils.rdv.getStats.invalidate();
      utils.rdv.getPendingCount.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erreur lors de la confirmation"),
  });

  const refuseMutation = trpc.rdv.refuse.useMutation({
    onSuccess: () => {
      toast.success("RDV refusé, email envoyé au client");
      setRefuseDialogOpen(false);
      setMotifRefus("");
      setSelectedRdv(null);
      utils.rdv.list.invalidate();
      utils.rdv.getStats.invalidate();
      utils.rdv.getPendingCount.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erreur lors du refus"),
  });

  const proposeMutation = trpc.rdv.proposeAutreCreneau.useMutation({
    onSuccess: () => {
      toast.success("Nouveau créneau proposé, email envoyé au client");
      setProposeDialogOpen(false);
      setNouvelleDateProposee("");
      setSelectedRdv(null);
      utils.rdv.list.invalidate();
      utils.rdv.getStats.invalidate();
      utils.rdv.getPendingCount.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erreur lors de la proposition"),
  });

  const filters = [
    { key: "tous", label: "Tous" },
    { key: "en_attente", label: "En attente" },
    { key: "confirme", label: "Confirmés" },
    { key: "refuse", label: "Refusés" },
  ];

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
          <h1 className="text-3xl font-bold text-foreground">RDV en ligne</h1>
          <p className="text-muted-foreground mt-1">Gérez les demandes de rendez-vous de vos clients</p>
        </div>
        <div className="flex gap-2">
          {stats && (
            <>
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">
                {stats.enAttente} en attente
              </Badge>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                {stats.confirmes} confirmé(s)
              </Badge>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <Button
            key={f.key}
            variant={filterStatut === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatut(f.key)}
          >
            {f.label}
            {f.key === "en_attente" && stats ? ` (${stats.enAttente})` : ""}
          </Button>
        ))}
      </div>

      {/* RDV List */}
      {!rdvList || rdvList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Aucune demande de RDV</p>
            <p className="text-sm text-muted-foreground mt-1">
              Les demandes de vos clients apparaîtront ici
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rdvList.map((rdv: any) => (
            <Card key={rdv.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg">{rdv.titre}</h3>
                      <Badge className={STATUT_COLORS[rdv.statut] || ""}>
                        {STATUT_LABELS[rdv.statut] || rdv.statut}
                      </Badge>
                      <Badge className={URGENCE_COLORS[rdv.urgence] || ""}>
                        {rdv.urgence === "tres_urgente" && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {URGENCE_LABELS[rdv.urgence] || rdv.urgence}
                      </Badge>
                    </div>

                    {rdv.description && (
                      <p className="text-sm text-muted-foreground">{rdv.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {rdv.client ? `${rdv.client.prenom || ''} ${rdv.client.nom}`.trim() : 'Client inconnu'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {format(new Date(rdv.dateProposee), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}
                      </span>
                      <span className="text-xs">
                        Durée : {rdv.dureeEstimee || 60} min
                      </span>
                    </div>

                    {rdv.statut === "refuse" && rdv.motifRefus && (
                      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-2 text-sm">
                        <span className="font-medium text-red-700 dark:text-red-400">Motif : </span>
                        <span className="text-red-600 dark:text-red-300">{rdv.motifRefus}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {rdv.statut === "en_attente" && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => confirmMutation.mutate({ rdvId: rdv.id })}
                        disabled={confirmMutation.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Confirmer
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setSelectedRdv(rdv);
                          setRefuseDialogOpen(true);
                        }}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Refuser
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedRdv(rdv);
                          setProposeDialogOpen(true);
                        }}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Autre créneau
                      </Button>
                    </div>
                  )}

                  {rdv.statut === "confirme" && rdv.interventionId && (
                    <Button size="sm" variant="outline">
                      <ArrowRight className="h-4 w-4 mr-1" />
                      Intervention #{rdv.interventionId}
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
          <DialogHeader>
            <DialogTitle>Refuser la demande de RDV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedRdv && (
              <div className="text-sm text-muted-foreground">
                <p><strong>{selectedRdv.titre}</strong></p>
                <p>
                  Client : {selectedRdv.client ? `${selectedRdv.client.prenom || ''} ${selectedRdv.client.nom}`.trim() : 'Inconnu'}
                </p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Motif du refus *</label>
              <Textarea
                value={motifRefus}
                onChange={(e) => setMotifRefus(e.target.value)}
                placeholder="Expliquez au client pourquoi ce créneau n'est pas disponible..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefuseDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedRdv && refuseMutation.mutate({ rdvId: selectedRdv.id, motif: motifRefus })}
              disabled={!motifRefus.trim() || refuseMutation.isPending}
            >
              {refuseMutation.isPending ? "Envoi..." : "Confirmer le refus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Propose Alternative Dialog */}
      <Dialog open={proposeDialogOpen} onOpenChange={setProposeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proposer un autre créneau</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedRdv && (
              <div className="text-sm text-muted-foreground">
                <p><strong>{selectedRdv.titre}</strong></p>
                <p>
                  Créneau demandé : {format(new Date(selectedRdv.dateProposee), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}
                </p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Nouveau créneau proposé *</label>
              <Input
                type="datetime-local"
                value={nouvelleDateProposee}
                onChange={(e) => setNouvelleDateProposee(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposeDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={() =>
                selectedRdv &&
                nouvelleDateProposee &&
                proposeMutation.mutate({
                  rdvId: selectedRdv.id,
                  nouvelleDateProposee: new Date(nouvelleDateProposee).toISOString(),
                })
              }
              disabled={!nouvelleDateProposee || proposeMutation.isPending}
            >
              {proposeMutation.isPending ? "Envoi..." : "Proposer ce créneau"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
