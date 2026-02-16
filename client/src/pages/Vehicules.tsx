import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Car, Wrench, Shield, Gauge, Calendar, AlertTriangle, Edit, Trash2 } from "lucide-react";

export default function Vehicules() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedVehicule, setSelectedVehicule] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("liste");

  const { data: vehicules, refetch } = trpc.vehicules.list.useQuery();
  const { data: techniciens } = trpc.techniciens.getAll.useQuery();
  const { data: stats } = trpc.vehicules.getStatistiquesFlotte.useQuery();
  const { data: assurancesExpirant } = trpc.vehicules.getAssurancesExpirant.useQuery();
  const { data: entretiensAVenir } = trpc.vehicules.getEntretiensAVenir.useQuery();

  const createMutation = trpc.vehicules.create.useMutation({
    onSuccess: () => {
      toast.success("Véhicule ajouté");
      refetch();
      setIsDialogOpen(false);
    },
  });

  const deleteMutation = trpc.vehicules.delete.useMutation({
    onSuccess: () => {
      toast.success("Véhicule supprimé");
      refetch();
    },
  });

  const [formData, setFormData] = useState({
    immatriculation: "",
    marque: "",
    modele: "",
    annee: new Date().getFullYear(),
    typeCarburant: "diesel" as const,
    kilometrageActuel: 0,
    technicienId: undefined as number | undefined,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case "actif":
        return <Badge className="bg-green-500">Actif</Badge>;
      case "en_maintenance":
        return <Badge className="bg-yellow-500">En maintenance</Badge>;
      case "hors_service":
        return <Badge className="bg-red-500">Hors service</Badge>;
      case "vendu":
        return <Badge variant="secondary">Vendu</Badge>;
      default:
        return <Badge>{statut}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Véhicules</h1>
          <p className="text-muted-foreground">Gérez votre flotte de véhicules</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un véhicule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau véhicule</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Immatriculation</Label>
                  <Input
                    value={formData.immatriculation}
                    onChange={(e) => setFormData({ ...formData, immatriculation: e.target.value })}
                    placeholder="AA-123-BB"
                    required
                  />
                </div>
                <div>
                  <Label>Marque</Label>
                  <Input
                    value={formData.marque}
                    onChange={(e) => setFormData({ ...formData, marque: e.target.value })}
                    placeholder="Renault"
                  />
                </div>
                <div>
                  <Label>Modèle</Label>
                  <Input
                    value={formData.modele}
                    onChange={(e) => setFormData({ ...formData, modele: e.target.value })}
                    placeholder="Kangoo"
                  />
                </div>
                <div>
                  <Label>Année</Label>
                  <Input
                    type="number"
                    value={formData.annee}
                    onChange={(e) => setFormData({ ...formData, annee: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Carburant</Label>
                  <Select
                    value={formData.typeCarburant}
                    onValueChange={(v) => setFormData({ ...formData, typeCarburant: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="essence">Essence</SelectItem>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="electrique">Électrique</SelectItem>
                      <SelectItem value="hybride">Hybride</SelectItem>
                      <SelectItem value="gpl">GPL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Kilométrage</Label>
                  <Input
                    type="number"
                    value={formData.kilometrageActuel}
                    onChange={(e) => setFormData({ ...formData, kilometrageActuel: parseInt(e.target.value) })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Technicien assigné</Label>
                  <Select
                    value={formData.technicienId?.toString() || ""}
                    onValueChange={(v) => setFormData({ ...formData, technicienId: v ? parseInt(v) : undefined })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Aucun</SelectItem>
                      {techniciens?.map((t: any) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.prenom} {t.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                Ajouter
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Car className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total véhicules</p>
                <p className="text-2xl font-bold">{stats?.totalVehicules || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Gauge className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Km total</p>
                <p className="text-2xl font-bold">{(stats?.kilometrageTotal || 0).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Wrench className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Entretiens à venir</p>
                <p className="text-2xl font-bold">{stats?.entretiensAVenir || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-lg">
                <Shield className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Assurances expirant</p>
                <p className="text-2xl font-bold">{stats?.assurancesExpirant || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertes */}
      {((assurancesExpirant && assurancesExpirant.length > 0) || (entretiensAVenir && entretiensAVenir.length > 0)) && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-5 w-5" />
              Alertes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {assurancesExpirant?.map((a: any) => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-red-500" />
                <span>
                  Assurance {a.vehicule?.immatriculation} expire le{" "}
                  {new Date(a.dateFin).toLocaleDateString("fr-FR")}
                </span>
              </div>
            ))}
            {entretiensAVenir?.map((e: any) => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <Wrench className="h-4 w-4 text-yellow-500" />
                <span>
                  {e.type} prévu pour {e.vehicule?.immatriculation} le{" "}
                  {e.prochainEntretienDate && new Date(e.prochainEntretienDate).toLocaleDateString("fr-FR")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Liste des véhicules */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="liste">Liste</TabsTrigger>
          <TabsTrigger value="entretiens">Entretiens</TabsTrigger>
          <TabsTrigger value="assurances">Assurances</TabsTrigger>
        </TabsList>

        <TabsContent value="liste" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicules?.map((vehicule) => (
              <Card key={vehicule.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{vehicule.immatriculation}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {vehicule.marque} {vehicule.modele} ({vehicule.annee})
                      </p>
                    </div>
                    {getStatutBadge(vehicule.statut || "actif")}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Kilométrage</span>
                      <span className="font-medium">{(vehicule.kilometrageActuel || 0).toLocaleString()} km</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Carburant</span>
                      <span className="font-medium capitalize">{vehicule.typeCarburant}</span>
                    </div>
                    {vehicule.technicienId && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Assigné à</span>
                        <span className="font-medium">
                          {techniciens?.find((t: any) => t.id === vehicule.technicienId)?.prenom || "N/A"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Edit className="h-4 w-4 mr-1" />
                      Modifier
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-500"
                      onClick={() => deleteMutation.mutate({ id: vehicule.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {(!vehicules || vehicules.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucun véhicule enregistré</p>
              <p className="text-sm">Ajoutez votre premier véhicule pour commencer</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="entretiens" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Historique des entretiens</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">
                Sélectionnez un véhicule pour voir son historique d'entretiens
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assurances" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Contrats d'assurance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">
                Sélectionnez un véhicule pour voir ses contrats d'assurance
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
