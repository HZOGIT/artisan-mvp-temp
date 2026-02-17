import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Download, FileText, Loader2, Plus, Calendar, CheckCircle, XCircle,
  Clock, Wrench, Receipt, AlertTriangle, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useLocation, useParams } from "wouter";

const typeLabels: Record<string, string> = {
  maintenance_preventive: "Maintenance Préventive",
  entretien: "Entretien",
  depannage: "Dépannage",
  contrat_service: "Contrat de Service",
};

const periodiciteLabels: Record<string, string> = {
  mensuel: "Mensuel",
  trimestriel: "Trimestriel",
  semestriel: "Semestriel",
  annuel: "Annuel",
};

const statutInterventionConfig: Record<string, { label: string; icon: any; color: string }> = {
  planifiee: { label: "Planifiée", icon: Calendar, color: "bg-blue-50 text-blue-700 border-blue-200" },
  en_cours: { label: "En cours", icon: Clock, color: "bg-orange-50 text-orange-700 border-orange-200" },
  effectuee: { label: "Effectuée", icon: CheckCircle, color: "bg-green-50 text-green-700 border-green-200" },
  annulee: { label: "Annulée", icon: XCircle, color: "bg-red-50 text-red-700 border-red-200" },
};

export default function ContratDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const contratId = parseInt(params.id || "0");

  const [showInterventionDialog, setShowInterventionDialog] = useState(false);
  const [interventionForm, setInterventionForm] = useState({
    titre: "",
    description: "",
    dateIntervention: new Date().toISOString().split("T")[0],
    duree: "",
    technicienNom: "",
    notes: "",
  });

  const { data: contrat, isLoading, refetch } = trpc.contrats.getById.useQuery(
    { id: contratId },
    { enabled: contratId > 0 }
  );

  const { data: interventions, refetch: refetchInterventions } = trpc.contrats.getInterventions.useQuery(
    { contratId },
    { enabled: contratId > 0 }
  );

  const generateFactureMutation = trpc.contrats.generateFacture.useMutation({
    onSuccess: () => {
      toast.success("Facture générée avec succès");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.contrats.update.useMutation({
    onSuccess: () => {
      toast.success("Contrat mis à jour");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const createInterventionMutation = trpc.contrats.createIntervention.useMutation({
    onSuccess: () => {
      toast.success("Intervention planifiée");
      setShowInterventionDialog(false);
      setInterventionForm({ titre: "", description: "", dateIntervention: new Date().toISOString().split("T")[0], duree: "", technicienNom: "", notes: "" });
      refetchInterventions();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateInterventionMutation = trpc.contrats.updateIntervention.useMutation({
    onSuccess: () => {
      toast.success("Intervention mise à jour");
      refetchInterventions();
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!contrat) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setLocation("/contrats")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Retour
        </Button>
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Contrat non trouvé</p></CardContent></Card>
      </div>
    );
  }

  const montantHT = parseFloat(contrat.montantHT || "0");
  const tauxTVA = parseFloat(contrat.tauxTVA || "20");
  const montantTVA = montantHT * (tauxTVA / 100);
  const montantTTC = montantHT + montantTVA;

  const getStatutBadge = (statut: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      actif: { variant: "default", label: "Actif" },
      suspendu: { variant: "secondary", label: "Suspendu" },
      termine: { variant: "outline", label: "Terminé" },
      annule: { variant: "destructive", label: "Annulé" },
    };
    const config = variants[statut] || { variant: "outline" as const, label: statut };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/contrats")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{contrat.reference}</h1>
              {getStatutBadge(contrat.statut || "actif")}
              <Badge variant="outline">{typeLabels[contrat.type || "entretien"]}</Badge>
            </div>
            <p className="text-muted-foreground">{contrat.titre}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/contrats/${contrat.id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-2" />PDF
            </a>
          </Button>
          <Button
            size="sm"
            onClick={() => generateFactureMutation.mutate({ contratId: contrat.id })}
            disabled={generateFactureMutation.isPending || contrat.statut !== "actif"}
          >
            {generateFactureMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
            Générer facture
          </Button>
          {contrat.statut === "actif" && (
            <Button
              variant="outline"
              size="sm"
              className="text-orange-600"
              onClick={() => updateMutation.mutate({ id: contrat.id, statut: "suspendu" })}
            >
              Suspendre
            </Button>
          )}
          {contrat.statut === "suspendu" && (
            <Button
              variant="outline"
              size="sm"
              className="text-green-600"
              onClick={() => updateMutation.mutate({ id: contrat.id, statut: "actif" })}
            >
              Réactiver
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Détails</TabsTrigger>
          <TabsTrigger value="interventions">
            Interventions {interventions?.length ? `(${interventions.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="factures">
            Factures {contrat.facturesRecurrentes?.length ? `(${contrat.facturesRecurrentes.length})` : ""}
          </TabsTrigger>
        </TabsList>

        {/* Détails tab */}
        <TabsContent value="details" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Infos contrat */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Informations du contrat</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Référence</span>
                  <span className="font-medium">{contrat.reference}</span>

                  <span className="text-muted-foreground">Type</span>
                  <span>{typeLabels[contrat.type || "entretien"]}</span>

                  <span className="text-muted-foreground">Périodicité</span>
                  <span>{periodiciteLabels[contrat.periodicite]}</span>

                  <span className="text-muted-foreground">Date de début</span>
                  <span>{format(new Date(contrat.dateDebut), "dd MMMM yyyy", { locale: fr })}</span>

                  <span className="text-muted-foreground">Date de fin</span>
                  <span>{contrat.dateFin ? format(new Date(contrat.dateFin), "dd MMMM yyyy", { locale: fr }) : "Indéterminée"}</span>

                  <span className="text-muted-foreground">Reconduction</span>
                  <span>{contrat.reconduction ? "Tacite" : "Non"}</span>

                  <span className="text-muted-foreground">Préavis résiliation</span>
                  <span>{contrat.preavisResiliation || 1} mois</span>

                  <span className="text-muted-foreground">Prochaine facturation</span>
                  <span className="font-medium">
                    {contrat.prochainFacturation ? format(new Date(contrat.prochainFacturation), "dd/MM/yyyy") : "-"}
                  </span>

                  {contrat.prochainPassage && (
                    <>
                      <span className="text-muted-foreground">Prochain passage</span>
                      <span className="font-medium">{format(new Date(contrat.prochainPassage), "dd/MM/yyyy")}</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Infos financières + client */}
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-lg">Montants</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Montant HT</span>
                    <span className="font-medium">{montantHT.toFixed(2)} €</span>
                    <span className="text-muted-foreground">TVA ({tauxTVA}%)</span>
                    <span>{montantTVA.toFixed(2)} €</span>
                    <span className="text-muted-foreground font-medium">Montant TTC</span>
                    <span className="font-bold text-primary">{montantTTC.toFixed(2)} €</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">Client</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p className="font-medium">{contrat.client?.prenom} {contrat.client?.nom}</p>
                  {contrat.client?.email && <p className="text-muted-foreground">{contrat.client.email}</p>}
                  {contrat.client?.telephone && <p className="text-muted-foreground">{contrat.client.telephone}</p>}
                  {contrat.client?.adresse && (
                    <p className="text-muted-foreground">
                      {contrat.client.adresse}{contrat.client.codePostal ? `, ${contrat.client.codePostal} ${contrat.client.ville || ""}` : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Description */}
          {contrat.description && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Description des prestations</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{contrat.description}</p></CardContent>
            </Card>
          )}

          {/* Conditions particulières */}
          {contrat.conditionsParticulieres && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Conditions particulières</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{contrat.conditionsParticulieres}</p></CardContent>
            </Card>
          )}

          {/* Notes */}
          {contrat.notes && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Notes internes</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{contrat.notes}</p></CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Interventions tab */}
        <TabsContent value="interventions" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Interventions liées au contrat</h3>
            <Button size="sm" onClick={() => setShowInterventionDialog(true)} disabled={contrat.statut !== "actif"}>
              <Plus className="h-4 w-4 mr-2" />Planifier
            </Button>
          </div>

          {!interventions?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Wrench className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">Aucune intervention planifiée</p>
                <Button className="mt-4" size="sm" onClick={() => setShowInterventionDialog(true)} disabled={contrat.statut !== "actif"}>
                  <Plus className="h-4 w-4 mr-2" />Planifier une intervention
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Titre</TableHead>
                      <TableHead>Technicien</TableHead>
                      <TableHead>Durée</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interventions.map((inter) => {
                      const cfg = statutInterventionConfig[inter.statut || "planifiee"];
                      const Icon = cfg.icon;
                      return (
                        <TableRow key={inter.id}>
                          <TableCell>{format(new Date(inter.dateIntervention), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{inter.titre}</p>
                              {inter.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{inter.description}</p>}
                            </div>
                          </TableCell>
                          <TableCell>{inter.technicienNom || "-"}</TableCell>
                          <TableCell>{inter.duree || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cfg.color}>
                              <Icon className="h-3 w-3 mr-1" />{cfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {inter.statut === "planifiee" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => updateInterventionMutation.mutate({
                                    id: inter.id,
                                    contratId,
                                    statut: "effectuee",
                                  })}
                                >
                                  <CheckCircle className="h-3.5 w-3.5 mr-1" />Valider
                                </Button>
                              )}
                              {inter.statut === "planifiee" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600"
                                  onClick={() => updateInterventionMutation.mutate({
                                    id: inter.id,
                                    contratId,
                                    statut: "annulee",
                                  })}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1" />Annuler
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Dialog nouvelle intervention */}
          <Dialog open={showInterventionDialog} onOpenChange={setShowInterventionDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Planifier une intervention</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Titre *</Label>
                  <Input
                    value={interventionForm.titre}
                    onChange={(e) => setInterventionForm({ ...interventionForm, titre: e.target.value })}
                    placeholder="Ex: Visite de maintenance annuelle"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={interventionForm.description}
                    onChange={(e) => setInterventionForm({ ...interventionForm, description: e.target.value })}
                    placeholder="Détails de l'intervention..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date *</Label>
                    <Input
                      type="date"
                      value={interventionForm.dateIntervention}
                      onChange={(e) => setInterventionForm({ ...interventionForm, dateIntervention: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Durée estimée</Label>
                    <Input
                      value={interventionForm.duree}
                      onChange={(e) => setInterventionForm({ ...interventionForm, duree: e.target.value })}
                      placeholder="Ex: 2h"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Technicien</Label>
                  <Input
                    value={interventionForm.technicienNom}
                    onChange={(e) => setInterventionForm({ ...interventionForm, technicienNom: e.target.value })}
                    placeholder="Nom du technicien"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={interventionForm.notes}
                    onChange={(e) => setInterventionForm({ ...interventionForm, notes: e.target.value })}
                    placeholder="Notes..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowInterventionDialog(false)}>Annuler</Button>
                <Button
                  onClick={() => {
                    if (!interventionForm.titre || !interventionForm.dateIntervention) {
                      toast.error("Titre et date sont obligatoires");
                      return;
                    }
                    createInterventionMutation.mutate({
                      contratId,
                      titre: interventionForm.titre,
                      description: interventionForm.description || undefined,
                      dateIntervention: interventionForm.dateIntervention,
                      duree: interventionForm.duree || undefined,
                      technicienNom: interventionForm.technicienNom || undefined,
                      notes: interventionForm.notes || undefined,
                    });
                  }}
                  disabled={createInterventionMutation.isPending}
                >
                  {createInterventionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Planifier
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Factures tab */}
        <TabsContent value="factures" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Factures générées</h3>
            <Button
              size="sm"
              onClick={() => generateFactureMutation.mutate({ contratId: contrat.id })}
              disabled={generateFactureMutation.isPending || contrat.statut !== "actif"}
            >
              {generateFactureMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Générer facture
            </Button>
          </div>

          {!contrat.facturesRecurrentes?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Receipt className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">Aucune facture générée pour ce contrat</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Facture</TableHead>
                      <TableHead>Période début</TableHead>
                      <TableHead>Période fin</TableHead>
                      <TableHead>Automatique</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contrat.facturesRecurrentes.map((fr: any) => (
                      <TableRow key={fr.id} className="cursor-pointer" onClick={() => setLocation(`/factures/${fr.factureId}`)}>
                        <TableCell className="font-medium text-primary">Facture #{fr.factureId}</TableCell>
                        <TableCell>{format(new Date(fr.periodeDebut), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{format(new Date(fr.periodeFin), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{fr.genereeAutomatiquement ? "Oui" : "Non"}</TableCell>
                        <TableCell>{format(new Date(fr.createdAt), "dd/MM/yyyy")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
