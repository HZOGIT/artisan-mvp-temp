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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Camera, Upload, Sparkles, FileText, Trash2, Eye, CheckCircle2, Clock, AlertCircle, RefreshCw, Image as ImageIcon, ChevronRight, Edit2, Plus, Save, X } from "lucide-react";

interface SuggestionEditable {
  id: number;
  nomArticle: string;
  quantiteSuggeree: number;
  unite: string;
  prixEstime: string;
  selectionne: boolean;
  confiance: number;
  isEditing?: boolean;
  isNew?: boolean;
}

export default function DevisIA() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAnalyse, setSelectedAnalyse] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    titre: "",
    description: "",
    clientId: 0,
  });
  const [uploadedPhotos, setUploadedPhotos] = useState<{ url: string; description: string }[]>([]);
  const [editedSuggestions, setEditedSuggestions] = useState<Record<number, SuggestionEditable>>({});
  const [newSuggestions, setNewSuggestions] = useState<SuggestionEditable[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
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
      setIsEditMode(false);
      setEditedSuggestions({});
      setNewSuggestions([]);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selectedAnalyse) return;

    for (const file of Array.from(files)) {
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

  // Fonctions pour l'édition des suggestions
  const startEditMode = () => {
    setIsEditMode(true);
    // Initialiser les suggestions éditées avec les valeurs actuelles
    const initialEdits: Record<number, SuggestionEditable> = {};
    analyseDetails?.resultats?.forEach((resultat: any) => {
      resultat.suggestions?.forEach((suggestion: any) => {
        initialEdits[suggestion.id] = {
          id: suggestion.id,
          nomArticle: suggestion.nomArticle,
          quantiteSuggeree: suggestion.quantiteSuggeree,
          unite: suggestion.unite || "unité",
          prixEstime: suggestion.prixEstime,
          selectionne: suggestion.selectionne,
          confiance: suggestion.confiance,
        };
      });
    });
    setEditedSuggestions(initialEdits);
  };

  const cancelEditMode = () => {
    setIsEditMode(false);
    setEditedSuggestions({});
    setNewSuggestions([]);
  };

  const updateEditedSuggestion = (id: number, field: keyof SuggestionEditable, value: any) => {
    setEditedSuggestions(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const addNewSuggestion = () => {
    const newId = Date.now();
    setNewSuggestions(prev => [...prev, {
      id: newId,
      nomArticle: "",
      quantiteSuggeree: 1,
      unite: "unité",
      prixEstime: "0",
      selectionne: true,
      confiance: 100,
      isNew: true,
    }]);
  };

  const updateNewSuggestion = (id: number, field: keyof SuggestionEditable, value: any) => {
    setNewSuggestions(prev => prev.map(s => 
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const removeNewSuggestion = (id: number) => {
    setNewSuggestions(prev => prev.filter(s => s.id !== id));
  };

  const saveAllChanges = async () => {
    // Sauvegarder les modifications des suggestions existantes
    for (const [id, suggestion] of Object.entries(editedSuggestions)) {
      await updateSuggestionMutation.mutateAsync({
        id: parseInt(id),
        selectionne: suggestion.selectionne,
        quantiteSuggeree: suggestion.quantiteSuggeree.toString(),
        prixEstime: suggestion.prixEstime,
      });
    }
    toast.success("Modifications sauvegardées");
    setIsEditMode(false);
  };

  const calculateTotal = () => {
    let total = 0;
    // Ajouter les suggestions existantes sélectionnées
    Object.values(editedSuggestions).forEach(s => {
      if (s.selectionne) {
        total += s.quantiteSuggeree * parseFloat(s.prixEstime || "0");
      }
    });
    // Ajouter les nouvelles suggestions sélectionnées
    newSuggestions.forEach(s => {
      if (s.selectionne) {
        total += s.quantiteSuggeree * parseFloat(s.prixEstime || "0");
      }
    });
    return total;
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
                      <div className="flex gap-2">
                        <input
                          type="file"
                          ref={fileInputRef}
                          className="hidden"
                          accept="image/*"
                          multiple
                          onChange={handleFileUpload}
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
                    </div>
                    {analyseDetails.photos && analyseDetails.photos.length > 0 ? (
                      <div className="grid grid-cols-3 gap-4">
                        {analyseDetails.photos.map((photo: any) => (
                          <div key={photo.id} className="relative group">
                            <img
                              src={photo.url}
                              alt={photo.description}
                              className="w-full h-32 object-cover rounded-lg"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                              <Button variant="ghost" size="icon" className="text-white">
                                <Eye className="h-5 w-5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border-2 border-dashed rounded-lg p-8 text-center">
                        <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">
                          Ajoutez des photos pour commencer l'analyse
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Bouton Analyser */}
                  {analyseDetails.photos && analyseDetails.photos.length > 0 && analyseDetails.statut === "en_attente" && (
                    <Button
                      className="w-full"
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
                          Analyser les photos avec l'IA
                        </>
                      )}
                    </Button>
                  )}

                  {/* Résultats de l'analyse avec édition */}
                  {analyseDetails.resultats && analyseDetails.resultats.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">Travaux détectés et articles suggérés</h3>
                        {!isEditMode && !analyseDetails.devisGenere && (
                          <Button variant="outline" size="sm" onClick={startEditMode}>
                            <Edit2 className="h-4 w-4 mr-2" />
                            Modifier les suggestions
                          </Button>
                        )}
                        {isEditMode && (
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={cancelEditMode}>
                              <X className="h-4 w-4 mr-2" />
                              Annuler
                            </Button>
                            <Button size="sm" onClick={saveAllChanges}>
                              <Save className="h-4 w-4 mr-2" />
                              Sauvegarder
                            </Button>
                          </div>
                        )}
                      </div>

                      {isEditMode ? (
                        /* Mode édition avec tableau */
                        <Card>
                          <CardContent className="pt-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-12">Sel.</TableHead>
                                  <TableHead>Article</TableHead>
                                  <TableHead className="w-24">Qté</TableHead>
                                  <TableHead className="w-24">Unité</TableHead>
                                  <TableHead className="w-32">Prix unit. €</TableHead>
                                  <TableHead className="w-32 text-right">Total €</TableHead>
                                  <TableHead className="w-12"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {Object.values(editedSuggestions).map((suggestion) => (
                                  <TableRow key={suggestion.id}>
                                    <TableCell>
                                      <Checkbox
                                        checked={suggestion.selectionne}
                                        onCheckedChange={(checked) =>
                                          updateEditedSuggestion(suggestion.id, "selectionne", !!checked)
                                        }
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        value={suggestion.nomArticle}
                                        onChange={(e) =>
                                          updateEditedSuggestion(suggestion.id, "nomArticle", e.target.value)
                                        }
                                        className="h-8"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="number"
                                        value={suggestion.quantiteSuggeree}
                                        onChange={(e) =>
                                          updateEditedSuggestion(suggestion.id, "quantiteSuggeree", parseFloat(e.target.value) || 0)
                                        }
                                        className="h-8"
                                        min="0"
                                        step="0.1"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        value={suggestion.unite}
                                        onChange={(e) =>
                                          updateEditedSuggestion(suggestion.id, "unite", e.target.value)
                                        }
                                        className="h-8"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="number"
                                        value={suggestion.prixEstime}
                                        onChange={(e) =>
                                          updateEditedSuggestion(suggestion.id, "prixEstime", e.target.value)
                                        }
                                        className="h-8"
                                        min="0"
                                        step="0.01"
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                      {(suggestion.quantiteSuggeree * parseFloat(suggestion.prixEstime || "0")).toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="text-xs">
                                        {suggestion.confiance}%
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                                {/* Nouvelles suggestions ajoutées manuellement */}
                                {newSuggestions.map((suggestion) => (
                                  <TableRow key={suggestion.id} className="bg-green-50">
                                    <TableCell>
                                      <Checkbox
                                        checked={suggestion.selectionne}
                                        onCheckedChange={(checked) =>
                                          updateNewSuggestion(suggestion.id, "selectionne", !!checked)
                                        }
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        value={suggestion.nomArticle}
                                        onChange={(e) =>
                                          updateNewSuggestion(suggestion.id, "nomArticle", e.target.value)
                                        }
                                        className="h-8"
                                        placeholder="Nom de l'article"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="number"
                                        value={suggestion.quantiteSuggeree}
                                        onChange={(e) =>
                                          updateNewSuggestion(suggestion.id, "quantiteSuggeree", parseFloat(e.target.value) || 0)
                                        }
                                        className="h-8"
                                        min="0"
                                        step="0.1"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        value={suggestion.unite}
                                        onChange={(e) =>
                                          updateNewSuggestion(suggestion.id, "unite", e.target.value)
                                        }
                                        className="h-8"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="number"
                                        value={suggestion.prixEstime}
                                        onChange={(e) =>
                                          updateNewSuggestion(suggestion.id, "prixEstime", e.target.value)
                                        }
                                        className="h-8"
                                        min="0"
                                        step="0.01"
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                      {(suggestion.quantiteSuggeree * parseFloat(suggestion.prixEstime || "0")).toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-500"
                                        onClick={() => removeNewSuggestion(suggestion.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                            
                            <div className="flex items-center justify-between mt-4 pt-4 border-t">
                              <Button variant="outline" size="sm" onClick={addNewSuggestion}>
                                <Plus className="h-4 w-4 mr-2" />
                                Ajouter un article
                              </Button>
                              <div className="text-right">
                                <p className="text-sm text-muted-foreground">Total estimé HT</p>
                                <p className="text-2xl font-bold">{calculateTotal().toFixed(2)} €</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        /* Mode affichage normal */
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
                      )}

                      {/* Prévisualisation du devis */}
                      {isEditMode && (
                        <Card className="mt-4 border-blue-200 bg-blue-50">
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-semibold text-blue-800">Prévisualisation</h4>
                                <p className="text-sm text-blue-700">
                                  {Object.values(editedSuggestions).filter(s => s.selectionne).length + newSuggestions.filter(s => s.selectionne).length} articles sélectionnés
                                </p>
                              </div>
                              <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
                                <Eye className="h-4 w-4 mr-2" />
                                {showPreview ? "Masquer" : "Voir"} le détail
                              </Button>
                            </div>
                            {showPreview && (
                              <div className="mt-4 p-4 bg-white rounded-lg">
                                <h5 className="font-semibold mb-2">Récapitulatif du devis</h5>
                                <div className="space-y-1 text-sm">
                                  {Object.values(editedSuggestions).filter(s => s.selectionne).map(s => (
                                    <div key={s.id} className="flex justify-between">
                                      <span>{s.nomArticle} x {s.quantiteSuggeree}</span>
                                      <span>{(s.quantiteSuggeree * parseFloat(s.prixEstime || "0")).toFixed(2)} €</span>
                                    </div>
                                  ))}
                                  {newSuggestions.filter(s => s.selectionne).map(s => (
                                    <div key={s.id} className="flex justify-between text-green-700">
                                      <span>{s.nomArticle} x {s.quantiteSuggeree} (ajouté)</span>
                                      <span>{(s.quantiteSuggeree * parseFloat(s.prixEstime || "0")).toFixed(2)} €</span>
                                    </div>
                                  ))}
                                  <div className="border-t pt-2 mt-2 font-semibold flex justify-between">
                                    <span>Total HT</span>
                                    <span>{calculateTotal().toFixed(2)} €</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>TVA (20%)</span>
                                    <span>{(calculateTotal() * 0.2).toFixed(2)} €</span>
                                  </div>
                                  <div className="flex justify-between text-lg font-bold">
                                    <span>Total TTC</span>
                                    <span>{(calculateTotal() * 1.2).toFixed(2)} €</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {/* Générer le devis */}
                      {!analyseDetails.devisGenere && (
                        <Card className="mt-4">
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-semibold">Générer le devis</h4>
                                <p className="text-sm text-muted-foreground">
                                  {isEditMode 
                                    ? "Sauvegardez vos modifications puis générez le devis"
                                    : "Créez un devis à partir des articles sélectionnés"
                                  }
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
                                    genererDevisMutation.isPending || !formData.clientId || isEditMode
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
