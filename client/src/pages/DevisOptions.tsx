import { useState } from "react";
import { useParams, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Star, Check, ArrowLeft, Package } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function DevisOptions() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const devisId = parseInt(params.id || "0");
  
  const [showNewOption, setShowNewOption] = useState(false);
  const [showNewLigne, setShowNewLigne] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null);
  const [newOption, setNewOption] = useState({ nom: "", description: "", recommandee: false });
  const [newLigne, setNewLigne] = useState({
    designation: "",
    description: "",
    quantite: "1",
    unite: "unité",
    prixUnitaireHT: "0",
    tauxTVA: "20",
  });

  const utils = trpc.useUtils();
  const { data: devis } = trpc.devis.getById.useQuery({ id: devisId });
  const { data: options, isLoading } = trpc.devisOptions.getByDevisId.useQuery({ devisId });
  const { data: lignes } = trpc.devisOptions.getLignes.useQuery(
    { optionId: selectedOptionId! },
    { enabled: !!selectedOptionId }
  );

  const createOption = trpc.devisOptions.create.useMutation({
    onSuccess: () => {
      utils.devisOptions.getByDevisId.invalidate({ devisId });
      setShowNewOption(false);
      setNewOption({ nom: "", description: "", recommandee: false });
      toast.success("Option créée");
    },
  });

  const deleteOption = trpc.devisOptions.delete.useMutation({
    onSuccess: () => {
      utils.devisOptions.getByDevisId.invalidate({ devisId });
      if (selectedOptionId) setSelectedOptionId(null);
      toast.success("Option supprimée");
    },
  });

  const selectOption = trpc.devisOptions.select.useMutation({
    onSuccess: () => {
      utils.devisOptions.getByDevisId.invalidate({ devisId });
      toast.success("Option sélectionnée");
    },
  });

  const convertirOption = trpc.devisOptions.convertirEnDevis.useMutation({
    onSuccess: () => {
      toast.success("Option convertie en devis");
      navigate(`/devis/${devisId}`);
    },
  });

  const createLigne = trpc.devisOptions.createLigne.useMutation({
    onSuccess: () => {
      utils.devisOptions.getLignes.invalidate({ optionId: selectedOptionId! });
      utils.devisOptions.getByDevisId.invalidate({ devisId });
      setShowNewLigne(false);
      setNewLigne({
        designation: "",
        description: "",
        quantite: "1",
        unite: "unité",
        prixUnitaireHT: "0",
        tauxTVA: "20",
      });
      toast.success("Ligne ajoutée");
    },
  });

  const deleteLigne = trpc.devisOptions.deleteLigne.useMutation({
    onSuccess: () => {
      utils.devisOptions.getLignes.invalidate({ optionId: selectedOptionId! });
      utils.devisOptions.getByDevisId.invalidate({ devisId });
      toast.success("Ligne supprimée");
    },
  });

  const formatMontant = (montant: string | null) => {
    const num = parseFloat(montant || "0");
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
  };

  if (!devis) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/devis/${devisId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Options du devis {devis.numero}</h1>
            <p className="text-muted-foreground">
              Proposez plusieurs options à votre client
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Liste des options */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Options</CardTitle>
                <Dialog open={showNewOption} onOpenChange={setShowNewOption}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Nouvelle
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nouvelle option</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Nom de l'option</Label>
                        <Input
                          placeholder="Ex: Option Standard"
                          value={newOption.nom}
                          onChange={(e) => setNewOption({ ...newOption, nom: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          placeholder="Description de l'option..."
                          value={newOption.description}
                          onChange={(e) => setNewOption({ ...newOption, description: e.target.value })}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="recommandee"
                          checked={newOption.recommandee}
                          onChange={(e) => setNewOption({ ...newOption, recommandee: e.target.checked })}
                        />
                        <Label htmlFor="recommandee">Option recommandée</Label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => createOption.mutate({ devisId, ...newOption })}
                        disabled={!newOption.nom || createOption.isPending}
                      >
                        Créer
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  <p className="text-muted-foreground">Chargement...</p>
                ) : options && options.length > 0 ? (
                  options.map((option) => (
                    <div
                      key={option.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedOptionId === option.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedOptionId(option.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{option.nom}</span>
                          {option.recommandee && (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          )}
                          {option.selectionnee && (
                            <Badge className="bg-green-100 text-green-800">Choisie</Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-lg font-bold text-primary">
                        {formatMontant(option.totalTTC)}
                      </p>
                      {option.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {option.description}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Aucune option créée
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Détail de l'option sélectionnée */}
          <div className="lg:col-span-2">
            {selectedOptionId ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>
                        {options?.find((o) => o.id === selectedOptionId)?.nom}
                      </CardTitle>
                      <CardDescription>
                        {options?.find((o) => o.id === selectedOptionId)?.description}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => selectOption.mutate({ optionId: selectedOptionId })}
                        disabled={selectOption.isPending}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Sélectionner
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => convertirOption.mutate({ optionId: selectedOptionId })}
                        disabled={convertirOption.isPending}
                      >
                        Appliquer au devis
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteOption.mutate({ id: selectedOptionId })}
                        disabled={deleteOption.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-medium">Lignes de l'option</h3>
                    <Dialog open={showNewLigne} onOpenChange={setShowNewLigne}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Plus className="h-4 w-4 mr-2" />
                          Ajouter une ligne
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Nouvelle ligne</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Désignation</Label>
                            <Input
                              value={newLigne.designation}
                              onChange={(e) => setNewLigne({ ...newLigne, designation: e.target.value })}
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Quantité</Label>
                              <Input
                                type="number"
                                value={newLigne.quantite}
                                onChange={(e) => setNewLigne({ ...newLigne, quantite: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Unité</Label>
                              <Input
                                value={newLigne.unite}
                                onChange={(e) => setNewLigne({ ...newLigne, unite: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Prix unitaire HT</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={newLigne.prixUnitaireHT}
                                onChange={(e) => setNewLigne({ ...newLigne, prixUnitaireHT: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Taux TVA (%)</Label>
                              <Input
                                type="number"
                                value={newLigne.tauxTVA}
                                onChange={(e) => setNewLigne({ ...newLigne, tauxTVA: e.target.value })}
                              />
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => createLigne.mutate({ optionId: selectedOptionId, ...newLigne })}
                            disabled={!newLigne.designation || createLigne.isPending}
                          >
                            Ajouter
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {lignes && lignes.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Désignation</TableHead>
                          <TableHead className="text-right">Qté</TableHead>
                          <TableHead className="text-right">P.U. HT</TableHead>
                          <TableHead className="text-right">TVA</TableHead>
                          <TableHead className="text-right">Total TTC</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lignes.map((ligne) => (
                          <TableRow key={ligne.id}>
                            <TableCell>{ligne.designation}</TableCell>
                            <TableCell className="text-right">
                              {ligne.quantite} {ligne.unite}
                            </TableCell>
                            <TableCell className="text-right">{formatMontant(ligne.prixUnitaireHT)}</TableCell>
                            <TableCell className="text-right">{ligne.tauxTVA}%</TableCell>
                            <TableCell className="text-right font-medium">{formatMontant(ligne.montantTTC)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteLigne.mutate({ id: ligne.id, optionId: selectedOptionId })}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Aucune ligne dans cette option
                    </p>
                  )}

                  {/* Totaux */}
                  {options && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <div className="flex justify-between">
                        <span>Total HT</span>
                        <span className="font-medium">
                          {formatMontant(options.find((o) => o.id === selectedOptionId)?.totalHT || "0")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>TVA</span>
                        <span className="font-medium">
                          {formatMontant(options.find((o) => o.id === selectedOptionId)?.totalTVA || "0")}
                        </span>
                      </div>
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total TTC</span>
                        <span className="text-primary">
                          {formatMontant(options.find((o) => o.id === selectedOptionId)?.totalTTC || "0")}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Sélectionnez une option pour voir ses détails
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
