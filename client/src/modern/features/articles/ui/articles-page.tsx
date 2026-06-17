import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/modern/shared/trpc";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Card, CardContent } from "@/modern/shared/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/modern/shared/ui/dialog";
import { Label } from "@/modern/shared/ui/label";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Search, Package, Filter, Plus, Pencil, Trash2, Upload, Download, MoreHorizontal } from "lucide-react";
import { Badge } from "@/modern/shared/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/modern/shared/ui/dropdown-menu";
import { toast } from "sonner";
import { matchSearch } from "@/lib/normalize";

// Page Bibliothèque d'articles du FRONT NEUF (`/v2/articles`) — PORT CONFORME de `pages/Articles.tsx`.
// JSX/Tailwind à l'identique (table native `data-table` conservée) ; plomberie repointée : primitives
// `@/modern/shared/ui`, tRPC partagé, i18n (namespace `articles`). Les libellés métier/catégorie/
// sous-catégorie/unité/TVA passent par i18n ; les couleurs restent des classes Tailwind.

// Couleurs (classes Tailwind, pas des libellés).
const categorieColors: Record<string, string> = {
  prestation: "bg-purple-100 text-purple-700",
  fourniture: "bg-blue-100 text-blue-700",
};
const metierColors: Record<string, string> = {
  plombier: "bg-blue-100 text-blue-700",
  electricien: "bg-yellow-100 text-yellow-700",
  chauffagiste: "bg-orange-100 text-orange-700",
  carreleur: "bg-cyan-100 text-cyan-700",
  peintre: "bg-green-100 text-green-700",
};

// Clés (l'ordre = ordre d'affichage des options ; libellés via i18n).
const METIER_KEYS = ["plombier", "electricien", "chauffagiste", "carreleur", "peintre"];
const CATEGORIE_KEYS = ["prestation", "fourniture"];
const UNITE_KEYS: { value: string; key: string }[] = [
  { value: "unité", key: "unite_unite" },
  { value: "m", key: "unite_m" },
  { value: "m²", key: "unite_m2" },
  { value: "ml", key: "unite_ml" },
  { value: "kg", key: "unite_kg" },
  { value: "l", key: "unite_l" },
  { value: "h", key: "unite_h" },
  { value: "lot", key: "unite_lot" },
  { value: "forfait", key: "unite_forfait" },
  { value: "rouleau", key: "unite_rouleau" },
  { value: "pot", key: "unite_pot" },
  { value: "sac", key: "unite_sac" },
  { value: "boîte", key: "unite_boite" },
];
const TVA_KEYS: { value: string; key: string }[] = [
  { value: "20", key: "tva_20" },
  { value: "10", key: "tva_10" },
  { value: "5.5", key: "tva_5_5" },
  { value: "2.1", key: "tva_2_1" },
  { value: "0", key: "tva_0" },
];
const SOUS_CATEGORIE_KEYS = [
  "cables_conduits", "carrelage_exterieur", "carrelage_interieur", "chaudieres",
  "disjoncteurs_protection", "eclairage", "fournitures_electricien_diverses",
  "fournitures_robinetterie", "joints_colles", "outillage_electricien", "outils_accessoires",
  "outils_carreleur", "peintures_exterieures", "peintures_interieures", "prestations_depannage",
  "prestations_installation", "prises_interrupteurs", "radiateurs", "radiateurs_chauffage",
  "tableaux_coffrets", "tuyauterie_raccords",
];

interface ArticleForm {
  nom: string;
  description: string;
  unite: string;
  prix_base: string;
  prixRevient: string;
  tauxTVA: string;
  categorie: string;
  sous_categorie: string;
  metier: string;
}

const defaultForm: ArticleForm = {
  nom: "",
  description: "",
  unite: "unité",
  prix_base: "",
  prixRevient: "",
  tauxTVA: "20",
  categorie: "fourniture",
  sous_categorie: "",
  metier: "plombier",
};

