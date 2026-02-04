import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, FileText, Star, Play, Download, Trash2, Edit, 
  BarChart3, LineChart, PieChart, Table as TableIcon,
  TrendingUp, Users, Package, Wrench, Building2, Calculator
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const TYPES_RAPPORT = [
  { value: "ventes", label: "Ventes", icon: TrendingUp, description: "Analyse des factures et du CA" },
  { value: "clients", label: "Clients", icon: Users, description: "Liste et statistiques clients" },
  { value: "interventions", label: "Interventions", icon: Wrench, description: "Suivi des interventions" },
  { value: "stocks", label: "Stocks", icon: Package, description: "État des stocks et alertes" },
  { value: "techniciens", label: "Techniciens", icon: Users, description: "Performance des techniciens" },
  { value: "financier", label: "Financier", icon: Calculator, description: "Vue financière globale" },
];

const FORMATS_RAPPORT = [
  { value: "tableau", label: "Tableau", icon: TableIcon },
  { value: "graphique", label: "Graphique", icon: BarChart3 },
  { value: "liste", label: "Liste", icon: FileText },
];

const TYPES_GRAPHIQUE = [
  { value: "bar", label: "Barres", icon: BarChart3 },
  { value: "line", label: "Lignes", icon: LineChart },
  { value: "pie", label: "Camembert", icon: PieChart },
  { value: "doughnut", label: "Anneau", icon: PieChart },
];

interface RapportForm {
  nom: string;
  description: string;
  type: string;
  format: string;
  graphiqueType: string;
  dateDebut: string;
  dateFin: string;
}

