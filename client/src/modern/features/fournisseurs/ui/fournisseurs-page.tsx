import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/modern/shared/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/modern/shared/ui/table";
import { trpc } from "@/modern/shared/trpc";
import { Loader2, Plus, Search, Building2, Edit, Trash2, Package, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { matchSearch } from "@/lib/normalize";

// Page Fournisseurs du FRONT NEUF (`/v2/fournisseurs`) — PORT CONFORME de `pages/Fournisseurs.tsx`.
// JSX/Tailwind à l'identique ; plomberie repointée : primitives `@/modern/shared/ui`, tRPC partagé,
// i18n (namespace `fournisseurs`). NB : on NE ré-enveloppe PAS dans `DashboardLayout` (le legacy le
// faisait → double layout, alors que la page est déjà rendue dans le DashboardLayout d'AuthenticatedRoutes)
// et on supprime la garde `useAuth` (le sous-arbre `/v2` est déjà sous auth). Comportement et rendu du
// CONTENU inchangés ; seul le double-chrome accidentel du legacy disparaît.

type FournisseurFormData = {
  nom: string;
  contact: string;
  email: string;
  telephone: string;
  adresse: string;
  codePostal: string;
  ville: string;
  notes: string;
};

type ArticleAssociationFormData = {
  articleId: number;
  referenceExterne: string;
  prixAchat: string;
  delaiLivraison: number;
};

export default function FournisseursPage() {
  const { t } = useTranslation("fournisseurs");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isArticlesDialogOpen, setIsArticlesDialogOpen] = useState(false);
  const [isAssociateDialogOpen, setIsAssociateDialogOpen] = useState(false);
  const [selectedFournisseur, setSelectedFournisseur] = useState<any>(null);
  const [formData, setFormData] = useState<FournisseurFormData>({
    nom: "",
    contact: "",
    email: "",
    telephone: "",
    adresse: "",
    codePostal: "",
    ville: "",
    notes: ""
  });
  const [articleSearchQuery, setArticleSearchQuery] = useState("");
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [associationData, setAssociationData] = useState<ArticleAssociationFormData>({
    articleId: 0,
    referenceExterne: "",
    prixAchat: "",
    delaiLivraison: 0
  });

  const utils = trpc.useUtils();
  const { data: fournisseurs, isLoading } = trpc.fournisseurs.list.useQuery();
  const { data: articles } = trpc.articles.getArtisanArticles.useQuery();
  const { data: fournisseurArticles, isLoading: loadingArticles } = trpc.fournisseurs.getFournisseurArticles.useQuery(
    { fournisseurId: selectedFournisseur?.id || 0 },
    { enabled: !!selectedFournisseur && isArticlesDialogOpen }
  );

  const createMutation = trpc.fournisseurs.create.useMutation({
    onSuccess: () => {
      toast.success(t("toastCreated"));
      setIsCreateDialogOpen(false);
      resetForm();
      utils.fournisseurs.list.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const updateMutation = trpc.fournisseurs.update.useMutation({
    onSuccess: () => {
      toast.success(t("toastUpdated"));
      setIsEditDialogOpen(false);
      utils.fournisseurs.list.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const deleteMutation = trpc.fournisseurs.delete.useMutation({
    onSuccess: () => {
      toast.success(t("toastDeleted"));
      utils.fournisseurs.list.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const associateMutation = trpc.fournisseurs.associateArticle.useMutation({
    onSuccess: () => {
      toast.success(t("toastAssociated"));
      setIsAssociateDialogOpen(false);
      setSelectedArticleId(null);
      setAssociationData({ articleId: 0, referenceExterne: "", prixAchat: "", delaiLivraison: 0 });
      utils.fournisseurs.getFournisseurArticles.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const dissociateMutation = trpc.fournisseurs.dissociateArticle.useMutation({
    onSuccess: () => {
      toast.success(t("toastDissociated"));
      utils.fournisseurs.getFournisseurArticles.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const resetForm = () => {
    setFormData({
      nom: "",
      contact: "",
      email: "",
      telephone: "",
      adresse: "",
      codePostal: "",
      ville: "",
      notes: ""
    });
  };

  const handleCreate = () => {
    if (!formData.nom) {
      toast.error(t("toastNomRequired"));
      return;
    }
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!selectedFournisseur) return;
    updateMutation.mutate({
      id: selectedFournisseur.id,
      ...formData
    });
  };

  const handleDelete = (id: number) => {
    if (confirm(t("confirmDelete"))) {
      deleteMutation.mutate({ id });
    }
  };

  const handleAssociate = () => {
    if (!selectedFournisseur || !selectedArticleId) {
      toast.error(t("toastSelectArticle"));
      return;
    }
    associateMutation.mutate({
      fournisseurId: selectedFournisseur.id,
      articleId: selectedArticleId,
      referenceExterne: associationData.referenceExterne || undefined,
      prixAchat: associationData.prixAchat || undefined,
      delaiLivraison: associationData.delaiLivraison || undefined
    });
  };

  const openEditDialog = (fournisseur: any) => {
    setSelectedFournisseur(fournisseur);
    setFormData({
      nom: fournisseur.nom,
      contact: fournisseur.contact || "",
      email: fournisseur.email || "",
      telephone: fournisseur.telephone || "",
      adresse: fournisseur.adresse || "",
      codePostal: fournisseur.codePostal || "",
      ville: fournisseur.ville || "",
      notes: fournisseur.notes || ""
    });
    setIsEditDialogOpen(true);
  };

  const openArticlesDialog = (fournisseur: any) => {
    setSelectedFournisseur(fournisseur);
    setIsArticlesDialogOpen(true);
  };

  const filteredFournisseurs = fournisseurs?.filter((f: any) =>
    matchSearch(f.nom, searchQuery) ||
    matchSearch(f.contact, searchQuery) ||
    matchSearch(f.ville, searchQuery)
  );

  const filteredArticles = articles?.filter((a: any) =>
    matchSearch(a.designation, articleSearchQuery) ||
    matchSearch(a.reference, articleSearchQuery)
  );

  const getArticleDetails = (articleId: number) => {
    return articles?.find((a: any) => a.id === articleId);
  };

  const formatCurrency = (value: string | number | null) => {
    if (!value) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("newSupplier")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("newSupplier")}</DialogTitle>
              <DialogDescription>{t("createDesc")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>{t("nomLabel")}</Label>
                <Input
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  placeholder={t("nomPlaceholder")}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("contactLabel")}</Label>
                  <Input
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    placeholder={t("contactPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("telephoneLabel")}</Label>
                  <Input
                    value={formData.telephone}
                    onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                    placeholder={t("telephonePlaceholder")}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("emailLabel")}</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder={t("emailPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("adresseLabel")}</Label>
                <Input
                  value={formData.adresse}
                  onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                  placeholder={t("adressePlaceholder")}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("codePostalLabel")}</Label>
                  <Input
                    value={formData.codePostal}
                    onChange={(e) => setFormData({ ...formData, codePostal: e.target.value })}
                    placeholder={t("codePostalPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("villeLabel")}</Label>
                  <Input
                    value={formData.ville}
                    onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
                    placeholder={t("villePlaceholder")}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("notesLabel")}</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={t("notesPlaceholder")}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                {t("cancel", { ns: "common" })}
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("statTotal")}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fournisseurs?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("statWithEmail")}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fournisseurs?.filter((f: any) => f.email).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("statWithPhone")}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fournisseurs?.filter((f: any) => f.telephone).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fournisseurs list */}
      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
          <CardDescription>
            {t("listCount", { n: filteredFournisseurs?.length || 0 })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredFournisseurs && filteredFournisseurs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("thNom")}</TableHead>
                  <TableHead>{t("thContact")}</TableHead>
                  <TableHead>{t("thTelephone")}</TableHead>
                  <TableHead>{t("thEmail")}</TableHead>
                  <TableHead>{t("thVille")}</TableHead>
                  <TableHead className="text-right">{t("thActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFournisseurs.map((fournisseur: any) => (
                  <TableRow key={fournisseur.id}>
                    <TableCell className="font-medium">{fournisseur.nom}</TableCell>
                    <TableCell>{fournisseur.contact || "-"}</TableCell>
                    <TableCell>{fournisseur.telephone || "-"}</TableCell>
                    <TableCell>{fournisseur.email || "-"}</TableCell>
                    <TableCell>{fournisseur.ville || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openArticlesDialog(fournisseur)}
                          title={t("titleArticles")}
                        >
                          <Package className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(fournisseur)}
                          title={t("titleEdit")}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(fournisseur.id)}
                          title={t("titleDelete")}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">{t("empty")}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("addFirst")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
            <DialogDescription>{t("editDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>{t("nomLabel")}</Label>
              <Input
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("contactLabel")}</Label>
                <Input
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("telephoneLabel")}</Label>
                <Input
                  value={formData.telephone}
                  onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("emailLabel")}</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("adresseLabel")}</Label>
              <Input
                value={formData.adresse}
                onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("codePostalLabel")}</Label>
                <Input
                  value={formData.codePostal}
                  onChange={(e) => setFormData({ ...formData, codePostal: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("villeLabel")}</Label>
                <Input
                  value={formData.ville}
                  onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("notesLabel")}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t("cancel", { ns: "common" })}
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Articles Dialog */}
      <Dialog open={isArticlesDialogOpen} onOpenChange={setIsArticlesDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("articlesTitle", { nom: selectedFournisseur?.nom })}</DialogTitle>
            <DialogDescription>{t("articlesDesc")}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex justify-end mb-4">
              <Button onClick={() => setIsAssociateDialogOpen(true)}>
                <Link2 className="mr-2 h-4 w-4" />
                {t("associateArticle")}
              </Button>
            </div>
            {loadingArticles ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : fournisseurArticles && fournisseurArticles.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("thArticle")}</TableHead>
                    <TableHead>{t("thRefExt")}</TableHead>
                    <TableHead>{t("thPrix")}</TableHead>
                    <TableHead>{t("thDelai")}</TableHead>
                    <TableHead className="text-right">{t("thActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fournisseurArticles.map((assoc: any) => {
                    const article = getArticleDetails(assoc.articleId);
                    return (
                      <TableRow key={assoc.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{article?.designation || t("unknownArticle")}</div>
                            <div className="text-sm text-muted-foreground">{article?.reference}</div>
                          </div>
                        </TableCell>
                        <TableCell>{assoc.referenceExterne || "-"}</TableCell>
                        <TableCell>{formatCurrency(assoc.prixAchat)}</TableCell>
                        <TableCell>{assoc.delaiLivraison || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => dissociateMutation.mutate({ id: assoc.id })}
                            title={t("titleDissociate")}
                          >
                            <Unlink className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8">
                <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">{t("noArticles")}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Associate Article Dialog */}
      <Dialog open={isAssociateDialogOpen} onOpenChange={setIsAssociateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("associateArticle")}</DialogTitle>
            <DialogDescription>{t("associateDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>{t("searchArticleLabel")}</Label>
              <Input
                placeholder={t("searchArticlePlaceholder")}
                value={articleSearchQuery}
                onChange={(e) => setArticleSearchQuery(e.target.value)}
              />
            </div>
            {articleSearchQuery && filteredArticles && filteredArticles.length > 0 && (
              <div className="max-h-40 overflow-y-auto border rounded-md">
                {filteredArticles.slice(0, 10).map((article: any) => (
                  <div
                    key={article.id}
                    className={`p-2 cursor-pointer hover:bg-accent ${selectedArticleId === article.id ? "bg-accent" : ""}`}
                    onClick={() => {
                      setSelectedArticleId(article.id);
                      setArticleSearchQuery(article.designation);
                    }}
                  >
                    <div className="font-medium">{article.designation}</div>
                    <div className="text-sm text-muted-foreground">{article.reference}</div>
                  </div>
                ))}
              </div>
            )}
            {selectedArticleId && (
              <>
                <div className="space-y-2">
                  <Label>{t("refExtLabel")}</Label>
                  <Input
                    value={associationData.referenceExterne}
                    onChange={(e) => setAssociationData({ ...associationData, referenceExterne: e.target.value })}
                    placeholder={t("refExtPlaceholder")}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("prixLabel")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={associationData.prixAchat}
                      onChange={(e) => setAssociationData({ ...associationData, prixAchat: e.target.value })}
                      placeholder={t("prixPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("delaiLabel")}</Label>
                    <Input
                      type="number"
                      value={associationData.delaiLivraison}
                      onChange={(e) => setAssociationData({ ...associationData, delaiLivraison: parseInt(e.target.value) || 0 })}
                      placeholder={t("delaiPlaceholder")}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsAssociateDialogOpen(false);
              setSelectedArticleId(null);
              setArticleSearchQuery("");
            }}>
              {t("cancel", { ns: "common" })}
            </Button>
            <Button onClick={handleAssociate} disabled={!selectedArticleId || associateMutation.isPending}>
              {associateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("associateBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
