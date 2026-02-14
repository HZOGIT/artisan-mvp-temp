import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Package, Filter, Plus, Pencil, Trash2, Upload, Download, AlertTriangle, CheckCircle, XCircle, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const categorieLabels: Record<string, string> = {
  plomberie: "Plomberie",
  electricite: "Électricité",
  chauffage: "Chauffage",
  sanitaire: "Sanitaire",
  autre: "Autre",
};

const categorieColors: Record<string, string> = {
  plomberie: "bg-blue-100 text-blue-700",
  electricite: "bg-yellow-100 text-yellow-700",
  chauffage: "bg-orange-100 text-orange-700",
  sanitaire: "bg-cyan-100 text-cyan-700",
  autre: "bg-gray-100 text-gray-700",
};

interface ArticleForm {
  reference: string;
  designation: string;
  description: string;
  unite: string;
  prixUnitaireHT: string;
  categorie: string;
  metier: "plomberie" | "electricite" | "chauffage" | "general";
}

const defaultForm: ArticleForm = {
  reference: "",
  designation: "",
  description: "",
  unite: "unité",
  prixUnitaireHT: "",
  categorie: "",
  metier: "general",
};

export default function Articles() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<any>(null);
  const [articleToDelete, setArticleToDelete] = useState<any>(null);
  const [form, setForm] = useState<ArticleForm>(defaultForm);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  

  const { data: articles, isLoading, refetch } = trpc.articles.getBibliotheque.useQuery({});
  const { data: stocks } = trpc.stocks.list.useQuery();
  
  const createMutation = trpc.articles.createBibliothequeArticle.useMutation({
    onSuccess: () => {
      toast.success("Article créé avec succès");
      refetch();
      closeDialog();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.articles.updateBibliothequeArticle.useMutation({
    onSuccess: () => {
      toast.success("Article modifié avec succès");
      refetch();
      closeDialog();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.articles.deleteBibliothequeArticle.useMutation({
    onSuccess: () => {
      toast.success("Article supprimé avec succès");
      refetch();
      setIsDeleteDialogOpen(false);
      setArticleToDelete(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const importMutation = trpc.articles.importBibliothequeArticles.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.imported} articles importés`);
      refetch();
      setIsImportDialogOpen(false);
      setImportPreview([]);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  const getStockForArticle = (articleId: number) => {
    if (!stocks) return null;
    return stocks.find((s: any) => s.articleId === articleId);
  };

  const getStockIndicator = (articleId: number) => {
    const stock = getStockForArticle(articleId);
    if (!stock) return null;
    
    const qty = parseFloat(stock.quantiteEnStock || '0');
    const min = parseFloat(stock.seuilAlerte || '0');
    
    if (qty <= 0) {
      return <Badge className="bg-red-100 text-red-700 flex items-center gap-1"><XCircle className="h-3 w-3" /> Rupture</Badge>;
    } else if (qty <= min) {
      return <Badge className="bg-orange-100 text-orange-700 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Stock bas ({qty})</Badge>;
    } else {
      return <Badge className="bg-green-100 text-green-700 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> En stock ({qty})</Badge>;
    }
  };

  const openCreateDialog = () => {
    setEditingArticle(null);
    setForm(defaultForm);
    setIsDialogOpen(true);
  };

  const openEditDialog = (article: any) => {
    setEditingArticle(article);
    setForm({
      reference: article.reference || "",
      designation: article.designation || "",
      description: article.description || "",
      unite: article.unite || "unité",
      prixUnitaireHT: article.prixUnitaireHT?.toString() || "",
      categorie: article.categorie || "",
      metier: article.metier || "general",
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingArticle(null);
    setForm(defaultForm);
  };

  const handleSubmit = () => {
    if (!form.reference || !form.designation || !form.prixUnitaireHT) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }

    if (editingArticle) {
      updateMutation.mutate({ id: editingArticle.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleDelete = (article: any) => {
    setArticleToDelete(article);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (articleToDelete) {
      deleteMutation.mutate({ id: articleToDelete.id });
    }
  };

  const handleExportCSV = () => {
    if (!filteredArticles || filteredArticles.length === 0) {
      toast.error("Aucun article à exporter");
      return;
    }

    const headers = ["Référence", "Désignation", "Description", "Unité", "Prix HT", "Catégorie", "Métier"];
    const rows = filteredArticles.map((a: any) => [
      a.reference || "",
      a.designation || "",
      a.description || "",
      a.unite || "",
      a.prixUnitaireHT || "",
      a.categorie || "",
      a.metier || "",
    ]);

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `articles_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success(`${filteredArticles.length} articles exportés`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").filter(line => line.trim());
      
      if (lines.length < 2) {
        toast.error("Le fichier CSV ne contient pas de données");
        return;
      }

      const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());
      const articles = lines.slice(1).map(line => {
        const values = line.match(/("([^"]|"")*"|[^,]*)/g)?.map(v => v.replace(/^"|"$/g, "").replace(/""/g, '"').trim()) || [];
        
        const refIdx = headers.findIndex(h => h.includes("ref"));
        const desIdx = headers.findIndex(h => h.includes("design") || h.includes("nom"));
        const descIdx = headers.findIndex(h => h.includes("desc"));
        const uniteIdx = headers.findIndex(h => h.includes("unit"));
        const prixIdx = headers.findIndex(h => h.includes("prix") || h.includes("ht"));
        const catIdx = headers.findIndex(h => h.includes("cat"));
        const metierIdx = headers.findIndex(h => h.includes("met"));

        return {
          reference: values[refIdx] || `ART-${Date.now()}`,
          designation: values[desIdx] || values[0] || "",
          description: values[descIdx] || "",
          unite: values[uniteIdx] || "unité",
          prixUnitaireHT: values[prixIdx]?.replace(",", ".") || "0",
          categorie: values[catIdx] || "",
          metier: (values[metierIdx] as any) || "general",
        };
      }).filter(a => a.designation);

      setImportPreview(articles);
      setIsImportDialogOpen(true);
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = () => {
    if (importPreview.length === 0) return;
    importMutation.mutate(importPreview);
  };

  const filteredArticles = articles?.filter((article: any) => {
    const matchesSearch = 
      article.designation?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.reference?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || article.categorie === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const categories = articles 
    ? Array.from(new Set(articles.map((a: any) => a.categorie).filter(Boolean)))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Bibliothèque d'articles</h1>
          <p className="text-muted-foreground mt-1">
            {articles?.length || 0} articles disponibles
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Importer CSV
          </Button>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exporter CSV
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Nouvel article
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un article..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {categories.map((cat: any) => (
              <SelectItem key={cat} value={cat}>
                {categorieLabels[cat] || cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Articles List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredArticles && filteredArticles.length > 0 ? (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-[100px]">Référence</th>
                <th>Désignation</th>
                <th className="w-[100px] hidden lg:table-cell">Catégorie</th>
                <th className="w-[70px] hidden lg:table-cell">Stock</th>
                <th className="w-[70px]">Unité</th>
                <th className="w-[90px] text-right">Prix HT</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredArticles.map((article: any) => (
                <tr key={article.id}>
                  <td className="font-mono text-sm">{article.reference ?? "-"}</td>
                  <td>
                    <div>
                      <p className="font-medium">{article.designation ?? "Sans nom"}</p>
                      {article.description ? (
                        <p className="text-sm text-muted-foreground line-clamp-1">{article.description}</p>
                      ) : null}
                    </div>
                  </td>
                  <td className="hidden lg:table-cell">
                    <Badge className={categorieColors[article.categorie ?? 'autre'] ?? "bg-gray-100"}>
                      {categorieLabels[article.categorie ?? 'autre'] ?? article.categorie ?? "Autre"}
                    </Badge>
                  </td>
                  <td className="hidden lg:table-cell">{getStockIndicator(article.id) || <span className="text-muted-foreground text-sm">Non suivi</span>}</td>
                  <td>{article.unite ?? "unité"}</td>
                  <td className="text-right font-medium">{formatCurrency(article.prixUnitaireHT)}</td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(article)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(article)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {searchQuery || categoryFilter !== "all" ? "Aucun article trouvé" : "Aucun article"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || categoryFilter !== "all"
                ? "Essayez avec d'autres critères de recherche"
                : "La bibliothèque d'articles est vide"}
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Créer un article
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingArticle ? "Modifier l'article" : "Nouvel article"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Référence *</Label>
                <Input
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  placeholder="REF-001"
                />
              </div>
              <div>
                <Label>Unité</Label>
                <Select value={form.unite} onValueChange={(v) => setForm({ ...form, unite: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unité">Unité</SelectItem>
                    <SelectItem value="m">Mètre</SelectItem>
                    <SelectItem value="m²">Mètre carré</SelectItem>
                    <SelectItem value="ml">Mètre linéaire</SelectItem>
                    <SelectItem value="kg">Kilogramme</SelectItem>
                    <SelectItem value="l">Litre</SelectItem>
                    <SelectItem value="h">Heure</SelectItem>
                    <SelectItem value="lot">Lot</SelectItem>
                    <SelectItem value="forfait">Forfait</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Désignation *</Label>
              <Input
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                placeholder="Nom de l'article"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description détaillée..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Prix HT *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.prixUnitaireHT}
                  onChange={(e) => setForm({ ...form, prixUnitaireHT: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Catégorie</Label>
                <Select value={form.categorie} onValueChange={(v) => setForm({ ...form, categorie: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plomberie">Plomberie</SelectItem>
                    <SelectItem value="electricite">Électricité</SelectItem>
                    <SelectItem value="chauffage">Chauffage</SelectItem>
                    <SelectItem value="sanitaire">Sanitaire</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Métier</Label>
              <Select value={form.metier} onValueChange={(v: any) => setForm({ ...form, metier: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Général</SelectItem>
                  <SelectItem value="plomberie">Plomberie</SelectItem>
                  <SelectItem value="electricite">Électricité</SelectItem>
                  <SelectItem value="chauffage">Chauffage</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingArticle ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p>Êtes-vous sûr de vouloir supprimer l'article "{articleToDelete?.designation}" ?</p>
          <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Preview Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prévisualisation de l'import</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-auto">
            <p className="mb-4">{importPreview.length} articles à importer :</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Référence</th>
                  <th className="text-left p-2">Désignation</th>
                  <th className="text-right p-2">Prix HT</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.slice(0, 20).map((article, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-2 font-mono">{article.reference}</td>
                    <td className="p-2">{article.designation}</td>
                    <td className="p-2 text-right">{formatCurrency(article.prixUnitaireHT)}</td>
                  </tr>
                ))}
                {importPreview.length > 20 && (
                  <tr>
                    <td colSpan={3} className="p-2 text-center text-muted-foreground">
                      ... et {importPreview.length - 20} autres articles
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsImportDialogOpen(false); setImportPreview([]); }}>
              Annuler
            </Button>
            <Button onClick={handleImport} disabled={importMutation.isPending}>
              Importer {importPreview.length} articles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
