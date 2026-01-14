import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Package } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState, useEffect } from "react";

const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "0,00 €";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(num);
};

export default function DevisLigneEdit() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  
  const [formData, setFormData] = useState({
    reference: "",
    designation: "",
    description: "",
    quantite: "1",
    unite: "unité",
    prixUnitaireHT: "",
    tauxTVA: "20.00",
  });

  const { data: devis, isLoading: devisLoading } = trpc.devis.getById.useQuery(
    { id: parseInt(id || "0") },
    { enabled: !!id }
  );

  const { data: articles } = trpc.articles.getBibliotheque.useQuery({});

  const addLineMutation = trpc.devis.addLigne.useMutation({
    onSuccess: () => {
      utils.devis.getById.invalidate({ id: parseInt(id || "0") });
      toast.success("Ligne ajoutée avec succès");
      setLocation(`/devis/${id}`);
    },
    onError: (error) => {
      toast.error("Erreur lors de l'ajout: " + error.message);
    },
  });

  const handleSelectArticle = (articleId: string) => {
    const article = articles?.find((a: any) => a.id === parseInt(articleId));
    if (article) {
      setFormData({
        reference: article.reference || "",
        designation: article.designation || "",
        description: article.description || "",
        quantite: "1",
        unite: article.unite || "unité",
        prixUnitaireHT: String(article.prixUnitaireHT || ""),
        tauxTVA: "20.00",
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.designation || !formData.prixUnitaireHT) {
      toast.error("Veuillez remplir la désignation et le prix");
      return;
    }

    addLineMutation.mutate({
      devisId: parseInt(id || "0"),
      reference: formData.reference,
      designation: formData.designation,
      description: formData.description,
      quantite: String(parseFloat(formData.quantite) || 1),
      unite: formData.unite,
      prixUnitaireHT: String(parseFloat(formData.prixUnitaireHT) || 0),
      tauxTVA: String(parseFloat(formData.tauxTVA) || 20),
    });
  };

  const quantite = parseFloat(formData.quantite) || 0;
  const prixHT = parseFloat(formData.prixUnitaireHT) || 0;
  const tauxTVA = parseFloat(formData.tauxTVA) || 0;
  const totalHT = quantite * prixHT;
  const totalTVA = totalHT * (tauxTVA / 100);
  const totalTTC = totalHT + totalTVA;

  if (devisLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!devis) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Devis non trouvé</p>
        <Button variant="link" onClick={() => setLocation("/devis")}>
          Retour aux devis
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/devis/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Ajouter une ligne</h1>
          <p className="text-muted-foreground">
            Devis {devis.numero} - {devis.objet}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Sélectionner un article
            </CardTitle>
            <CardDescription>
              Choisissez un article de votre bibliothèque ou saisissez manuellement
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select onValueChange={handleSelectArticle}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un article de la bibliothèque..." />
              </SelectTrigger>
              <SelectContent>
                {articles?.slice(0, 100).map((article: any) => (
                  <SelectItem key={article.id} value={String(article.id)}>
                    <span className="font-medium">{article.reference}</span> - {article.designation} - {formatCurrency(article.prixUnitaireHT)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Détails de la ligne</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reference">Référence</Label>
                <Input
                  id="reference"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  placeholder="REF-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="designation">Désignation *</Label>
                <Input
                  id="designation"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  placeholder="Nom de l'article ou du service"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description détaillée (optionnel)"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantite">Quantité</Label>
                <Input
                  id="quantite"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.quantite}
                  onChange={(e) => setFormData({ ...formData, quantite: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unite">Unité</Label>
                <Select
                  value={formData.unite}
                  onValueChange={(value) => setFormData({ ...formData, unite: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unité">Unité</SelectItem>
                    <SelectItem value="heure">Heure</SelectItem>
                    <SelectItem value="jour">Jour</SelectItem>
                    <SelectItem value="m²">m²</SelectItem>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="forfait">Forfait</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prixUnitaireHT">Prix unitaire HT *</Label>
                <Input
                  id="prixUnitaireHT"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.prixUnitaireHT}
                  onChange={(e) => setFormData({ ...formData, prixUnitaireHT: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tauxTVA">Taux TVA (%)</Label>
                <Select
                  value={formData.tauxTVA}
                  onValueChange={(value) => setFormData({ ...formData, tauxTVA: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0%</SelectItem>
                    <SelectItem value="5.5">5.5%</SelectItem>
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="20">20%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Récapitulatif</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Total HT</p>
                <p className="text-xl font-bold">{formatCurrency(totalHT)}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">TVA ({tauxTVA}%)</p>
                <p className="text-xl font-bold">{formatCurrency(totalTVA)}</p>
              </div>
              <div className="p-4 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground">Total TTC</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(totalTTC)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation(`/devis/${id}`)}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={addLineMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {addLineMutation.isPending ? "Ajout en cours..." : "Ajouter la ligne"}
          </Button>
        </div>
      </form>
    </div>
  );
}
