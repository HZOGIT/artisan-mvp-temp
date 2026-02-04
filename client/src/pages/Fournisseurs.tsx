import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Search, Building2, Edit, Trash2, Package, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";

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

export default function Fournisseurs() {
  const { user, loading: authLoading } = useAuth();
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
      toast.success("Fournisseur créé avec succès");
      setIsCreateDialogOpen(false);
      resetForm();
      utils.fournisseurs.list.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const updateMutation = trpc.fournisseurs.update.useMutation({
    onSuccess: () => {
      toast.success("Fournisseur mis à jour");
      setIsEditDialogOpen(false);
      utils.fournisseurs.list.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const deleteMutation = trpc.fournisseurs.delete.useMutation({
    onSuccess: () => {
      toast.success("Fournisseur supprimé");
      utils.fournisseurs.list.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const associateMutation = trpc.fournisseurs.associateArticle.useMutation({
    onSuccess: () => {
      toast.success("Article associé au fournisseur");
      setIsAssociateDialogOpen(false);
      setSelectedArticleId(null);
      setAssociationData({ articleId: 0, referenceExterne: "", prixAchat: "", delaiLivraison: 0 });
      utils.fournisseurs.getFournisseurArticles.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const dissociateMutation = trpc.fournisseurs.dissociateArticle.useMutation({
    onSuccess: () => {
      toast.success("Association supprimée");
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
      toast.error("Le nom du fournisseur est obligatoire");
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
    if (confirm("Êtes-vous sûr de vouloir supprimer ce fournisseur ?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleAssociate = () => {
    if (!selectedFournisseur || !selectedArticleId) {
      toast.error("Veuillez sélectionner un article");
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

  const filteredFournisseurs = fournisseurs?.filter(f =>
    f.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.contact && f.contact.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (f.ville && f.ville.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredArticles = articles?.filter((a: any) =>
    a.designation.toLowerCase().includes(articleSearchQuery.toLowerCase()) ||
    a.reference.toLowerCase().includes(articleSearchQuery.toLowerCase())
  );

  // Get article details from the articles list
  const getArticleDetails = (articleId: number) => {
    return articles?.find((a: any) => a.id === articleId);
  };

  const formatCurrency = (value: string | number | null) => {
    if (!value) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
  };

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Veuillez vous connecter pour accéder à la gestion des fournisseurs.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Fournisseurs</h1>
            <p className="text-muted-foreground">Gérez vos fournisseurs et leurs articles associés</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nouveau fournisseur
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nouveau fournisseur</DialogTitle>
                <DialogDescription>Ajoutez un nouveau fournisseur à votre carnet d'adresses</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Nom de l'entreprise *</Label>
                  <Input
                    value={formData.nom}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                    placeholder="Ex: Rexel, Point P..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contact</Label>
                    <Input
                      value={formData.contact}
                      onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                      placeholder="Nom du contact"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Téléphone</Label>
                    <Input
                      value={formData.telephone}
                      onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                      placeholder="01 23 45 67 89"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="contact@fournisseur.fr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Adresse</Label>
                  <Input
                    value={formData.adresse}
                    onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                    placeholder="123 rue du Commerce"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Code postal</Label>
                    <Input
                      value={formData.codePostal}
                      onChange={(e) => setFormData({ ...formData, codePostal: e.target.value })}
                      placeholder="75001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ville</Label>
                    <Input
                      value={formData.ville}
                      onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
                      placeholder="Paris"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Informations complémentaires..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Créer
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
                placeholder="Rechercher un fournisseur..."
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
              <CardTitle className="text-sm font-medium">Total fournisseurs</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fournisseurs?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avec email</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {fournisseurs?.filter(f => f.email).length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avec téléphone</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {fournisseurs?.filter(f => f.telephone).length || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Fournisseurs list */}
        <Card>
          <CardHeader>
            <CardTitle>Liste des fournisseurs</CardTitle>
            <CardDescription>
              {filteredFournisseurs?.length || 0} fournisseur(s) trouvé(s)
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
                    <TableHead>Nom</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Ville</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFournisseurs.map((fournisseur) => (
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
                            title="Articles associés"
                          >
                            <Package className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(fournisseur)}
                            title="Modifier"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(fournisseur.id)}
                            title="Supprimer"
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
                <p className="mt-4 text-muted-foreground">Aucun fournisseur trouvé</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter votre premier fournisseur
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Modifier le fournisseur</DialogTitle>
              <DialogDescription>Modifiez les informations du fournisseur</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Nom de l'entreprise *</Label>
                <Input
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact</Label>
                  <Input
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input
                    value={formData.telephone}
                    onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Adresse</Label>
                <Input
                  value={formData.adresse}
                  onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Code postal</Label>
                  <Input
                    value={formData.codePostal}
                    onChange={(e) => setFormData({ ...formData, codePostal: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ville</Label>
                  <Input
                    value={formData.ville}
                    onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Articles Dialog */}
        <Dialog open={isArticlesDialogOpen} onOpenChange={setIsArticlesDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Articles de {selectedFournisseur?.nom}</DialogTitle>
              <DialogDescription>Gérez les articles associés à ce fournisseur</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="flex justify-end mb-4">
                <Button onClick={() => setIsAssociateDialogOpen(true)}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Associer un article
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
                      <TableHead>Article</TableHead>
                      <TableHead>Réf. externe</TableHead>
                      <TableHead>Prix d'achat</TableHead>
                      <TableHead>Délai (jours)</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fournisseurArticles.map((assoc) => {
                      const article = getArticleDetails(assoc.articleId);
                      return (
                        <TableRow key={assoc.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{article?.designation || "Article inconnu"}</div>
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
                              title="Supprimer l'association"
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
                  <p className="mt-4 text-muted-foreground">Aucun article associé à ce fournisseur</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Associate Article Dialog */}
        <Dialog open={isAssociateDialogOpen} onOpenChange={setIsAssociateDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Associer un article</DialogTitle>
              <DialogDescription>Sélectionnez un article et renseignez les informations fournisseur</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Rechercher un article</Label>
                <Input
                  placeholder="Rechercher par référence ou désignation..."
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
                    <Label>Référence externe (chez le fournisseur)</Label>
                    <Input
                      value={associationData.referenceExterne}
                      onChange={(e) => setAssociationData({ ...associationData, referenceExterne: e.target.value })}
                      placeholder="REF-FOURNISSEUR-001"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Prix d'achat (€)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={associationData.prixAchat}
                        onChange={(e) => setAssociationData({ ...associationData, prixAchat: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Délai de livraison (jours)</Label>
                      <Input
                        type="number"
                        value={associationData.delaiLivraison}
                        onChange={(e) => setAssociationData({ ...associationData, delaiLivraison: parseInt(e.target.value) || 0 })}
                        placeholder="0"
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
                Annuler
              </Button>
              <Button onClick={handleAssociate} disabled={!selectedArticleId || associateMutation.isPending}>
                {associateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Associer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
