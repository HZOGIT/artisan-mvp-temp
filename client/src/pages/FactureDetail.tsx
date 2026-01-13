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
import { ArrowLeft, Plus, Trash2, Receipt, User, CheckCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateFacturePDF } from "@/lib/pdfGenerator";
import { fr } from "date-fns/locale";

const statusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

const statusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  envoyee: "bg-blue-100 text-blue-700",
  payee: "bg-green-100 text-green-700",
  en_retard: "bg-orange-100 text-orange-700",
  annulee: "bg-red-100 text-red-700",
};

export default function FactureDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [isAddLineDialogOpen, setIsAddLineDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentData, setPaymentData] = useState({
    montantPaye: "",
    datePaiement: format(new Date(), "yyyy-MM-dd"),
  });
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
  const { data: facture, isLoading } = trpc.factures.getById.useQuery(
    { id: parseInt(id || "0") },
    { enabled: !!id }
  );
  const { data: articles } = trpc.articles.getBibliotheque.useQuery();
  const { data: artisan } = trpc.artisan.getProfile.useQuery();

  const updateMutation = trpc.factures.update.useMutation({
    onSuccess: () => {
      utils.factures.getById.invalidate({ id: parseInt(id || "0") });
      toast.success("Facture mise à jour");
    },
  });

  const addLineMutation = trpc.factures.addLigne.useMutation({
    onSuccess: () => {
      utils.factures.getById.invalidate({ id: parseInt(id || "0") });
      setIsAddLineDialogOpen(false);
      resetLineForm();
      toast.success("Ligne ajoutée");
    },
  });

  const markAsPaidMutation = trpc.factures.markAsPaid.useMutation({
    onSuccess: () => {
      utils.factures.getById.invalidate({ id: parseInt(id || "0") });
      setIsPaymentDialogOpen(false);
      toast.success("Paiement enregistré");
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
      factureId: parseInt(id || "0"),
      ...lineFormData,
    });
  };

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate({ id: parseInt(id || "0"), statut: newStatus as any });
  };

  const handleMarkAsPaid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentData.montantPaye) {
      toast.error("Veuillez saisir le montant payé");
      return;
    }
    markAsPaidMutation.mutate({
      id: parseInt(id || "0"),
      ...paymentData,
    });
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

  const handleExportPDF = () => {
    if (!facture || !facture.client) {
      toast.error("Impossible de générer le PDF");
      return;
    }
    const artisanData = artisan || {};
    const lignes = (facture.lignes || []).map((l: any) => ({
      designation: l.designation,
      description: l.description,
      quantite: parseFloat(l.quantite) || 1,
      unite: l.unite,
      prixUnitaire: parseFloat(l.prixUnitaireHT) || 0,
      tauxTva: parseFloat(l.tauxTVA) || 20,
    }));
    generateFacturePDF(
      artisanData,
      facture.client,
      {
        numero: facture.numero,
        dateCreation: facture.createdAt,
        dateEcheance: facture.dateEcheance,
        statut: facture.statut || "brouillon",
        objet: facture.objet,
        lignes,
        totalHT: parseFloat(facture.totalHT as any) || 0,
        totalTVA: parseFloat(facture.totalTVA as any) || 0,
        totalTTC: parseFloat(facture.totalTTC as any) || 0,
        montantPaye: parseFloat(facture.montantPaye as any) || 0,
        conditions: (facture as any).conditions || null,
      }
    );
    toast.success("PDF généré avec succès");
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

  if (!facture) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-foreground">Facture non trouvée</h2>
        <Button variant="link" onClick={() => setLocation("/factures")}>
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
          <Button variant="ghost" size="icon" onClick={() => setLocation("/factures")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{facture.numero}</h1>
              <Badge className={statusColors[facture.statut || 'brouillon'] || "bg-gray-100"}>
                {statusLabels[facture.statut || 'brouillon'] || facture.statut}
              </Badge>
            </div>
            <p className="text-muted-foreground">{facture.objet || "Facture"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Select value={facture.statut || 'brouillon'} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="brouillon">Brouillon</SelectItem>
              <SelectItem value="envoyee">Envoyée</SelectItem>
              <SelectItem value="payee">Payée</SelectItem>
              <SelectItem value="en_retard">En retard</SelectItem>
              <SelectItem value="annulee">Annulée</SelectItem>
            </SelectContent>
          </Select>
          {facture.statut !== "payee" && (
            <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setPaymentData({ ...paymentData, montantPaye: String(facture.totalTTC || 0) })}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Marquer comme payée
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Enregistrer le paiement</DialogTitle>
                  <DialogDescription>
                    Saisissez les informations du paiement
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleMarkAsPaid}>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="montantPaye">Montant payé</Label>
                      <Input
                        id="montantPaye"
                        type="number"
                        step="0.01"
                        value={paymentData.montantPaye}
                        onChange={(e) => setPaymentData({ ...paymentData, montantPaye: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="datePaiement">Date de paiement</Label>
                      <Input
                        id="datePaiement"
                        type="date"
                        value={paymentData.datePaiement}
                        onChange={(e) => setPaymentData({ ...paymentData, datePaiement: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit" disabled={markAsPaidMutation.isPending}>
                      {markAsPaidMutation.isPending ? "Enregistrement..." : "Enregistrer"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
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
            <p className="font-medium">{facture.client?.nom} {facture.client?.prenom}</p>
            {facture.client?.email && <p className="text-sm text-muted-foreground">{facture.client.email}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{format(new Date(facture.createdAt), "dd MMMM yyyy", { locale: fr })}</p>
            {facture.dateEcheance && (
              <p className="text-sm text-muted-foreground">
                Échéance: {format(new Date(facture.dateEcheance), "dd/MM/yyyy", { locale: fr })}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total TTC</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{formatCurrency(facture.totalTTC)}</p>
            <p className="text-sm text-muted-foreground">HT: {formatCurrency(facture.totalHT)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Lines */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lignes de la facture</CardTitle>
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
          {facture.lignes && facture.lignes.length > 0 ? (
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
                  </tr>
                </thead>
                <tbody>
                  {facture.lignes.map((ligne: any) => (
                    <tr key={ligne.id}>
                      <td>{ligne.reference || "-"}</td>
                      <td>{ligne.designation}</td>
                      <td className="text-right">{ligne.quantite} {ligne.unite}</td>
                      <td className="text-right">{formatCurrency(ligne.prixUnitaireHT)}</td>
                      <td className="text-right">{ligne.tauxTVA}%</td>
                      <td className="text-right font-medium">{formatCurrency(ligne.montantTTC)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2">
                    <td colSpan={5} className="text-right font-medium">Total HT</td>
                    <td className="text-right font-medium">{formatCurrency(facture.totalHT)}</td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="text-right font-medium">TVA</td>
                    <td className="text-right font-medium">{formatCurrency(facture.totalTVA)}</td>
                  </tr>
                  <tr className="bg-muted/50">
                    <td colSpan={5} className="text-right font-bold">Total TTC</td>
                    <td className="text-right font-bold text-primary">{formatCurrency(facture.totalTTC)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Aucune ligne dans cette facture</p>
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
