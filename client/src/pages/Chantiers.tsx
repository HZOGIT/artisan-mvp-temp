import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Building2, Calendar, Euro, Users, FileText, Trash2, Edit, ChevronRight, Clock, CheckCircle2, PauseCircle, XCircle, AlertCircle, Eye, EyeOff, ListChecks } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function Chantiers() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedChantier, setSelectedChantier] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    clientId: 0,
    reference: "",
    nom: "",
    description: "",
    adresse: "",
    codePostal: "",
    ville: "",
    dateDebut: "",
    dateFinPrevue: "",
    budgetPrevisionnel: "",
    priorite: "normale" as "basse" | "normale" | "haute" | "urgente",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: chantiers, isLoading } = trpc.chantiers.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();
  const { data: chantierDetails } = trpc.chantiers.getById.useQuery(
    { id: selectedChantier! },
    { enabled: !!selectedChantier }
  );
  const { data: phases } = trpc.chantiers.getPhases.useQuery(
    { chantierId: selectedChantier! },
    { enabled: !!selectedChantier }
  );
  const { data: interventionsChantier } = trpc.chantiers.getInterventions.useQuery(
    { chantierId: selectedChantier! },
    { enabled: !!selectedChantier }
  );
  const { data: statistiques } = trpc.chantiers.getStatistiques.useQuery(
    { chantierId: selectedChantier! },
    { enabled: !!selectedChantier }
  );
  const { data: suiviEtapes } = trpc.chantiers.getSuivi.useQuery(
    { chantierId: selectedChantier! },
    { enabled: !!selectedChantier }
  );

  const [suiviForm, setSuiviForm] = useState({ titre: "", description: "", ordre: 1, visibleClient: true });
  const [isSuiviDialogOpen, setIsSuiviDialogOpen] = useState(false);

  const createSuiviMutation = trpc.chantiers.createSuivi.useMutation({
    onSuccess: () => {
      toast.success("Etape de suivi ajoutee");
      utils.chantiers.getSuivi.invalidate();
      setIsSuiviDialogOpen(false);
      setSuiviForm({ titre: "", description: "", ordre: 1, visibleClient: true });
    },
    onError: (error) => toast.error(error.message),
  });

  const updateSuiviMutation = trpc.chantiers.updateSuivi.useMutation({
    onSuccess: () => {
      toast.success("Etape mise a jour");
      utils.chantiers.getSuivi.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteSuiviMutation = trpc.chantiers.deleteSuivi.useMutation({
    onSuccess: () => {
      toast.success("Etape supprimee");
      utils.chantiers.getSuivi.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const createMutation = trpc.chantiers.create.useMutation({
    onSuccess: () => {
      toast.success("Chantier créé avec succès");
      utils.chantiers.list.invalidate();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.chantiers.update.useMutation({
    onSuccess: () => {
      toast.success("Chantier mis à jour");
      utils.chantiers.list.invalidate();
      utils.chantiers.getById.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.chantiers.delete.useMutation({
    onSuccess: () => {
      toast.success("Chantier supprimé");
      utils.chantiers.list.invalidate();
      setSelectedChantier(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      clientId: 0,
      reference: "",
      nom: "",
      description: "",
      adresse: "",
      codePostal: "",
      ville: "",
      dateDebut: "",
      dateFinPrevue: "",
      budgetPrevisionnel: "",
      priorite: "normale",
      notes: "",
    });
  };

  const handleSubmit = () => {
    if (!formData.clientId || !formData.reference || !formData.nom) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }
    createMutation.mutate(formData);
  };

  const getStatutBadge = (statut: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
      planifie: { variant: "secondary", icon: <Clock className="h-3 w-3" /> },
      en_cours: { variant: "default", icon: <AlertCircle className="h-3 w-3" /> },
      en_pause: { variant: "outline", icon: <PauseCircle className="h-3 w-3" /> },
      termine: { variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
      annule: { variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
    };
    const { variant, icon } = config[statut] || config.planifie;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {icon}
        {statut.replace("_", " ")}
      </Badge>
    );
  };

  const getPrioriteBadge = (priorite: string) => {
    const colors: Record<string, string> = {
      basse: "bg-gray-100 text-gray-800",
      normale: "bg-blue-100 text-blue-800",
      haute: "bg-orange-100 text-orange-800",
      urgente: "bg-red-100 text-red-800",
    };
    return (
      <Badge className={colors[priorite] || colors.normale}>
        {priorite}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chantiers</h1>
          <p className="text-muted-foreground">Gérez vos projets multi-interventions</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau chantier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Créer un nouveau chantier</DialogTitle>
              <DialogDescription>
                Définissez les informations du projet
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="client">Client *</Label>
                  <Select
                    value={formData.clientId.toString()}
                    onValueChange={(v) => setFormData({ ...formData, clientId: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((client) => (
                        <SelectItem key={client.id} value={client.id.toString()}>
                          {client.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference">Référence *</Label>
                  <Input
                    id="reference"
                    value={formData.reference}
                    onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                    placeholder="CHANT-2024-001"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nom">Nom du chantier *</Label>
                <Input
                  id="nom"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  placeholder="Rénovation complète appartement"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description détaillée du projet..."
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="adresse">Adresse</Label>
                  <Input
                    id="adresse"
                    value={formData.adresse}
                    onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="codePostal">Code postal</Label>
                  <Input
                    id="codePostal"
                    value={formData.codePostal}
                    onChange={(e) => setFormData({ ...formData, codePostal: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ville">Ville</Label>
                  <Input
                    id="ville"
                    value={formData.ville}
                    onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateDebut">Date de début</Label>
                  <Input
                    id="dateDebut"
                    type="date"
                    value={formData.dateDebut}
                    onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateFinPrevue">Date de fin prévue</Label>
                  <Input
                    id="dateFinPrevue"
                    type="date"
                    value={formData.dateFinPrevue}
                    onChange={(e) => setFormData({ ...formData, dateFinPrevue: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budgetPrevisionnel">Budget prévisionnel (€)</Label>
                  <Input
                    id="budgetPrevisionnel"
                    type="number"
                    value={formData.budgetPrevisionnel}
                    onChange={(e) => setFormData({ ...formData, budgetPrevisionnel: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priorite">Priorité</Label>
                <Select
                  value={formData.priorite}
                  onValueChange={(v: "basse" | "normale" | "haute" | "urgente") => setFormData({ ...formData, priorite: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basse">Basse</SelectItem>
                    <SelectItem value="normale">Normale</SelectItem>
                    <SelectItem value="haute">Haute</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Création..." : "Créer le chantier"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des chantiers */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-semibold">Mes chantiers</h2>
          {chantiers?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Aucun chantier</p>
                <Button variant="link" onClick={() => setIsDialogOpen(true)}>
                  Créer votre premier chantier
                </Button>
              </CardContent>
            </Card>
          ) : (
            chantiers?.map((chantier) => (
              <Card
                key={chantier.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedChantier === chantier.id ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setSelectedChantier(chantier.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{chantier.nom}</CardTitle>
                      <CardDescription>{chantier.reference}</CardDescription>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2">
                    {getStatutBadge(chantier.statut || "planifie")}
                    {getPrioriteBadge(chantier.priorite || "normale")}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Avancement</span>
                      <span>{chantier.avancement || 0}%</span>
                    </div>
                    <Progress value={chantier.avancement || 0} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Détails du chantier */}
        <div className="lg:col-span-2">
          {selectedChantier && chantierDetails ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{chantierDetails.nom}</CardTitle>
                    <CardDescription>{chantierDetails.reference}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-1" />
                      Modifier
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate({ id: selectedChantier })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="apercu">
                  <TabsList className="mb-4">
                    <TabsTrigger value="apercu">Aperçu</TabsTrigger>
                    <TabsTrigger value="phases">Phases</TabsTrigger>
                    <TabsTrigger value="interventions">Interventions</TabsTrigger>
                    <TabsTrigger value="documents">Documents</TabsTrigger>
                    <TabsTrigger value="suivi">Suivi client</TabsTrigger>
                  </TabsList>

                  <TabsContent value="apercu" className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Début</span>
                          </div>
                          <p className="text-lg font-semibold mt-1">
                            {chantierDetails.dateDebut
                              ? new Date(chantierDetails.dateDebut).toLocaleDateString()
                              : "-"}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Fin prévue</span>
                          </div>
                          <p className="text-lg font-semibold mt-1">
                            {chantierDetails.dateFinPrevue
                              ? new Date(chantierDetails.dateFinPrevue).toLocaleDateString()
                              : "-"}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-2">
                            <Euro className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Budget</span>
                          </div>
                          <p className="text-lg font-semibold mt-1">
                            {parseFloat(chantierDetails.budgetPrevisionnel || "0").toLocaleString()} €
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Interventions</span>
                          </div>
                          <p className="text-lg font-semibold mt-1">
                            {statistiques?.totalInterventions || 0}
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {chantierDetails.description && (
                      <div>
                        <h3 className="font-semibold mb-2">Description</h3>
                        <p className="text-muted-foreground">{chantierDetails.description}</p>
                      </div>
                    )}

                    {(chantierDetails.adresse || chantierDetails.ville) && (
                      <div>
                        <h3 className="font-semibold mb-2">Adresse</h3>
                        <p className="text-muted-foreground">
                          {chantierDetails.adresse}
                          {chantierDetails.codePostal && `, ${chantierDetails.codePostal}`}
                          {chantierDetails.ville && ` ${chantierDetails.ville}`}
                        </p>
                      </div>
                    )}

                    <div>
                      <h3 className="font-semibold mb-2">Avancement global</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Progression</span>
                          <span>{chantierDetails.avancement || 0}%</span>
                        </div>
                        <Progress value={chantierDetails.avancement || 0} className="h-3" />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Select
                        value={chantierDetails.statut || "planifie"}
                        onValueChange={(v) =>
                          updateMutation.mutate({
                            id: selectedChantier,
                            statut: v as "planifie" | "en_cours" | "en_pause" | "termine" | "annule",
                          })
                        }
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planifie">Planifié</SelectItem>
                          <SelectItem value="en_cours">En cours</SelectItem>
                          <SelectItem value="en_pause">En pause</SelectItem>
                          <SelectItem value="termine">Terminé</SelectItem>
                          <SelectItem value="annule">Annulé</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  <TabsContent value="phases">
                    <div className="space-y-4">
                      {phases?.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                          Aucune phase définie pour ce chantier
                        </p>
                      ) : (
                        phases?.map((phase, index) => (
                          <Card key={phase.id}>
                            <CardContent className="pt-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                                    {index + 1}
                                  </div>
                                  <div>
                                    <h4 className="font-semibold">{phase.nom}</h4>
                                    {phase.description && (
                                      <p className="text-sm text-muted-foreground">{phase.description}</p>
                                    )}
                                  </div>
                                </div>
                                {getStatutBadge(phase.statut || "a_faire")}
                              </div>
                              <div className="mt-3">
                                <Progress value={phase.avancement || 0} className="h-2" />
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                      <Button variant="outline" className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Ajouter une phase
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="interventions">
                    <div className="space-y-4">
                      {interventionsChantier?.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                          Aucune intervention associée à ce chantier
                        </p>
                      ) : (
                        interventionsChantier?.map((intervention: any) => (
                          <Card key={intervention.id}>
                            <CardContent className="pt-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-semibold">{intervention.titre}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {intervention.dateDebut
                                      ? new Date(intervention.dateDebut).toLocaleDateString()
                                      : "Date non définie"}
                                  </p>
                                </div>
                                <Badge>{intervention.statut}</Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                      <Button variant="outline" className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Associer une intervention
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="documents">
                    <div className="space-y-4">
                      <p className="text-muted-foreground text-center py-8">
                        Aucun document pour ce chantier
                      </p>
                      <Button variant="outline" className="w-full">
                        <FileText className="h-4 w-4 mr-2" />
                        Ajouter un document
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="suivi">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold flex items-center gap-2">
                          <ListChecks className="h-4 w-4" />
                          Etapes de suivi
                        </h3>
                        <Dialog open={isSuiviDialogOpen} onOpenChange={setIsSuiviDialogOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm">
                              <Plus className="h-4 w-4 mr-2" />
                              Ajouter
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Nouvelle etape de suivi</DialogTitle>
                              <DialogDescription>Cette etape sera visible par le client sur son portail.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>Titre *</Label>
                                <Input value={suiviForm.titre} onChange={(e) => setSuiviForm({ ...suiviForm, titre: e.target.value })} placeholder="Ex: Diagnostic initial" />
                              </div>
                              <div className="space-y-2">
                                <Label>Description</Label>
                                <Textarea value={suiviForm.description} onChange={(e) => setSuiviForm({ ...suiviForm, description: e.target.value })} placeholder="Details de l'etape..." />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Ordre</Label>
                                  <Input type="number" value={suiviForm.ordre} onChange={(e) => setSuiviForm({ ...suiviForm, ordre: parseInt(e.target.value) || 1 })} />
                                </div>
                                <div className="flex items-center gap-2 pt-6">
                                  <Switch checked={suiviForm.visibleClient} onCheckedChange={(v) => setSuiviForm({ ...suiviForm, visibleClient: v })} />
                                  <Label>Visible client</Label>
                                </div>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button onClick={() => {
                                if (!suiviForm.titre) { toast.error("Titre requis"); return; }
                                createSuiviMutation.mutate({ chantierId: selectedChantier!, ...suiviForm });
                              }}>Ajouter</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>

                      {(!suiviEtapes || suiviEtapes.length === 0) ? (
                        <p className="text-muted-foreground text-center py-8">Aucune etape de suivi definie</p>
                      ) : (
                        <div className="space-y-3">
                          {suiviEtapes.map((etape: any) => (
                            <Card key={etape.id} className={etape.statut === "termine" ? "border-green-200 bg-green-50/30" : etape.statut === "en_cours" ? "border-blue-200 bg-blue-50/30" : ""}>
                              <CardContent className="pt-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-3">
                                    <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${
                                      etape.statut === "termine" ? "bg-green-500 text-white" : etape.statut === "en_cours" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-600"
                                    }`}>
                                      {etape.ordre}
                                    </div>
                                    <div>
                                      <h4 className="font-semibold">{etape.titre}</h4>
                                      {etape.description && <p className="text-sm text-muted-foreground">{etape.description}</p>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {etape.visibleClient ? <Eye className="h-4 w-4 text-green-500" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
                                    <Select
                                      value={etape.statut || "a_faire"}
                                      onValueChange={(v) => updateSuiviMutation.mutate({
                                        id: etape.id,
                                        statut: v as "a_faire" | "en_cours" | "termine",
                                        pourcentage: v === "termine" ? 100 : v === "en_cours" ? 50 : 0,
                                      })}
                                    >
                                      <SelectTrigger className="w-[130px] h-8">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="a_faire">A faire</SelectItem>
                                        <SelectItem value="en_cours">En cours</SelectItem>
                                        <SelectItem value="termine">Termine</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Button variant="ghost" size="sm" onClick={() => deleteSuiviMutation.mutate({ id: etape.id })}>
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                </div>
                                <Progress value={etape.pourcentage || 0} className="h-2" />
                                <p className="text-xs text-muted-foreground mt-1">{etape.pourcentage || 0}%</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Sélectionnez un chantier pour voir les détails
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
