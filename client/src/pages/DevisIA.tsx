import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Camera, Upload, Sparkles, FileText, Trash2, Eye, CheckCircle2, Clock, AlertCircle, RefreshCw, Image as ImageIcon, ChevronRight } from "lucide-react";

export default function DevisIA() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAnalyse, setSelectedAnalyse] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    titre: "",
    description: "",
    clientId: 0,
  });
  const [uploadedPhotos, setUploadedPhotos] = useState<{ url: string; description: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: analyses, isLoading } = trpc.devisIA.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();
  const { data: analyseDetails } = trpc.devisIA.getById.useQuery(
    { id: selectedAnalyse ?? 0 },
    { enabled: !!selectedAnalyse }
  );

  const createAnalyseMutation = trpc.devisIA.createAnalyse.useMutation({
    onSuccess: (data) => {
      toast.success("Analyse créée");
      if (data) setSelectedAnalyse(data.id);
      utils.devisIA.list.invalidate();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const addPhotoMutation = trpc.devisIA.addPhoto.useMutation({
    onSuccess: () => {
      toast.success("Photo ajoutée");
      utils.devisIA.getById.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const analyserPhotosMutation = trpc.devisIA.analyserPhotos.useMutation({
    onSuccess: (data) => {
      toast.success(`Analyse terminée: ${data.nombreTravaux} types de travaux détectés`);
      utils.devisIA.getById.invalidate();
      utils.devisIA.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateSuggestionMutation = trpc.devisIA.updateSuggestion.useMutation({
    onSuccess: () => {
      utils.devisIA.getById.invalidate();
    },
  });

  const genererDevisMutation = trpc.devisIA.genererDevis.useMutation({
    onSuccess: () => {
      toast.success("Devis généré avec succès");
      utils.devisIA.getById.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selectedAnalyse) return;

    for (const file of Array.from(files)) {
      // Simuler l'upload - en production, utiliser storagePut
      const reader = new FileReader();
      reader.onload = async (event) => {
        const url = event.target?.result as string;
        await addPhotoMutation.mutateAsync({
          analyseId: selectedAnalyse,
          url,
          description: file.name,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateAnalyse = () => {
    if (!formData.titre) {
      toast.error("Veuillez donner un titre à l'analyse");
      return;
    }
    createAnalyseMutation.mutate(formData);
  };

  const getStatutBadge = (statut: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive"; icon: React.ReactNode; label: string }> = {
      en_attente: { variant: "secondary", icon: <Clock className="h-3 w-3" />, label: "En attente" },
      en_cours: { variant: "secondary", icon: <RefreshCw className="h-3 w-3 animate-spin" />, label: "Analyse en cours" },
      termine: { variant: "default", icon: <CheckCircle2 className="h-3 w-3" />, label: "Terminé" },
      erreur: { variant: "destructive", icon: <AlertCircle className="h-3 w-3" />, label: "Erreur" },
    };
    const { variant, icon, label } = config[statut] || config.en_attente;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {icon}
        {label}
      </Badge>
    );
  };

  const getUrgenceBadge = (urgence: string) => {
    const colors: Record<string, string> = {
      faible: "bg-gray-100 text-gray-800",
      moyenne: "bg-blue-100 text-blue-800",
      haute: "bg-orange-100 text-orange-800",
      critique: "bg-red-100 text-red-800",
    };
    return <Badge className={colors[urgence] || colors.moyenne}>{urgence}</Badge>;
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
          <h1 className="text-3xl font-bold tracking-tight">Devis Automatique IA</h1>
          <p className="text-muted-foreground">
            Générez des devis automatiquement à partir de photos du chantier
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Sparkles className="h-4 w-4 mr-2" />
              Nouvelle analyse
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer une nouvelle analyse</DialogTitle>
              <DialogDescription>
                L'IA analysera vos photos pour identifier les travaux nécessaires
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Titre de l'analyse *</Label>
                <Input
                  value={formData.titre}
                  onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                  placeholder="Ex: Rénovation salle de bain"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Décrivez brièvement le projet..."
                />
              </div>
              <div className="space-y-2">
                <Label>Client (optionnel)</Label>
                <Select
                  value={formData.clientId.toString()}
                  onValueChange={(v) => setFormData({ ...formData, clientId: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Aucun client</SelectItem>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id.toString()}>
                        {client.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleCreateAnalyse} disabled={createAnalyseMutation.isPending}>
                {createAnalyseMutation.isPending ? "Création..." : "Créer l'analyse"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des analyses */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-semibold">Mes analyses</h2>
          {analyses?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Aucune analyse</p>
                <Button variant="link" onClick={() => setIsDialogOpen(true)}>
                  Créer votre première analyse
                </Button>
              </CardContent>
            </Card>
          ) : (
            analyses?.map((analyse) => (
              <Card
                key={analyse.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedAnalyse === analyse.id ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setSelectedAnalyse(analyse.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{analyse.titre || "Sans titre"}</CardTitle>
                      <CardDescription>
                        {analyse.createdAt
                          ? new Date(analyse.createdAt).toLocaleDateString()
                          : "-"}
                      </CardDescription>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  {getStatutBadge(analyse.statut || "en_attente")}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Détails de l'analyse */}
        <div className="lg:col-span-2">
          {selectedAnalyse && analyseDetails ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{analyseDetails.titre || "Sans titre"}</CardTitle>
                      <CardDescription>{analyseDetails.description}</CardDescription>
                    </div>
                    {getStatutBadge(analyseDetails.statut || "en_attente")}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Section Photos */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Photos du chantier</h3>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept="image/*"
                        multiple
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Ajouter des photos
                      </Button>
                    </div>

                    {analyseDetails.photos?.length === 0 ? (
                      <div
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">
                          Cliquez pour ajouter des photos du chantier
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-4">
                        {analyseDetails.photos?.map((photo: any) => (
                          <div key={photo.id} className="relative group">
                            <img
                              src={photo.url}
                              alt={photo.description || "Photo"}
                              className="w-full h-32 object-cover rounded-lg"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                              <Button variant="secondary" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="destructive" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {analyseDetails.photos && analyseDetails.photos.length > 0 && analyseDetails.statut === "en_attente" && (
                      <Button
                        className="w-full mt-4"
                        onClick={() => analyserPhotosMutation.mutate({ analyseId: selectedAnalyse })}
                        disabled={analyserPhotosMutation.isPending}
                      >
                        {analyserPhotosMutation.isPending ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Analyse en cours...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Lancer l'analyse IA
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Résultats de l'analyse */}
                  {analyseDetails.resultats && analyseDetails.resultats.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-4">Travaux détectés</h3>
                      <div className="space-y-4">
                        {analyseDetails.resultats.map((resultat: any) => (
                          <Card key={resultat.id}>
                            <CardHeader className="pb-2">
                              <div className="flex items-start justify-between">
                                <div>
                                  <CardTitle className="text-base">
                                    {resultat.typeTravauxDetecte}
                                  </CardTitle>
                                  <CardDescription>
                                    {resultat.descriptionTravaux}
                                  </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                  {getUrgenceBadge(resultat.urgence || "moyenne")}
                                  <Badge variant="outline">
                                    {resultat.confiance}% confiance
                                  </Badge>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <h4 className="text-sm font-semibold mb-2">
                                Articles suggérés
                              </h4>
                              <div className="space-y-2">
                                {resultat.suggestions?.map((suggestion: any) => (
                                  <div
                                    key={suggestion.id}
                                    className="flex items-center justify-between p-2 border rounded"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Checkbox
                                        checked={suggestion.selectionne}
                                        onCheckedChange={(checked) =>
                                          updateSuggestionMutation.mutate({
                                            id: suggestion.id,
                                            selectionne: !!checked,
                                          })
                                        }
                                      />
                                      <div>
                                        <p className="font-medium">{suggestion.nomArticle}</p>
                                        <p className="text-sm text-muted-foreground">
                                          {suggestion.quantiteSuggeree} {suggestion.unite}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-semibold">
                                        {parseFloat(suggestion.prixEstime || "0").toFixed(2)} €
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {suggestion.confiance}% confiance
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {/* Générer le devis */}
                      {!analyseDetails.devisGenere && (
                        <Card className="mt-4">
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-semibold">Générer le devis</h4>
                                <p className="text-sm text-muted-foreground">
                                  Créez un devis à partir des articles sélectionnés
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Select
                                  value={formData.clientId.toString()}
                                  onValueChange={(v) =>
                                    setFormData({ ...formData, clientId: parseInt(v) })
                                  }
                                >
                                  <SelectTrigger className="w-[200px]">
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
                                <Button
                                  onClick={() =>
                                    genererDevisMutation.mutate({
                                      analyseId: selectedAnalyse,
                                      clientId: formData.clientId,
                                    })
                                  }
                                  disabled={
                                    genererDevisMutation.isPending || !formData.clientId
                                  }
                                >
                                  {genererDevisMutation.isPending ? (
                                    <>
                                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                      Génération...
                                    </>
                                  ) : (
                                    <>
                                      <FileText className="h-4 w-4 mr-2" />
                                      Générer le devis
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Devis généré */}
                      {analyseDetails.devisGenere && (
                        <Card className="mt-4 border-green-200 bg-green-50">
                          <CardContent className="pt-4">
                            <div className="flex items-center gap-4">
                              <CheckCircle2 className="h-8 w-8 text-green-600" />
                              <div>
                                <h4 className="font-semibold text-green-800">
                                  Devis généré avec succès
                                </h4>
                                <p className="text-sm text-green-700">
                                  Devis généré -{" "}
                                  {parseFloat(analyseDetails.devisGenere.montantEstime || "0").toFixed(2)} € TTC
                                </p>
                              </div>
                              <Button variant="outline" className="ml-auto">
                                <Eye className="h-4 w-4 mr-2" />
                                Voir le devis
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Sélectionnez une analyse pour voir les détails
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
