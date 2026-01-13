import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, FileText, User, Receipt, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateDevisPDF } from "@/lib/pdfGenerator";
import { fr } from "date-fns/locale";

const statusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé",
  expire: "Expiré",
};

const statusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  envoye: "bg-blue-100 text-blue-700",
  accepte: "bg-green-100 text-green-700",
  refuse: "bg-red-100 text-red-700",
  expire: "bg-orange-100 text-orange-700",
};

export default function DevisDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [isAddLineDialogOpen, setIsAddLineDialogOpen] = useState(false);
  const [lineFormData, setLineFormData] = useState({
    reference: "",
    designation: "",
    description: "",
    quantite: "1",
    unite: "unité",
    prixUnitaireHT: "",
    tauxTVA: "20.00",
  });

  const utils = trpc.useUtils();
  const { data: devis, isLoading } = trpc.devis.getById.useQuery(
    { id: parseInt(id || "0") },
    { enabled: !!id }
  );
  const { data: articles } = trpc.articles.getBibliotheque.useQuery();
  const { data: artisan } = trpc.artisan.getProfile.useQuery();

  const updateMutation = trpc.devis.update.useMutation({
    onSuccess: () => {
      utils.devis.getById.invalidate({ id: parseInt(id || "0") });
      toast.success("Devis mis à jour");
    },
  });

  const addLineMutation = trpc.devis.addLigne.useMutation({
    onSuccess: () => {
      utils.devis.getById.invalidate({ id: parseInt(id || "0") });
      setIsAddLineDialogOpen(false);
      resetLineForm();
      toast.success("Ligne ajoutée");
    },
  });

  const deleteLineMutation = trpc.devis.deleteLigne.useMutation({
    onSuccess: () => {
      utils.devis.getById.invalidate({ id: parseInt(id || "0") });
      toast.success("Ligne supprimée");
    },
  });

  const convertToFactureMutation = trpc.devis.convertToFacture.useMutation({
    onSuccess: (data) => {
      toast.success("Facture créée avec succès");
      setLocation(`/factures/${data.id}`);
    },
    onError: () => {
      toast.error("Erreur lors de la création de la facture");
    },
  });

  const resetLineForm = () => {
    setLineFormData({
      reference: "",
      designation: "",
      description: "",
      quantite: "1",
      unite: "unité",
      prixUnitaireHT: "",
      tauxTVA: "20.00",
    });
  };

  const handleAddLine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lineFormData.designation || !lineFormData.prixUnitaireHT) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }
    addLineMutation.mutate({
      devisId: parseInt(id || "0"),
      ...lineFormData,
    });
  };

  const handleDeleteLine = (lineId: number) => {
    if (confirm("Supprimer cette ligne ?")) {
      deleteLineMutation.mutate({ id: lineId, devisId: parseInt(id || "0") });
    }
  };

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate({ id: parseInt(id || "0"), statut: newStatus as any });
  };

  const handleConvertToFacture = () => {
    if (confirm("Convertir ce devis en facture ?")) {
      convertToFactureMutation.mutate({ devisId: parseInt(id || "0") });
    }
  };

  const handleExportPDF = () => {
    if (!devis || !devis.client) {
      toast.error("Impossible de générer le PDF");
      return;
    }
    const artisanData = artisan || {};
    const lignes = (devis.lignes || []).map((l: any) => ({
      designation: l.designation,
      description: l.description,
      quantite: parseFloat(l.quantite) || 1,
      unite: l.unite,
      prixUnitaire: parseFloat(l.prixUnitaireHT) || 0,
      tauxTva: parseFloat(l.tauxTVA) || 20,
    }));
    generateDevisPDF(
      artisanData,
      devis.client,
      {
        numero: devis.numero,
        dateCreation: devis.createdAt,
        dateValidite: devis.dateValidite,
        statut: devis.statut || "brouillon",
        objet: devis.objet,
        lignes,
        totalHT: parseFloat(devis.totalHT as any) || 0,
        totalTVA: parseFloat(devis.totalTVA as any) || 0,
        totalTTC: parseFloat(devis.totalTTC as any) || 0,
        conditions: (devis as any).conditions || null,
      }
    );
    toast.success("PDF généré avec succès");
  };

  const handleSelectArticle = (articleId: string) => {
    const article = articles?.find((a: any) => a.id === parseInt(articleId));
    if (article) {
      setLineFormData({
        ...lineFormData,
        reference: article.reference || "",
        designation: article.designation,
        description: article.description || "",
        unite: article.unite || "unité",
        prixUnitaireHT: String(article.prixUnitaireHT),
      });
    }
  };

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!devis) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-foreground">Devis non trouvé</h2>
        <Button variant="link" onClick={() => setLocation("/devis")}>
          Retour à la liste
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/devis")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{devis.numero}</h1>
              <Badge className={statusColors[devis.statut || 'brouillon'] || "bg-gray-100"}>
                {statusLabels[devis.statut || 'brouillon'] || devis.statut}
              </Badge>
            </div>
            <p className="text-muted-foreground">{devis.objet || "Devis"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={devis.statut || 'brouillon'} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="brouillon">Brouillon</SelectItem>
              <SelectItem value="envoye">Envoyé</SelectItem>
              <SelectItem value="accepte">Accepté</SelectItem>
              <SelectItem value="refuse">Refusé</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          {devis.statut === "accepte" && (
            <Button onClick={handleConvertToFacture} disabled={convertToFactureMutation.isPending}>
              <Receipt className="h-4 w-4 mr-2" />
              Convertir en facture
            </Button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4" />
              Client
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{devis.client?.nom} {devis.client?.prenom}</p>
            {devis.client?.email && <p className="text-sm text-muted-foreground">{devis.client.email}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{format(new Date(devis.createdAt), "dd MMMM yyyy", { locale: fr })}</p>
            {devis.dateValidite && (
              <p className="text-sm text-muted-foreground">
                Valide jusqu'au {format(new Date(devis.dateValidite), "dd/MM/yyyy", { locale: fr })}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total TTC</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{formatCurrency(devis.totalTTC)}</p>
            <p className="text-sm text-muted-foreground">HT: {formatCurrency(devis.totalHT)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Lines */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lignes du devis</CardTitle>
            <Dialog open={isAddLineDialogOpen} onOpenChange={setIsAddLineDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={resetLineForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter une ligne
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Ajouter une ligne</DialogTitle>
                  <DialogDescription>
                    Sélectionnez un article ou saisissez manuellement
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddLine}>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Article de la bibliothèque</Label>
                      <Select onValueChange={handleSelectArticle}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un article..." />
                        </SelectTrigger>
                        <SelectContent>
                          {articles?.slice(0, 50).map((article: any) => (
                            <SelectItem key={article.id} value={String(article.id)}>
                              {article.designation} - {formatCurrency(article.prixUnitaireHT)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="reference">Référence</Label>
                        <Input
                          id="reference"
                          value={lineFormData.reference}
                          onChange={(e) => setLineFormData({ ...lineFormData, reference: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="designation">Désignation *</Label>
                        <Input
                          id="designation"
                          value={lineFormData.designation}
                          onChange={(e) => setLineFormData({ ...lineFormData, designation: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="quantite">Quantité</Label>
                        <Input
                          id="quantite"
                          type="number"
                          step="0.01"
                          value={lineFormData.quantite}
                          onChange={(e) => setLineFormData({ ...lineFormData, quantite: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unite">Unité</Label>
                        <Input
                          id="unite"
                          value={lineFormData.unite}
                          onChange={(e) => setLineFormData({ ...lineFormData, unite: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="prixUnitaireHT">Prix HT *</Label>
                        <Input
                          id="prixUnitaireHT"
                          type="number"
                          step="0.01"
                          value={lineFormData.prixUnitaireHT}
                          onChange={(e) => setLineFormData({ ...lineFormData, prixUnitaireHT: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tauxTVA">TVA %</Label>
                        <Input
                          id="tauxTVA"
                          type="number"
                          step="0.01"
                          value={lineFormData.tauxTVA}
                          onChange={(e) => setLineFormData({ ...lineFormData, tauxTVA: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsAddLineDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit" disabled={addLineMutation.isPending}>
                      {addLineMutation.isPending ? "Ajout..." : "Ajouter"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {devis.lignes && devis.lignes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Désignation</th>
                    <th className="text-right">Qté</th>
                    <th className="text-right">Prix HT</th>
                    <th className="text-right">TVA</th>
                    <th className="text-right">Total TTC</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {devis.lignes.map((ligne: any) => (
                    <tr key={ligne.id}>
                      <td>{ligne.reference || "-"}</td>
                      <td>{ligne.designation}</td>
                      <td className="text-right">{ligne.quantite} {ligne.unite}</td>
                      <td className="text-right">{formatCurrency(ligne.prixUnitaireHT)}</td>
                      <td className="text-right">{ligne.tauxTVA}%</td>
                      <td className="text-right font-medium">{formatCurrency(ligne.montantTTC)}</td>
                      <td>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDeleteLine(ligne.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2">
                    <td colSpan={5} className="text-right font-medium">Total HT</td>
                    <td className="text-right font-medium">{formatCurrency(devis.totalHT)}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="text-right font-medium">TVA</td>
                    <td className="text-right font-medium">{formatCurrency(devis.totalTVA)}</td>
                    <td></td>
                  </tr>
                  <tr className="bg-muted/50">
                    <td colSpan={5} className="text-right font-bold">Total TTC</td>
                    <td className="text-right font-bold text-primary">{formatCurrency(devis.totalTTC)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Aucune ligne dans ce devis</p>
              <Button variant="link" onClick={() => setIsAddLineDialogOpen(true)}>
                Ajouter une ligne
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
