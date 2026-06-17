import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/modern/shared/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modern/shared/ui/tabs";
import { Badge } from "@/modern/shared/ui/badge";
import { trpc } from "@/modern/shared/trpc";
import { Loader2, Plus, Search, Package, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Edit, Trash2, History, Bell } from "lucide-react";
import { toast } from "sonner";
import { matchSearch } from "@/lib/normalize";

// Page Gestion des Stocks du FRONT NEUF (`/v2/stocks`) — PORT CONFORME de `pages/Stocks.tsx`. JSX à
// l'identique (tabs + 4 dialogs : créer/éditer/mouvement/historique + KPIs + alertes). Plomberie
// repointée : primitives `@/modern/shared/ui`, tRPC partagé, i18n (namespace `stocks`). NB : on NE
// ré-enveloppe PAS dans `DashboardLayout` (déjà fourni par AuthenticatedRoutes) et on retire `useAuth`.

const UNITE_KEYS: { value: string; key: string }[] = [
  { value: "unité", key: "unite_unite" },
  { value: "m", key: "unite_m" },
  { value: "m²", key: "unite_m2" },
  { value: "kg", key: "unite_kg" },
  { value: "L", key: "unite_L" },
  { value: "lot", key: "unite_lot" },
];

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

export default function StocksPage() {
  const { t } = useTranslation("stocks");
  const search = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "low">(() => {
    if (typeof window === "undefined") return "all";
    const f = new URLSearchParams(window.location.search).get("filtre");
    return f === "rupture" || f === "alerte" ? "low" : "all";
  });
  useEffect(() => {
    const f = new URLSearchParams(search).get("filtre");
    if (f === "rupture" || f === "alerte") setActiveTab("low");
    else if (!f) setActiveTab("all");
  }, [search]);
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
  // Quantité entrante (commandes fournisseurs en cours) par fiche stock → stock prévisionnel.
  const { data: stockEntrant } = trpc.stocks.getEntrant.useQuery();
  const entrantByStock: Record<number, number> = {};
  (stockEntrant || []).forEach((e: any) => { entrantByStock[e.stockId] = e.entrant; });
  const { data: mouvements, isLoading: loadingMouvements } = trpc.stocks.getMouvements.useQuery(
    { stockId: selectedStock?.id || 0 },
    { enabled: !!selectedStock && isHistoryDialogOpen }
  );

  const createMutation = trpc.stocks.create.useMutation({
    onSuccess: () => {
      toast.success(t("toastCreated"));
      setIsCreateDialogOpen(false);
      resetForm();
      utils.stocks.list.invalidate();
      utils.stocks.getLowStock.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const updateMutation = trpc.stocks.update.useMutation({
    onSuccess: () => {
      toast.success(t("toastUpdated"));
      setIsEditDialogOpen(false);
      utils.stocks.list.invalidate();
      utils.stocks.getLowStock.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const deleteMutation = trpc.stocks.delete.useMutation({
    onSuccess: () => {
      toast.success(t("toastDeleted"));
      utils.stocks.list.invalidate();
      utils.stocks.getLowStock.invalidate();
    },
    onError: (error) => toast.error(error.message)
  });

  const adjustMutation = trpc.stocks.adjustQuantity.useMutation({
    onSuccess: () => {
      toast.success(t("toastMvt"));
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
      toast.success(t("toastAlerts", { count: data.alertsCreated }));
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
      toast.error(t("toastRequiredFields"));
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
    if (confirm(t("confirmDelete"))) {
      deleteMutation.mutate({ id });
    }
  };

  const handleAdjust = () => {
    if (!selectedStock || mouvementData.quantite <= 0) {
      toast.error(t("toastInvalidQty"));
      return;
    }
    adjustMutation.mutate({
      ...mouvementData,
      stockId: selectedStock.id,
      // L'input tRPC attend `quantite` en string (le legacy envoyait un number, toléré car non gaté).
      quantite: String(mouvementData.quantite),
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

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const filteredStocks = stocks?.filter((stock: any) =>
    matchSearch(stock.reference, searchQuery) ||
    matchSearch(stock.designation, searchQuery) ||
    matchSearch(stock.fournisseur, searchQuery)
  );

  const isLowStock = (stock: any) => {
    const qty = parseFloat(stock.quantiteEnStock || "0");
    const seuil = parseFloat(stock.seuilAlerte || "0");
    return qty <= seuil;
  };

  const uniteSelect = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {UNITE_KEYS.map((u) => (
          <SelectItem key={u.value} value={u.value}>{t(u.key)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => generateAlertsMutation.mutate()}>
            <Bell className="h-4 w-4 mr-2" />
            {t("generateAlerts")}
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t("addArticle")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t("createTitle")}</DialogTitle>
                <DialogDescription>{t("createDesc")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("refLabel")}</Label>
                    <Input
                      value={formData.reference}
                      onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                      placeholder={t("refPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("uniteLabel")}</Label>
                    {uniteSelect(formData.unite, (v) => setFormData({ ...formData, unite: v }))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("designationLabel")}</Label>
                  <Input
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    placeholder={t("designationPlaceholder")}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("qtyInitialLabel")}</Label>
                    <Input
                      type="number"
                      value={formData.quantiteEnStock}
                      onChange={(e) => setFormData({ ...formData, quantiteEnStock: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("seuilLabel")}</Label>
                    <Input
                      type="number"
                      value={formData.seuilAlerte}
                      onChange={(e) => setFormData({ ...formData, seuilAlerte: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("prixLabel")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.prixAchat}
                      onChange={(e) => setFormData({ ...formData, prixAchat: e.target.value })}
                      placeholder={t("prixPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("emplacementLabel")}</Label>
                    <Input
                      value={formData.emplacement}
                      onChange={(e) => setFormData({ ...formData, emplacement: e.target.value })}
                      placeholder={t("emplacementPlaceholder")}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("fournisseurLabel")}</Label>
                  <Input
                    value={formData.fournisseur}
                    onChange={(e) => setFormData({ ...formData, fournisseur: e.target.value })}
                    placeholder={t("fournisseurPlaceholder")}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>{t("cancel", { ns: "common" })}</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("add")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs stock */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("kpiArticles")}</CardDescription>
            <CardTitle className="text-2xl">{stocks?.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("kpiValue")}</CardDescription>
            <CardTitle className="text-2xl">
              {(stocks || []).reduce(
                (sum: number, s: any) => sum + (parseFloat(s.quantiteEnStock || "0") || 0) * (parseFloat(s.prixAchat || "0") || 0),
                0,
              ).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("kpiLow")}</CardDescription>
            <CardTitle className="text-2xl text-orange-600">{lowStockItems?.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Alertes de stock bas */}
      {lowStockItems && lowStockItems.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-orange-700">{t("lowAlertTitle")}</CardTitle>
            </div>
            <CardDescription className="text-orange-600">
              {t("lowAlertDesc", { count: lowStockItems.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map((item: any) => (
                <Badge key={item.id} variant="outline" className="bg-white border-orange-300">
                  {item.designation} ({item.quantiteEnStock} {item.unite})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | "low")} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="all">{t("tabAll")}</TabsTrigger>
            <TabsTrigger value="low">{t("tabLow")}</TabsTrigger>
          </TabsList>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
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
                    <th className="text-left p-2">{t("thDesignation")}</th>
                    <th className="text-right p-2 whitespace-nowrap">{t("thQuantite")}</th>
                    <th className="text-right p-2 whitespace-nowrap">{t("thSeuil")}</th>
                    <th className="text-right p-2 whitespace-nowrap">{t("thActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStocks.map((stock: any) => (
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
                        {entrantByStock[stock.id] > 0 && (
                          <Badge
                            variant="outline"
                            className="ml-2 border-blue-300 text-blue-700 bg-blue-50"
                            title={t("previsionnelTitle", { qty: (parseFloat(stock.quantiteEnStock || '0') + entrantByStock[stock.id]).toFixed(2), unite: stock.unite })}
                          >
                            {t("entrantBadge", { n: entrantByStock[stock.id] })}
                          </Badge>
                        )}
                      </td>
                      <td className="text-right p-2 text-muted-foreground whitespace-nowrap">{stock.seuilAlerte}</td>
                      <td className="text-right p-2 whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openMouvementDialog(stock)} title={t("titleMouvement")}>
                            <ArrowUpCircle className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openHistoryDialog(stock)} title={t("titleHistorique")}>
                            <History className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(stock)} title={t("titleModifier")}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(stock.id)} title={t("titleSupprimer")}>
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
                <p className="text-muted-foreground">{t("emptyAll")}</p>
                <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("addArticle")}
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
                    <th className="text-left p-2">{t("thDesignation")}</th>
                    <th className="text-right p-2 whitespace-nowrap">{t("thQuantite")}</th>
                    <th className="text-right p-2 whitespace-nowrap">{t("thSeuil")}</th>
                    <th className="text-right p-2 whitespace-nowrap">{t("thActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map((stock: any) => (
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
                          {t("reapprovisionner")}
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
                <p className="text-muted-foreground">{t("emptyLow")}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog Modification */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
            <DialogDescription>{t("editDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("refLabel")}</Label>
                <Input
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("uniteLabel")}</Label>
                {uniteSelect(formData.unite, (v) => setFormData({ ...formData, unite: v }))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("designationLabel")}</Label>
              <Input
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("seuilLabel")}</Label>
                <Input
                  type="number"
                  value={formData.seuilAlerte}
                  onChange={(e) => setFormData({ ...formData, seuilAlerte: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("prixLabel")}</Label>
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
                <Label>{t("emplacementLabel")}</Label>
                <Input
                  value={formData.emplacement}
                  onChange={(e) => setFormData({ ...formData, emplacement: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("fournisseurLabel")}</Label>
                <Input
                  value={formData.fournisseur}
                  onChange={(e) => setFormData({ ...formData, fournisseur: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>{t("cancel", { ns: "common" })}</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Mouvement */}
      <Dialog open={isMouvementDialogOpen} onOpenChange={setIsMouvementDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("mvtTitle")}</DialogTitle>
            <DialogDescription>
              {t("mvtDesc", { designation: selectedStock?.designation, qty: selectedStock?.quantiteEnStock, unite: selectedStock?.unite })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>{t("mvtTypeLabel")}</Label>
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
                      {t("mvtEntree")}
                    </div>
                  </SelectItem>
                  <SelectItem value="sortie">
                    <div className="flex items-center gap-2">
                      <ArrowDownCircle className="h-4 w-4 text-red-500" />
                      {t("mvtSortie")}
                    </div>
                  </SelectItem>
                  <SelectItem value="ajustement">
                    <div className="flex items-center gap-2">
                      <Edit className="h-4 w-4 text-blue-500" />
                      {t("mvtAjustement")}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("mvtQtyLabel")}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={mouvementData.quantite}
                onChange={(e) => setMouvementData({ ...mouvementData, quantite: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("motifLabel")}</Label>
              <Input
                value={mouvementData.motif}
                onChange={(e) => setMouvementData({ ...mouvementData, motif: e.target.value })}
                placeholder={t("motifPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("mvtRefLabel")}</Label>
              <Input
                value={mouvementData.reference}
                onChange={(e) => setMouvementData({ ...mouvementData, reference: e.target.value })}
                placeholder={t("mvtRefPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMouvementDialogOpen(false)}>{t("cancel", { ns: "common" })}</Button>
            <Button onClick={handleAdjust} disabled={adjustMutation.isPending}>
              {adjustMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Historique */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("histTitle")}</DialogTitle>
            <DialogDescription>
              {t("histDesc", { designation: selectedStock?.designation, reference: selectedStock?.reference })}
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
                    <th className="text-left p-2">{t("hthDate")}</th>
                    <th className="text-left p-2">{t("hthType")}</th>
                    <th className="text-right p-2">{t("hthQte")}</th>
                    <th className="text-right p-2">{t("hthAvant")}</th>
                    <th className="text-right p-2">{t("hthApres")}</th>
                    <th className="text-left p-2">{t("hthMotif")}</th>
                  </tr>
                </thead>
                <tbody>
                  {mouvements.map((mvt: any) => (
                    <tr key={mvt.id} className="border-t">
                      <td className="p-2 text-sm">{formatDate(mvt.createdAt)}</td>
                      <td className="p-2">
                        <Badge variant={mvt.type === 'entree' ? 'default' : mvt.type === 'sortie' ? 'destructive' : 'secondary'}>
                          {t(`mvtType_${mvt.type}`, { defaultValue: mvt.type })}
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
                {t("histEmpty")}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