export default function ArticlesPage() {
  const { t } = useTranslation("articles");
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
      toast.success(t("toastCreated"));
      refetch();
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.articles.updateBibliothequeArticle.useMutation({
    onSuccess: () => {
      toast.success(t("toastUpdated"));
      refetch();
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.articles.deleteBibliothequeArticle.useMutation({
    onSuccess: () => {
      toast.success(t("toastDeleted"));
      refetch();
      setIsDeleteDialogOpen(false);
      setArticleToDelete(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const importMutation = trpc.articles.importBibliothequeArticles.useMutation({
    onSuccess: (result) => {
      toast.success(t("toastImported", { n: result.imported }));
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
      prixRevient: article.prixRevient?.toString() || "",
      tauxTVA: article.tauxTVA?.toString() || "20",
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
      toast.error(t("toastRequiredFields"));
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
      toast.error(t("toastNothingToExport"));
      return;
    }
    const headers = [t("csvNom"), t("csvDescription"), t("csvUnite"), t("csvPrixHT"), t("csvCategorie"), t("csvSousCategorie"), t("csvMetier")];
    const rows = filteredArticles.map((a: any) => [
      a.nom || "", a.description || "", a.unite || "",
      a.prix_base || "", a.categorie || "", a.sous_categorie || "", a.metier || "",
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `articles_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t("toastExported", { n: filteredArticles.length }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").filter(line => line.trim());
      if (lines.length < 2) { toast.error(t("toastCsvNoData")); return; }
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
    const matchesSearch = !searchQuery ||
      matchSearch(article.nom, searchQuery) ||
      matchSearch(article.description, searchQuery) ||
      matchSearch(article.sous_categorie, searchQuery);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("libTitle")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("countLine", { filtered: filteredArticles?.length || 0, total: articles?.length || 0 })}
          </p>
        </div>
        <div className="flex gap-2">
          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />{t("importCsv")}
          </Button>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />{t("exportCsv")}
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />{t("newArticle")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={metierFilter} onValueChange={setMetierFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder={t("metierFilterPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allMetiers")}</SelectItem>
            {metiers.map((m: any) => (
              <SelectItem key={m} value={m}>{t(`metier_${m}`, { defaultValue: m })}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder={t("categoryFilterPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCategories")}</SelectItem>
            {categories.map((cat: any) => (
              <SelectItem key={cat} value={cat}>{t(`categorie_${cat}`, { defaultValue: cat })}</SelectItem>
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
                <th>{t("thNom")}</th>
                <th className="whitespace-nowrap">{t("thMetier")}</th>
                <th className="whitespace-nowrap">{t("thCategorie")}</th>
                <th className="whitespace-nowrap">{t("thSousCategorie")}</th>
                <th className="whitespace-nowrap">{t("thUnite")}</th>
                <th className="whitespace-nowrap text-right">{t("thPrixHT")}</th>
                <th className="whitespace-nowrap text-right">{t("thMarge")}</th>
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
                      {t(`metier_${article.metier}`, { defaultValue: article.metier })}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap">
                    <Badge className={categorieColors[article.categorie] ?? "bg-gray-100 text-gray-700"}>
                      {t(`categorie_${article.categorie}`, { defaultValue: article.categorie })}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    {t(`sous_${article.sous_categorie}`, { defaultValue: article.sous_categorie })}
                  </td>
                  <td className="whitespace-nowrap">{article.unite}</td>
                  <td className="text-right font-medium whitespace-nowrap">{formatCurrency(article.prix_base)}</td>
                  <td className="text-right whitespace-nowrap text-sm">
                    {(() => {
                      const pv = parseFloat(article.prix_base);
                      const pr = article.prixRevient != null ? parseFloat(article.prixRevient) : NaN;
                      if (!isNaN(pv) && !isNaN(pr) && pv > 0) {
                        const pct = Math.round(((pv - pr) / pv) * 100);
                        return <span className={pv - pr >= 0 ? "text-green-600" : "text-red-600"}>{pct}&nbsp;%</span>;
                      }
                      return <span className="text-muted-foreground">—</span>;
                    })()}
                  </td>
                  <td className="whitespace-nowrap">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(article)}>
                          <Pencil className="h-4 w-4 mr-2" />{t("editTitle")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(article)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />{t("delete")}
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
              {searchQuery || categoryFilter !== "all" || metierFilter !== "all" ? t("emptyFiltered") : t("emptyNone")}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || categoryFilter !== "all" || metierFilter !== "all"
                ? t("emptyFilteredHint")
                : t("emptyNoneHint")}
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />{t("createArticle")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingArticle ? t("editTitle") : t("newTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("nomLabel")}</Label>
              <Input
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                placeholder={t("nomPlaceholder")}
              />
            </div>
            <div>
              <Label>{t("descLabel")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t("descPlaceholder")}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("prixHTLabel")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.prix_base}
                  onChange={(e) => setForm({ ...form, prix_base: e.target.value })}
                  placeholder={t("prixPlaceholder")}
                />
              </div>
              <div>
                <Label>{t("uniteLabel")}</Label>
                <Select value={form.unite} onValueChange={(v) => setForm({ ...form, unite: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITE_KEYS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{t(u.key)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Prix de revient + marge indicative (purement informatif) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("prixRevientLabel")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.prixRevient}
                  onChange={(e) => setForm({ ...form, prixRevient: e.target.value })}
                  placeholder={t("prixRevientPlaceholder")}
                />
              </div>
              <div className="flex items-end">
                {(() => {
                  const pv = parseFloat(form.prix_base);
                  const pr = parseFloat(form.prixRevient);
                  if (!isNaN(pv) && !isNaN(pr) && pv > 0 && form.prixRevient !== "") {
                    const marge = pv - pr;
                    const pct = Math.round((marge / pv) * 100);
                    return (
                      <p className={`text-sm ${marge >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {t("margeLabel")} <strong>{formatCurrency(marge)}</strong> ({pct}&nbsp;%)
                      </p>
                    );
                  }
                  return <p className="text-xs text-muted-foreground">{t("margeHint")}</p>;
                })()}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("tvaLabel")}</Label>
                <Select value={form.tauxTVA} onValueChange={(v) => setForm({ ...form, tauxTVA: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TVA_KEYS.map((tv) => (
                      <SelectItem key={tv.value} value={tv.value}>{t(tv.key)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">{t("tvaHint")}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>{t("metierLabel")}</Label>
                <Select value={form.metier} onValueChange={(v) => setForm({ ...form, metier: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METIER_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>{t(`metier_${k}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("categorieLabel")}</Label>
                <Select value={form.categorie} onValueChange={(v) => setForm({ ...form, categorie: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIE_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>{t(`categorie_${k}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("sousCategorieLabel")}</Label>
                <Select value={form.sous_categorie} onValueChange={(v) => setForm({ ...form, sous_categorie: v })}>
                  <SelectTrigger><SelectValue placeholder={t("sousCategoriePlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {SOUS_CATEGORIE_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>{t(`sous_${k}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>{t("cancel", { ns: "common" })}</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingArticle ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
          </DialogHeader>
          <p>{t("deleteConfirm", { nom: articleToDelete?.nom })}</p>
          <p className="text-sm text-muted-foreground">{t("deleteIrreversible")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>{t("cancel", { ns: "common" })}</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Preview Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("importTitle")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-auto">
            <p className="mb-4">{t("importCount", { n: importPreview.length })}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">{t("importThNom")}</th>
                  <th className="text-left p-2">{t("importThMetier")}</th>
                  <th className="text-right p-2">{t("importThPrix")}</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.slice(0, 20).map((article, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-2">{article.nom}</td>
                    <td className="p-2">{t(`metier_${article.metier}`, { defaultValue: article.metier })}</td>
                    <td className="p-2 text-right">{formatCurrency(article.prix_base)}</td>
                  </tr>
                ))}
                {importPreview.length > 20 && (
                  <tr>
                    <td colSpan={3} className="p-2 text-center text-muted-foreground">
                      {t("importMore", { n: importPreview.length - 20 })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsImportDialogOpen(false); setImportPreview([]); }}>{t("cancel", { ns: "common" })}</Button>
            <Button onClick={handleImport} disabled={importMutation.isPending}>
              {t("importBtn", { n: importPreview.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