export default function Rapports() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedRapport, setSelectedRapport] = useState<number | null>(null);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [formData, setFormData] = useState<RapportForm>({
    nom: "",
    description: "",
    type: "ventes",
    format: "tableau",
    graphiqueType: "bar",
    dateDebut: "",
    dateFin: "",
  });

  const { data: rapports, refetch } = trpc.rapports.list.useQuery();
  const { data: resultats, isLoading: loadingResultats } = trpc.rapports.executer.useQuery(
    { 
      rapportId: selectedRapport!, 
      parametres: { dateDebut, dateFin } 
    },
    { enabled: !!selectedRapport }
  );

  const createMutation = trpc.rapports.create.useMutation({
    onSuccess: () => {
      toast.success("Rapport créé avec succès");
      setShowCreateDialog(false);
      setFormData({
        nom: "",
        description: "",
        type: "ventes",
        format: "tableau",
        graphiqueType: "bar",
        dateDebut: "",
        dateFin: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.rapports.delete.useMutation({
    onSuccess: () => {
      toast.success("Rapport supprimé");
      refetch();
    },
  });

  const toggleFavoriMutation = trpc.rapports.toggleFavori.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleCreate = () => {
    createMutation.mutate({
      nom: formData.nom,
      description: formData.description || undefined,
      type: formData.type as "ventes" | "clients" | "interventions" | "stocks" | "fournisseurs" | "techniciens" | "financier",
      format: formData.format as "tableau" | "graphique" | "liste",
      graphiqueType: formData.format === "graphique" ? formData.graphiqueType as "bar" | "line" | "pie" | "doughnut" : undefined,
      filtres: {
        dateDebut: formData.dateDebut || undefined,
        dateFin: formData.dateFin || undefined,
      },
    });
  };

  const exportCSV = () => {
    if (!resultats || !resultats.lignes.length) return;
    
    const headers = resultats.colonnes.join(",");
    const rows = resultats.lignes.map(ligne => 
      resultats.colonnes.map(col => {
        const val = ligne[col];
        if (val instanceof Date) return format(val, "dd/MM/yyyy");
        if (typeof val === "string" && val.includes(",")) return `"${val}"`;
        return val;
      }).join(",")
    );
    
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rapport_${selectedRapport}_${format(new Date(), "yyyyMMdd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Export CSV téléchargé");
  };

  const rapportsFavoris = rapports?.filter(r => r.favori) || [];
  const rapportsRecents = rapports?.slice(0, 5) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rapports Personnalisables</h1>
          <p className="text-muted-foreground">
            Créez et exécutez des rapports sur mesure pour analyser votre activité
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau rapport
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Créer un nouveau rapport</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom du rapport</Label>
                  <Input
                    placeholder="Ex: Ventes mensuelles"
                    value={formData.nom}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type de rapport</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v) => setFormData({ ...formData, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES_RAPPORT.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description (optionnel)</Label>
                <Textarea
                  placeholder="Description du rapport..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Format d'affichage</Label>
                  <Select
                    value={formData.format}
                    onValueChange={(v) => setFormData({ ...formData, format: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMATS_RAPPORT.map((format) => (
                        <SelectItem key={format.value} value={format.value}>
                          <div className="flex items-center gap-2">
                            <format.icon className="h-4 w-4" />
                            {format.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.format === "graphique" && (
                  <div className="space-y-2">
                    <Label>Type de graphique</Label>
                    <Select
                      value={formData.graphiqueType}
                      onValueChange={(v) => setFormData({ ...formData, graphiqueType: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPES_GRAPHIQUE.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className="h-4 w-4" />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date de début (optionnel)</Label>
                  <Input
                    type="date"
                    value={formData.dateDebut}
                    onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date de fin (optionnel)</Label>
                  <Input
                    type="date"
                    value={formData.dateFin}
                    onChange={(e) => setFormData({ ...formData, dateFin: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Annuler
                </Button>
                <Button onClick={handleCreate} disabled={!formData.nom || createMutation.isPending}>
                  {createMutation.isPending ? "Création..." : "Créer le rapport"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="mes-rapports" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mes-rapports">Mes rapports</TabsTrigger>
          <TabsTrigger value="executer">Exécuter</TabsTrigger>
          <TabsTrigger value="modeles">Modèles prédéfinis</TabsTrigger>
        </TabsList>

        <TabsContent value="mes-rapports" className="space-y-4">
          {/* Favoris */}
          {rapportsFavoris.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                  Rapports favoris
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rapportsFavoris.map((rapport) => {
                    const typeInfo = TYPES_RAPPORT.find(t => t.value === rapport.type);
                    return (
                      <Card 
                        key={rapport.id} 
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedRapport(rapport.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              {typeInfo && <typeInfo.icon className="h-5 w-5 text-primary" />}
                              <div>
                                <p className="font-medium">{rapport.nom}</p>
                                <p className="text-xs text-muted-foreground">{typeInfo?.label}</p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavoriMutation.mutate({ id: rapport.id });
                              }}
                            >
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tous les rapports */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tous les rapports</CardTitle>
              <CardDescription>
                {rapports?.length || 0} rapport(s) créé(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rapports && rapports.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Créé le</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rapports.map((rapport) => {
                      const typeInfo = TYPES_RAPPORT.find(t => t.value === rapport.type);
                      const formatInfo = FORMATS_RAPPORT.find(f => f.value === rapport.format);
                      return (
                        <TableRow key={rapport.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {rapport.favori && (
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              )}
                              <span className="font-medium">{rapport.nom}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {typeInfo?.label || rapport.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {formatInfo && <formatInfo.icon className="h-4 w-4" />}
                              {formatInfo?.label || rapport.format}
                            </div>
                          </TableCell>
                          <TableCell>
                            {format(new Date(rapport.createdAt), "dd/MM/yyyy", { locale: fr })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSelectedRapport(rapport.id)}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleFavoriMutation.mutate({ id: rapport.id })}
                              >
                                <Star className={`h-4 w-4 ${rapport.favori ? "text-yellow-500 fill-yellow-500" : ""}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteMutation.mutate({ id: rapport.id })}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Aucun rapport créé</p>
                  <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Créer mon premier rapport
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="executer" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sélection et paramètres */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Paramètres</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Rapport à exécuter</Label>
                  <Select
                    value={selectedRapport?.toString() || ""}
                    onValueChange={(v) => setSelectedRapport(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un rapport" />
                    </SelectTrigger>
                    <SelectContent>
                      {rapports?.map((rapport) => (
                        <SelectItem key={rapport.id} value={rapport.id.toString()}>
                          {rapport.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Date de début</Label>
                  <Input
                    type="date"
                    value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Date de fin</Label>
                  <Input
                    type="date"
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                  />
                </div>

                {resultats && (
                  <Button onClick={exportCSV} className="w-full" variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Exporter en CSV
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Résultats */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-lg">Résultats</CardTitle>
                {resultats && (
                  <CardDescription>
                    {resultats.lignes.length} ligne(s) trouvée(s)
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {loadingResultats ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Chargement...</p>
                  </div>
                ) : resultats ? (
                  <div className="space-y-4">
                    {/* Totaux */}
                    {resultats.totaux && Object.keys(resultats.totaux).length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        {Object.entries(resultats.totaux).map(([key, value]) => (
                          <Card key={key}>
                            <CardContent className="p-4">
                              <p className="text-xs text-muted-foreground capitalize">
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </p>
                              <p className="text-2xl font-bold">
                                {typeof value === 'number' 
                                  ? value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
                                  : value}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}

                    {/* Tableau des résultats */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {resultats.colonnes.map((col) => (
                              <TableHead key={col} className="capitalize">
                                {col.replace(/([A-Z])/g, ' $1').trim()}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resultats.lignes.map((ligne, index) => (
                            <TableRow key={index}>
                              {resultats.colonnes.map((col) => (
                                <TableCell key={col}>
                                  {ligne[col] instanceof Date
                                    ? format(ligne[col] as Date, "dd/MM/yyyy")
                                    : typeof ligne[col] === 'number'
                                    ? (ligne[col] as number).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
                                    : String(ligne[col] ?? '-')}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Sélectionnez un rapport pour voir les résultats
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="modeles" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {TYPES_RAPPORT.map((type) => (
              <Card key={type.value} className="hover:bg-muted/50 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <type.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{type.label}</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {type.description}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            nom: `Rapport ${type.label}`,
                            type: type.value,
                          });
                          setShowCreateDialog(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Créer
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
