import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Package, Filter, Plus, Pencil, Trash2, Upload, Download, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const categorieLabels: Record<string, string> = {
  prestation: "Prestation",
  fourniture: "Fourniture",
};

const categorieColors: Record<string, string> = {
  prestation: "bg-purple-100 text-purple-700",
  fourniture: "bg-blue-100 text-blue-700",
};

const metierLabels: Record<string, string> = {
  plombier: "Plombier",
  electricien: "Électricien",
  chauffagiste: "Chauffagiste",
  carreleur: "Carreleur",
  peintre: "Peintre",
};

const metierColors: Record<string, string> = {
  plombier: "bg-blue-100 text-blue-700",
  electricien: "bg-yellow-100 text-yellow-700",
  chauffagiste: "bg-orange-100 text-orange-700",
  carreleur: "bg-cyan-100 text-cyan-700",
  peintre: "bg-green-100 text-green-700",
};

const sousCategorieLabels: Record<string, string> = {
  cables_conduits: "Câbles & Conduits",
  carrelage_exterieur: "Carrelage extérieur",
  carrelage_interieur: "Carrelage intérieur",
  chaudieres: "Chaudières",
  disjoncteurs_protection: "Disjoncteurs & Protection",
  eclairage: "Éclairage",
  fournitures_electricien_diverses: "Fournitures électricien",
  fournitures_robinetterie: "Robinetterie",
  joints_colles: "Joints & Colles",
  outillage_electricien: "Outillage électricien",
  outils_accessoires: "Outils & Accessoires",
  outils_carreleur: "Outils carreleur",
  peintures_exterieures: "Peintures extérieures",
  peintures_interieures: "Peintures intérieures",
  prestations_depannage: "Dépannage",
  prestations_installation: "Installation",
  prises_interrupteurs: "Prises & Interrupteurs",
  radiateurs: "Radiateurs",
  radiateurs_chauffage: "Radiateurs chauffage",
  tableaux_coffrets: "Tableaux & Coffrets",
  tuyauterie_raccords: "Tuyauterie & Raccords",
};

interface ArticleForm {
  nom: string;
  description: string;
  unite: string;
  prix_base: string;
  categorie: string;
  sous_categorie: string;
  metier: string;
}

const defaultForm: ArticleForm = {
  nom: "",
  description: "",
  unite: "unité",
  prix_base: "",
  categorie: "fourniture",
  sous_categorie: "",
  metier: "plombier",
};

