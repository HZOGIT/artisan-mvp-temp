import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  TrendingUp, 
  TrendingDown,
  Clock,
  Package,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Plus,
  Eye,
  Truck
} from "lucide-react";

interface PerformanceFournisseur {
  fournisseur: {
    id: number;
    nom: string;
    contact: string | null;
    email: string | null;
    telephone: string | null;
  };
  totalCommandes: number;
  commandesLivrees: number;
  commandesEnRetard: number;
  delaiMoyenLivraison: number | null;
  tauxFiabilite: number;
  montantTotal: number;
}

interface CommandeFournisseur {
  id: number;
  reference: string | null;
  dateCommande: Date;
  dateLivraisonPrevue: Date | null;
  dateLivraisonReelle: Date | null;
  statut: string | null;
  montantTotal: string | null;
  notes: string | null;
  fournisseur?: {
    nom: string;
  };
}

export default function PerformancesFournisseurs() {
  const [selectedFournisseur, setSelectedFournisseur] = useState<PerformanceFournisseur | null>(null);
  const [isCommandeDialogOpen, setIsCommandeDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [commandeForm, setCommandeForm] = useState({
    fournisseurId: 0,
    reference: "",
    dateLivraisonPrevue: "",
    notes: "",
  });

  const { data: performances, isLoading } = trpc.commandesFournisseurs.getPerformances.useQuery();
  const { data: commandes, refetch: refetchCommandes } = trpc.commandesFournisseurs.list.useQuery();
  const { data: fournisseurs } = trpc.fournisseurs.list.useQuery();
  
  const createCommandeMutation = trpc.commandesFournisseurs.create.useMutation({
    onSuccess: () => {
      toast.success("Commande créée avec succès");
      setIsCommandeDialogOpen(false);
      refetchCommandes();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateStatutMutation = trpc.commandesFournisseurs.updateStatut.useMutation({
    onSuccess: () => {
      toast.success("Statut mis à jour");
      refetchCommandes();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("fr-FR");
  };

  const getStatutBadge = (statut: string | null) => {
    switch (statut) {
      case "en_attente":
        return <Badge variant="outline">En attente</Badge>;
      case "confirmee":
        return <Badge className="bg-blue-100 text-blue-800">Confirmée</Badge>;
      case "expediee":
        return <Badge className="bg-purple-100 text-purple-800">Expédiée</Badge>;
      case "livree":
        return <Badge className="bg-green-100 text-green-800">Livrée</Badge>;
      case "annulee":
        return <Badge variant="destructive">Annulée</Badge>;
      default:
        return <Badge variant="outline">{statut}</Badge>;
    }
  };

  const getFiabiliteColor = (taux: number) => {
    if (taux >= 90) return "text-green-600";
    if (taux >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getFiabiliteIcon = (taux: number) => {
    if (taux >= 90) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (taux >= 70) return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    return <TrendingDown className="h-4 w-4 text-red-600" />;
  };

  const handleCreateCommande = () => {
    if (!commandeForm.fournisseurId) {
      toast.error("Veuillez sélectionner un fournisseur");
      return;
    }
    createCommandeMutation.mutate({
      fournisseurId: commandeForm.fournisseurId,
      reference: commandeForm.reference || undefined,
      dateLivraisonPrevue: commandeForm.dateLivraisonPrevue || undefined,
      notes: commandeForm.notes || undefined,
      lignes: [],
    });
  };

  const handleUpdateStatut = (commandeId: number, statut: string) => {
    const updateData: { id: number; statut: "en_attente" | "confirmee" | "expediee" | "livree" | "annulee"; dateLivraisonReelle?: string } = {
      id: commandeId,
      statut: statut as "en_attente" | "confirmee" | "expediee" | "livree" | "annulee",
    };
    
    if (statut === "livree") {
      updateData.dateLivraisonReelle = new Date().toISOString();
    }
    
    updateStatutMutation.mutate(updateData);
  };

  // Calculs des statistiques globales
  const totalCommandes = performances?.reduce((sum, p) => sum + p.totalCommandes, 0) || 0;
  const totalLivrees = performances?.reduce((sum, p) => sum + p.commandesLivrees, 0) || 0;
  const totalEnRetard = performances?.reduce((sum, p) => sum + p.commandesEnRetard, 0) || 0;
  const montantTotalGlobal = performances?.reduce((sum, p) => sum + p.montantTotal, 0) || 0;
  const tauxFiabiliteGlobal = totalCommandes > 0 
    ? Math.round(((totalLivrees - totalEnRetard) / totalCommandes) * 100)
    : 100;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performances Fournisseurs</h1>
          <p className="text-muted-foreground">
            Suivez les délais de livraison et la fiabilité de vos fournisseurs
          </p>
        </div>
        <Button onClick={() => setIsCommandeDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle commande
        </Button>
      </div>

      {/* Statistiques globales */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commandes</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCommandes}</div>
            <p className="text-xs text-muted-foreground">
              {totalLivrees} livrées
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taux de Fiabilité</CardTitle>
            {getFiabiliteIcon(tauxFiabiliteGlobal)}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getFiabiliteColor(tauxFiabiliteGlobal)}`}>
              {tauxFiabiliteGlobal}%
            </div>
            <Progress value={tauxFiabiliteGlobal} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commandes en Retard</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{totalEnRetard}</div>
            <p className="text-xs text-muted-foreground">
              {totalCommandes > 0 ? Math.round((totalEnRetard / totalCommandes) * 100) : 0}% du total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Montant Total</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(montantTotalGlobal)}</div>
            <p className="text-xs text-muted-foreground">
              Toutes commandes confondues
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tableau des performances par fournisseur */}
      <Card>
        <CardHeader>
          <CardTitle>Performance par Fournisseur</CardTitle>
          <CardDescription>
            Analyse détaillée des délais et de la fiabilité de chaque fournisseur
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!performances || performances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune donnée de performance disponible</p>
              <p className="text-sm">Créez des commandes fournisseurs pour commencer le suivi</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead className="text-center">Commandes</TableHead>
                  <TableHead className="text-center">Livrées</TableHead>
                  <TableHead className="text-center">En retard</TableHead>
                  <TableHead className="text-center">Délai moyen</TableHead>
                  <TableHead className="text-center">Fiabilité</TableHead>
                  <TableHead className="text-right">Montant total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performances.map((perf) => (
                  <TableRow key={perf.fournisseur.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{perf.fournisseur.nom}</div>
                        {perf.fournisseur.email && (
                          <div className="text-sm text-muted-foreground">{perf.fournisseur.email}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{perf.totalCommandes}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-green-600">{perf.commandesLivrees}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={perf.commandesEnRetard > 0 ? "text-red-600" : ""}>
                        {perf.commandesEnRetard}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {perf.delaiMoyenLivraison !== null ? (
                        <span className="flex items-center justify-center gap-1">
                          <Clock className="h-3 w-3" />
                          {perf.delaiMoyenLivraison} jours
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        {getFiabiliteIcon(perf.tauxFiabilite)}
                        <span className={getFiabiliteColor(perf.tauxFiabilite)}>
                          {perf.tauxFiabilite}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(perf.montantTotal)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedFournisseur(perf);
                          setIsDetailDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dernières commandes */}
      <Card>
        <CardHeader>
          <CardTitle>Dernières Commandes</CardTitle>
          <CardDescription>
            Historique des commandes fournisseurs récentes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!commandes || commandes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune commande enregistrée</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Date commande</TableHead>
                  <TableHead>Livraison prévue</TableHead>
                  <TableHead>Livraison réelle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commandes.slice(0, 10).map((commande) => (
                  <TableRow key={commande.id}>
                    <TableCell className="font-medium">
                      {commande.reference || `CMD-${commande.id}`}
                    </TableCell>
                    <TableCell>{formatDate(commande.dateCommande)}</TableCell>
                    <TableCell>{formatDate(commande.dateLivraisonPrevue)}</TableCell>
                    <TableCell>{formatDate(commande.dateLivraisonReelle)}</TableCell>
                    <TableCell>{getStatutBadge(commande.statut)}</TableCell>
                    <TableCell className="text-right">
                      {commande.montantTotal ? formatCurrency(Number(commande.montantTotal)) : "-"}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={commande.statut || "en_attente"}
                        onValueChange={(value) => handleUpdateStatut(commande.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en_attente">En attente</SelectItem>
                          <SelectItem value="confirmee">Confirmée</SelectItem>
                          <SelectItem value="expediee">Expédiée</SelectItem>
                          <SelectItem value="livree">Livrée</SelectItem>
                          <SelectItem value="annulee">Annulée</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog nouvelle commande */}
      <Dialog open={isCommandeDialogOpen} onOpenChange={setIsCommandeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle Commande Fournisseur</DialogTitle>
            <DialogDescription>
              Enregistrez une nouvelle commande pour suivre les performances
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fournisseur *</Label>
              <Select
                value={commandeForm.fournisseurId.toString()}
                onValueChange={(value) => setCommandeForm({ ...commandeForm, fournisseurId: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un fournisseur" />
                </SelectTrigger>
                <SelectContent>
                  {fournisseurs?.map((f) => (
                    <SelectItem key={f.id} value={f.id.toString()}>
                      {f.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Référence</Label>
              <Input
                value={commandeForm.reference}
                onChange={(e) => setCommandeForm({ ...commandeForm, reference: e.target.value })}
                placeholder="Ex: CMD-2025-001"
              />
            </div>
            <div className="space-y-2">
              <Label>Date de livraison prévue</Label>
              <Input
                type="date"
                value={commandeForm.dateLivraisonPrevue}
                onChange={(e) => setCommandeForm({ ...commandeForm, dateLivraisonPrevue: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={commandeForm.notes}
                onChange={(e) => setCommandeForm({ ...commandeForm, notes: e.target.value })}
                placeholder="Notes sur la commande..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCommandeDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateCommande} disabled={createCommandeMutation.isPending}>
              Créer la commande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog détails fournisseur */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Détails - {selectedFournisseur?.fournisseur.nom}
            </DialogTitle>
            <DialogDescription>
              Informations détaillées sur les performances de ce fournisseur
            </DialogDescription>
          </DialogHeader>
          {selectedFournisseur && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <div className="text-2xl font-bold">{selectedFournisseur.commandesLivrees}</div>
                        <div className="text-sm text-muted-foreground">Commandes livrées</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-500" />
                      <div>
                        <div className="text-2xl font-bold">{selectedFournisseur.commandesEnRetard}</div>
                        <div className="text-sm text-muted-foreground">Livraisons en retard</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Taux de fiabilité</span>
                  <span className={getFiabiliteColor(selectedFournisseur.tauxFiabilite)}>
                    {selectedFournisseur.tauxFiabilite}%
                  </span>
                </div>
                <Progress value={selectedFournisseur.tauxFiabilite} />
              </div>

              {selectedFournisseur.delaiMoyenLivraison !== null && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  <span>Délai moyen de livraison : <strong>{selectedFournisseur.delaiMoyenLivraison} jours</strong></span>
                </div>
              )}

              <div className="border-t pt-4">
                <div className="text-sm text-muted-foreground">Contact</div>
                <div className="mt-2 space-y-1">
                  {selectedFournisseur.fournisseur.contact && (
                    <div>{selectedFournisseur.fournisseur.contact}</div>
                  )}
                  {selectedFournisseur.fournisseur.email && (
                    <div className="text-blue-600">{selectedFournisseur.fournisseur.email}</div>
                  )}
                  {selectedFournisseur.fournisseur.telephone && (
                    <div>{selectedFournisseur.fournisseur.telephone}</div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsDetailDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
