import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Search, Package, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Edit, Trash2, History, Bell } from "lucide-react";
import { toast } from "sonner";

type StockFormData = {
  reference: string;
  designation: string;
  quantiteEnStock: string;
  seuilAlerte: string;
  unite: string;
  prixAchat: string;
  emplacement: string;
  fournisseur: string;
};

type MouvementFormData = {
  stockId: number;
  quantite: number;
  type: "entree" | "sortie" | "ajustement";
  motif: string;
  reference: string;
};

export default function Stocks() {
  const { user, loading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isMouvementDialogOpen, setIsMouvementDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [formData, setFormData] = useState<StockFormData>({
    reference: "",
    designation: "",
    quantiteEnStock: "0",
    seuilAlerte: "5",
    unite: "unité",
    prixAchat: "",
    emplacement: "",
    fournisseur: ""
  });
  const [mouvementData, setMouvementData] = useState<MouvementFormData>({
    stockId: 0,
    quantite: 1,
    type: "entree",
    motif: "",
    reference: ""
  });

  const utils = trpc.useUtils();
  const { data: stocks, isLoading } = trpc.stocks.list.useQuery();
  const { data: lowStockItems } = trpc.stocks.getLowStock.useQuery();
  const { data: mouvements, isLoading: loadingMouvements } = trpc.stocks.getMouvements.useQuery(
    { stockId: selectedStock?.id || 0 },
    { enabled: !!selectedStock && isHistoryDialogOpen }
  );

  const createMutation = trpc.stocks.create.useMutation({
    onSuccess: () => {
      toast.success("Article ajouté au stock");
      setIsCreateDialogOpen(false);
      resetForm();
      utils.stocks.list.invalidate();
      utils.stocks.getLowStock.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const updateMutation = trpc.stocks.update.useMutation({
    onSuccess: () => {
      toast.success("Stock mis à jour");
      setIsEditDialogOpen(false);
      utils.stocks.list.invalidate();
      utils.stocks.getLowStock.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const deleteMutation = trpc.stocks.delete.useMutation({
    onSuccess: () => {
      toast.success("Article supprimé du stock");
      utils.stocks.list.invalidate();
      utils.stocks.getLowStock.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const adjustMutation = trpc.stocks.adjustQuantity.useMutation({
    onSuccess: () => {
      toast.success("Mouvement enregistré");
      setIsMouvementDialogOpen(false);
      resetMouvementForm();
      utils.stocks.list.invalidate();
      utils.stocks.getLowStock.invalidate();
      utils.stocks.getMouvements.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const generateAlertsMutation = trpc.stocks.generateAlerts.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.alertsCreated} alerte(s) créée(s)`);
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const resetForm = () => {
    setFormData({
      reference: "",
      designation: "",
      quantiteEnStock: "0",
      seuilAlerte: "5",
      unite: "unité",
      prixAchat: "",
      emplacement: "",
      fournisseur: ""
    });
  };

  const resetMouvementForm = () => {
    setMouvementData({
      stockId: 0,
      quantite: 1,
      type: "entree",
      motif: "",
      reference: ""
    });
  };

  const handleCreate = () => {
    if (!formData.reference || !formData.designation) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!selectedStock) return;
    updateMutation.mutate({
      id: selectedStock.id,
      ...formData
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer cet article du stock ?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleAdjust = () => {
    if (!selectedStock || mouvementData.quantite <= 0) {
      toast.error("Veuillez entrer une quantité valide");
      return;
    }
    adjustMutation.mutate({
      ...mouvementData,
      stockId: selectedStock.id
    });
  };

  const openEditDialog = (stock: any) => {
    setSelectedStock(stock);
    setFormData({
      reference: stock.reference,
      designation: stock.designation,
      quantiteEnStock: stock.quantiteEnStock,
      seuilAlerte: stock.seuilAlerte || "5",
      unite: stock.unite || "unité",
      prixAchat: stock.prixAchat || "",
      emplacement: stock.emplacement || "",
      fournisseur: stock.fournisseur || ""
    });
    setIsEditDialogOpen(true);
  };

  const openMouvementDialog = (stock: any) => {
    setSelectedStock(stock);
    setMouvementData({
      stockId: stock.id,
      quantite: 1,
      type: "entree",
      motif: "",
      reference: ""
    });
    setIsMouvementDialogOpen(true);
  };

  const openHistoryDialog = (stock: any) => {
    setSelectedStock(stock);
    setIsHistoryDialogOpen(true);
  };

  const formatCurrency = (value: string | number | null) => {
    if (!value) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const filteredStocks = stocks?.filter(stock =>
    stock.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stock.designation.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (stock.fournisseur && stock.fournisseur.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const isLowStock = (stock: any) => {
    const qty = parseFloat(stock.quantiteEnStock || "0");
    const seuil = parseFloat(stock.seuilAlerte || "0");
    return qty <= seuil;
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
          <p className="text-muted-foreground">Veuillez vous connecter pour accéder à la gestion des stocks.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Gestion des Stocks</h1>
            <p className="text-muted-foreground">Suivez vos articles et recevez des alertes de réapprovisionnement</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => generateAlertsMutation.mutate()}>
              <Bell className="mr-2 h-4 w-4" />
              Générer alertes
            </Button>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter un article
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Nouvel article en stock</DialogTitle>
                  <DialogDescription>Ajoutez un nouvel article à votre inventaire</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Référence *</Label>
                      <Input
                        value={formData.reference}
                        onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                        placeholder="REF-001"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unité</Label>
                      <Select value={formData.unite} onValueChange={(v) => setFormData({ ...formData, unite: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unité">Unité</SelectItem>
                          <SelectItem value="m">Mètre</SelectItem>
                          <SelectItem value="m²">M²</SelectItem>
                          <SelectItem value="kg">Kg</SelectItem>
                          <SelectItem value="L">Litre</SelectItem>
                          <SelectItem value="lot">Lot</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Désignation *</Label>
                    <Input
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      placeholder="Nom de l'article"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Quantité initiale</Label>
                      <Input
                        type="number"
                        value={formData.quantiteEnStock}
                        onChange={(e) => setFormData({ ...formData, quantiteEnStock: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Seuil d'alerte</Label>
                      <Input
                        type="number"
                        value={formData.seuilAlerte}
                        onChange={(e) => setFormData({ ...formData, seuilAlerte: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Prix d'achat</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.prixAchat}
                        onChange={(e) => setFormData({ ...formData, prixAchat: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Emplacement</Label>
                      <Input
                        value={formData.emplacement}
                        onChange={(e) => setFormData({ ...formData, emplacement: e.target.value })}
                        placeholder="Étagère A1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Fournisseur</Label>
                    <Input
                      value={formData.fournisseur}
                      onChange={(e) => setFormData({ ...formData, fournisseur: e.target.value })}
                      placeholder="Nom du fournisseur"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Annuler</Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Ajouter
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Alertes de stock bas */}
        {lowStockItems && lowStockItems.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <CardTitle className="text-orange-700">Alertes de stock bas</CardTitle>
              </div>
              <CardDescription className="text-orange-600">
                {lowStockItems.length} article(s) en dessous du seuil d'alerte
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {lowStockItems.map((item) => (
                  <Badge key={item.id} variant="outline" className="bg-white border-orange-300">
                    {item.designation} ({item.quantiteEnStock} {item.unite})
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="all" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all">Tous les articles</TabsTrigger>
              <TabsTrigger value="low">Stock bas</TabsTrigger>
            </TabsList>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <TabsContent value="all">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredStocks && filteredStocks.length > 0 ? (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Désignation</th>
                      <th className="text-right p-2 whitespace-nowrap">Quantité</th>
                      <th className="text-right p-2 whitespace-nowrap">Seuil</th>
                      <th className="text-right p-2 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStocks.map((stock) => (
                      <tr key={stock.id} className={`border-t ${isLowStock(stock) ? 'bg-orange-50' : ''}`}>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <span>{stock.designation}</span>
                            {isLowStock(stock) && (
                              <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                            )}
                          </div>
                        </td>
                        <td className="text-right p-2 whitespace-nowrap">
                          <span className={isLowStock(stock) ? 'text-orange-600 font-bold' : ''}>
                            {stock.quantiteEnStock} {stock.unite}
                          </span>
                        </td>
                        <td className="text-right p-2 text-muted-foreground whitespace-nowrap">{stock.seuilAlerte}</td>
                        <td className="text-right p-2 whitespace-nowrap">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openMouvementDialog(stock)} title="Mouvement">
                              <ArrowUpCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openHistoryDialog(stock)} title="Historique">
                              <History className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(stock)} title="Modifier">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(stock.id)} title="Supprimer">
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
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
                  <p className="text-muted-foreground">Aucun article en stock</p>
                  <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Ajouter un article
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="low">
            {lowStockItems && lowStockItems.length > 0 ? (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Désignation</th>
                      <th className="text-right p-2 whitespace-nowrap">Quantité</th>
                      <th className="text-right p-2 whitespace-nowrap">Seuil</th>
                      <th className="text-right p-2 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockItems.map((stock) => (
                      <tr key={stock.id} className="border-t bg-orange-50">
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <span>{stock.designation}</span>
                            <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                          </div>
                        </td>
                        <td className="text-right p-2 whitespace-nowrap">
                          <span className="text-orange-600 font-bold">
                            {stock.quantiteEnStock} {stock.unite}
                          </span>
                        </td>
                        <td className="text-right p-2 text-muted-foreground whitespace-nowrap">{stock.seuilAlerte}</td>
                        <td className="text-right p-2 whitespace-nowrap">
                          <Button variant="outline" size="sm" onClick={() => openMouvementDialog(stock)}>
                            <ArrowUpCircle className="mr-2 h-4 w-4" />
                            Réapprovisionner
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-green-500 mb-4" />
                  <p className="text-muted-foreground">Tous les stocks sont au-dessus du seuil d'alerte</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Dialog Modification */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier l'article</DialogTitle>
              <DialogDescription>Modifiez les informations de l'article</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Référence *</Label>
                  <Input
                    value={formData.reference}
                    onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unité</Label>
                  <Select value={formData.unite} onValueChange={(v) => setFormData({ ...formData, unite: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unité">Unité</SelectItem>
                      <SelectItem value="m">Mètre</SelectItem>
                      <SelectItem value="m²">M²</SelectItem>
                      <SelectItem value="kg">Kg</SelectItem>
                      <SelectItem value="L">Litre</SelectItem>
                      <SelectItem value="lot">Lot</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Désignation *</Label>
                <Input
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Seuil d'alerte</Label>
                  <Input
                    type="number"
                    value={formData.seuilAlerte}
                    onChange={(e) => setFormData({ ...formData, seuilAlerte: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Prix d'achat</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.prixAchat}
                    onChange={(e) => setFormData({ ...formData, prixAchat: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Emplacement</Label>
                  <Input
                    value={formData.emplacement}
                    onChange={(e) => setFormData({ ...formData, emplacement: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fournisseur</Label>
                  <Input
                    value={formData.fournisseur}
                    onChange={(e) => setFormData({ ...formData, fournisseur: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Mouvement */}
        <Dialog open={isMouvementDialogOpen} onOpenChange={setIsMouvementDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Mouvement de stock</DialogTitle>
              <DialogDescription>
                {selectedStock?.designation} - Stock actuel: {selectedStock?.quantiteEnStock} {selectedStock?.unite}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Type de mouvement</Label>
                <Select 
                  value={mouvementData.type} 
                  onValueChange={(v: "entree" | "sortie" | "ajustement") => setMouvementData({ ...mouvementData, type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entree">
                      <div className="flex items-center gap-2">
                        <ArrowUpCircle className="h-4 w-4 text-green-500" />
                        Entrée (réapprovisionnement)
                      </div>
                    </SelectItem>
                    <SelectItem value="sortie">
                      <div className="flex items-center gap-2">
                        <ArrowDownCircle className="h-4 w-4 text-red-500" />
                        Sortie (utilisation)
                      </div>
                    </SelectItem>
                    <SelectItem value="ajustement">
                      <div className="flex items-center gap-2">
                        <Edit className="h-4 w-4 text-blue-500" />
                        Ajustement (inventaire)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantité</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mouvementData.quantite}
                  onChange={(e) => setMouvementData({ ...mouvementData, quantite: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Motif</Label>
                <Input
                  value={mouvementData.motif}
                  onChange={(e) => setMouvementData({ ...mouvementData, motif: e.target.value })}
                  placeholder="Ex: Commande fournisseur, Chantier client X..."
                />
              </div>
              <div className="space-y-2">
                <Label>Référence (BL, facture...)</Label>
                <Input
                  value={mouvementData.reference}
                  onChange={(e) => setMouvementData({ ...mouvementData, reference: e.target.value })}
                  placeholder="Ex: BL-2024-001"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsMouvementDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleAdjust} disabled={adjustMutation.isPending}>
                {adjustMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Historique */}
        <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Historique des mouvements</DialogTitle>
              <DialogDescription>
                {selectedStock?.designation} ({selectedStock?.reference})
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto">
              {loadingMouvements ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : mouvements && mouvements.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-right p-2">Qté</th>
                      <th className="text-right p-2">Avant</th>
                      <th className="text-right p-2">Après</th>
                      <th className="text-left p-2">Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mouvements.map((mvt) => (
                      <tr key={mvt.id} className="border-t">
                        <td className="p-2 text-sm">{formatDate(mvt.createdAt)}</td>
                        <td className="p-2">
                          <Badge variant={mvt.type === 'entree' ? 'default' : mvt.type === 'sortie' ? 'destructive' : 'secondary'}>
                            {mvt.type === 'entree' ? 'Entrée' : mvt.type === 'sortie' ? 'Sortie' : 'Ajustement'}
                          </Badge>
                        </td>
                        <td className="text-right p-2 font-mono">
                          {mvt.type === 'entree' ? '+' : mvt.type === 'sortie' ? '-' : ''}{mvt.quantite}
                        </td>
                        <td className="text-right p-2 text-muted-foreground">{mvt.quantiteAvant}</td>
                        <td className="text-right p-2 font-medium">{mvt.quantiteApres}</td>
                        <td className="p-2 text-sm text-muted-foreground">{mvt.motif || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun mouvement enregistré
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