export default function Articles() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [metierFilter, setMetierFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<any>(null);
  const [articleToDelete, setArticleToDelete] = useState<any>(null);
  const [form, setForm] = useState<ArticleForm>(defaultForm);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: articles, isLoading, refetch } = trpc.articles.getBibliotheque.useQuery({});

  const createMutation = trpc.articles.createBibliothequeArticle.useMutation({
    onSuccess: () => {
      toast.success("Article créé avec succès");
      refetch();
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.articles.updateBibliothequeArticle.useMutation({
    onSuccess: () => {
      toast.success("Article modifié avec succès");
      refetch();
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.articles.deleteBibliothequeArticle.useMutation({
    onSuccess: () => {
      toast.success("Article supprimé avec succès");
      refetch();
      setIsDeleteDialogOpen(false);
      setArticleToDelete(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const importMutation = trpc.articles.importBibliothequeArticles.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.imported} articles importés`);
      refetch();
      setIsImportDialogOpen(false);
      setImportPreview([]);
    },
    onError: (error) => toast.error(error.message),
  });

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  const openCreateDialog = () => {
    setEditingArticle(null);
    setForm(defaultForm);
    setIsDialogOpen(true);
  };

  const openEditDialog = (article: any) => {
    setEditingArticle(article);
    setForm({
      nom: article.nom || "",
      description: article.description || "",
      unite: article.unite || "unité",
      prix_base: article.prix_base?.toString() || "",
      categorie: article.categorie || "fourniture",
      sous_categorie: article.sous_categorie || "",
      metier: article.metier || "plombier",
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingArticle(null);
    setForm(defaultForm);
  };

  const handleSubmit = () => {
    if (!form.nom || !form.prix_base) {
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
    const headers = ["Nom", "Description", "Unité", "Prix HT", "Catégorie", "Sous-catégorie", "Métier"];
    const rows = filteredArticles.map((a: any) => [
      a.nom || "", a.description || "", a.unite || "",
      a.prix_base || "", a.categorie || "", a.sous_categorie || "", a.metier || "",
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
      if (lines.length < 2) { toast.error("Le fichier CSV ne contient pas de données"); return; }
      const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());
      const parsed = lines.slice(1).map(line => {
        const values = line.match(/("([^"]|"")*"|[^,]*)/g)?.map(v => v.replace(/^"|"$/g, "").replace(/""/g, '"').trim()) || [];
        const nomIdx = headers.findIndex(h => h.includes("nom") || h.includes("design"));
        const descIdx = headers.findIndex(h => h.includes("desc"));
        const uniteIdx = headers.findIndex(h => h.includes("unit"));
        const prixIdx = headers.findIndex(h => h.includes("prix") || h.includes("ht"));
        const catIdx = headers.findIndex(h => h.includes("cat"));
        const sousIdx = headers.findIndex(h => h.includes("sous"));
        const metierIdx = headers.findIndex(h => h.includes("met"));
        return {
          nom: values[nomIdx] || values[0] || "",
          description: values[descIdx] || "",
          unite: values[uniteIdx] || "unité",
          prix_base: values[prixIdx]?.replace(",", ".") || "0",
          categorie: values[catIdx] || "fourniture",
          sous_categorie: values[sousIdx] || "",
          metier: values[metierIdx] || "plombier",
        };
      }).filter(a => a.nom);
      setImportPreview(parsed);
      setIsImportDialogOpen(true);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = () => {
    if (importPreview.length === 0) return;
    importMutation.mutate(importPreview);
  };

  const filteredArticles = articles?.filter((article: any) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchLower ||
      article.nom?.toLowerCase().includes(searchLower) ||
      article.description?.toLowerCase().includes(searchLower) ||
      article.sous_categorie?.toLowerCase().includes(searchLower);
    const matchesCategory = categoryFilter === "all" || article.categorie === categoryFilter;
    const matchesMetier = metierFilter === "all" || article.metier === metierFilter;
    return matchesSearch && matchesCategory && matchesMetier;
  });

  const categories = articles
    ? Array.from(new Set(articles.map((a: any) => a.categorie).filter(Boolean)))
    : [];
  const metiers = articles
    ? Array.from(new Set(articles.map((a: any) => a.metier).filter(Boolean)))
    : [];

  // Sous-catégories filtrées par métier sélectionné
  const sousCategories = articles
    ? Array.from(new Set(
        articles
          .filter((a: any) => metierFilter === "all" || a.metier === metierFilter)
          .map((a: any) => a.sous_categorie)
          .filter(Boolean)
      ))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Biblioth&egrave;que d'articles</h1>
          <p className="text-muted-foreground mt-1">
            {filteredArticles?.length || 0} / {articles?.length || 0} articles
          </p>
        </div>
        <div className="flex gap-2">
          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />Importer CSV
          </Button>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />Exporter CSV
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />Nouvel article
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={metierFilter} onValueChange={setMetierFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Métier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les métiers</SelectItem>
            {metiers.map((m: any) => (
              <SelectItem key={m} value={m}>{metierLabels[m] || m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {categories.map((cat: any) => (
              <SelectItem key={cat} value={cat}>{categorieLabels[cat] || cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Articles Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredArticles && filteredArticles.length > 0 ? (
        <div className="bg-card rounded-lg border border-border overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th className="whitespace-nowrap">Métier</th>
                <th className="whitespace-nowrap">Catégorie</th>
                <th className="whitespace-nowrap">Sous-catégorie</th>
                <th className="whitespace-nowrap">Unité</th>
                <th className="whitespace-nowrap text-right">Prix HT</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredArticles.map((article: any) => (
                <tr key={article.id}>
                  <td>
                    <p className="font-medium">{article.nom}</p>
                    {article.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-xs">{article.description}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <Badge className={metierColors[article.metier] ?? "bg-gray-100 text-gray-700"}>
                      {metierLabels[article.metier] ?? article.metier}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap">
                    <Badge className={categorieColors[article.categorie] ?? "bg-gray-100 text-gray-700"}>
                      {categorieLabels[article.categorie] ?? article.categorie}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    {sousCategorieLabels[article.sous_categorie] ?? article.sous_categorie}
                  </td>
                  <td className="whitespace-nowrap">{article.unite}</td>
                  <td className="text-right font-medium whitespace-nowrap">{formatCurrency(article.prix_base)}</td>
                  <td className="whitespace-nowrap">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(article)}>
                          <Pencil className="h-4 w-4 mr-2" />Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(article)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />Supprimer
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
              {searchQuery || categoryFilter !== "all" || metierFilter !== "all" ? "Aucun article trouvé" : "Aucun article"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || categoryFilter !== "all" || metierFilter !== "all"
                ? "Essayez avec d'autres critères de recherche"
                : "La bibliothèque d'articles est vide"}
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />Créer un article
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
            <div>
              <Label>Nom *</Label>
              <Input
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
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
                  value={form.prix_base}
                  onChange={(e) => setForm({ ...form, prix_base: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Unité</Label>
                <Select value={form.unite} onValueChange={(v) => setForm({ ...form, unite: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <SelectItem value="rouleau">Rouleau</SelectItem>
                    <SelectItem value="pot">Pot</SelectItem>
                    <SelectItem value="sac">Sac</SelectItem>
                    <SelectItem value="boîte">Boîte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Métier</Label>
                <Select value={form.metier} onValueChange={(v) => setForm({ ...form, metier: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(metierLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Catégorie</Label>
                <Select value={form.categorie} onValueChange={(v) => setForm({ ...form, categorie: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(categorieLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sous-catégorie</Label>
                <Select value={form.sous_categorie} onValueChange={(v) => setForm({ ...form, sous_categorie: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(sousCategorieLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
          <p>Êtes-vous sûr de vouloir supprimer l'article "{articleToDelete?.nom}" ?</p>
          <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>Supprimer</Button>
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
                  <th className="text-left p-2">Nom</th>
                  <th className="text-left p-2">Métier</th>
                  <th className="text-right p-2">Prix HT</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.slice(0, 20).map((article, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-2">{article.nom}</td>
                    <td className="p-2">{metierLabels[article.metier] || article.metier}</td>
                    <td className="p-2 text-right">{formatCurrency(article.prix_base)}</td>
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
            <Button variant="outline" onClick={() => { setIsImportDialogOpen(false); setImportPreview([]); }}>Annuler</Button>
            <Button onClick={handleImport} disabled={importMutation.isPending}>
              Importer {importPreview.length} articles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
