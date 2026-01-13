import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Plus, Check, X, Clock, User, CalendarDays } from "lucide-react";
import { toast } from "sonner";

const typeCongeLabels: Record<string, string> = {
  conge_paye: "Congé payé",
  rtt: "RTT",
  maladie: "Maladie",
  sans_solde: "Sans solde",
  formation: "Formation",
  autre: "Autre",
};

const statutColors: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-800",
  approuve: "bg-green-100 text-green-800",
  refuse: "bg-red-100 text-red-800",
  annule: "bg-gray-100 text-gray-800",
};

export default function Conges() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTechnicien, setSelectedTechnicien] = useState<string>("");
  const [typeConge, setTypeConge] = useState<string>("conge_paye");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [motif, setMotif] = useState("");
  const [commentaireRefus, setCommentaireRefus] = useState("");
  const [congeARefuser, setCongeARefuser] = useState<number | null>(null);

  const { data: conges, isLoading, refetch } = trpc.conges.list.useQuery({});
  const { data: congesEnAttente } = trpc.conges.enAttente.useQuery();
  const { data: techniciens } = trpc.techniciens.getAll.useQuery();

  const createConge = trpc.conges.create.useMutation({
    onSuccess: () => {
      toast.success("Demande de congé créée");
      setIsDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const approuverConge = trpc.conges.approuver.useMutation({
    onSuccess: () => {
      toast.success("Congé approuvé");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const refuserConge = trpc.conges.refuser.useMutation({
    onSuccess: () => {
      toast.success("Congé refusé");
      setCongeARefuser(null);
      setCommentaireRefus("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setSelectedTechnicien("");
    setTypeConge("conge_paye");
    setDateDebut("");
    setDateFin("");
    setMotif("");
  };

  const handleSubmit = () => {
    if (!selectedTechnicien || !dateDebut || !dateFin) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }
    createConge.mutate({
      technicienId: parseInt(selectedTechnicien),
      type: typeConge as any,
      dateDebut,
      dateFin,
      motif: motif || undefined,
    });
  };

  const getTechnicienNom = (technicienId: number) => {
    const tech = techniciens?.find((t: { id: number; prenom: string | null; nom: string | null }) => t.id === technicienId);
    return tech ? `${tech.prenom || ''} ${tech.nom || ''}` : "Inconnu";
  };

  const calculerJours = (debut: string, fin: string) => {
    const d1 = new Date(debut);
    const d2 = new Date(fin);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Gestion des Congés</h1>
          <p className="text-muted-foreground">Gérez les demandes de congés de vos techniciens</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle demande
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Nouvelle demande de congé</DialogTitle>
              <DialogDescription>
                Créez une demande de congé pour un technicien
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Technicien *</Label>
                <Select value={selectedTechnicien} onValueChange={setSelectedTechnicien}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un technicien" />
                  </SelectTrigger>
                  <SelectContent>
                    {techniciens?.map((tech: { id: number; prenom: string | null; nom: string | null }) => (
                      <SelectItem key={tech.id} value={tech.id.toString()}>
                        {tech.prenom} {tech.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Type de congé *</Label>
                <Select value={typeConge} onValueChange={setTypeConge}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeCongeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Date de début *</Label>
                  <Input
                    type="date"
                    value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Date de fin *</Label>
                  <Input
                    type="date"
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                  />
                </div>
              </div>
              {dateDebut && dateFin && (
                <p className="text-sm text-muted-foreground">
                  Durée : {calculerJours(dateDebut, dateFin)} jour(s)
                </p>
              )}
              <div className="grid gap-2">
                <Label>Motif</Label>
                <Textarea
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Motif de la demande (optionnel)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleSubmit} disabled={createConge.isPending}>
                {createConge.isPending ? "Création..." : "Créer la demande"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Demandes en attente */}
      {congesEnAttente && congesEnAttente.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <Clock className="h-5 w-5" />
              Demandes en attente ({congesEnAttente.length})
            </CardTitle>
            <CardDescription>Ces demandes nécessitent votre validation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {congesEnAttente.map((conge) => (
                <div key={conge.id} className="flex items-center justify-between p-4 bg-white rounded-lg border">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{getTechnicienNom(conge.technicienId)}</p>
                      <p className="text-sm text-muted-foreground">
                        {typeCongeLabels[conge.type]} • {new Date(conge.dateDebut).toLocaleDateString('fr-FR')} au {new Date(conge.dateFin).toLocaleDateString('fr-FR')}
                      </p>
                      {conge.motif && (
                        <p className="text-sm text-muted-foreground mt-1">Motif : {conge.motif}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => setCongeARefuser(conge.id)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Refuser
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => approuverConge.mutate({ id: conge.id })}
                      disabled={approuverConge.isPending}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approuver
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de refus */}
      <Dialog open={congeARefuser !== null} onOpenChange={() => setCongeARefuser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser la demande</DialogTitle>
            <DialogDescription>
              Indiquez la raison du refus (optionnel)
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={commentaireRefus}
            onChange={(e) => setCommentaireRefus(e.target.value)}
            placeholder="Raison du refus..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCongeARefuser(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (congeARefuser) {
                  refuserConge.mutate({ id: congeARefuser, commentaire: commentaireRefus || undefined });
                }
              }}
              disabled={refuserConge.isPending}
            >
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Liste des congés */}
      <Tabs defaultValue="tous">
        <TabsList>
          <TabsTrigger value="tous">Tous</TabsTrigger>
          <TabsTrigger value="approuve">Approuvés</TabsTrigger>
          <TabsTrigger value="refuse">Refusés</TabsTrigger>
        </TabsList>

        <TabsContent value="tous" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Historique des congés</CardTitle>
            </CardHeader>
            <CardContent>
              {conges && conges.length > 0 ? (
                <div className="space-y-4">
                  {conges.map((conge) => (
                    <div key={conge.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <CalendarDays className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{getTechnicienNom(conge.technicienId)}</p>
                          <p className="text-sm text-muted-foreground">
                            {typeCongeLabels[conge.type]} • {new Date(conge.dateDebut).toLocaleDateString('fr-FR')} au {new Date(conge.dateFin).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      </div>
                      <Badge className={statutColors[conge.statut || 'en_attente']}>
                        {conge.statut === 'en_attente' ? 'En attente' : 
                         conge.statut === 'approuve' ? 'Approuvé' :
                         conge.statut === 'refuse' ? 'Refusé' : 'Annulé'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aucun congé enregistré</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approuve" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {conges?.filter(c => c.statut === 'approuve').length ? (
                <div className="space-y-4">
                  {conges.filter(c => c.statut === 'approuve').map((conge) => (
                    <div key={conge.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                          <Check className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium">{getTechnicienNom(conge.technicienId)}</p>
                          <p className="text-sm text-muted-foreground">
                            {typeCongeLabels[conge.type]} • {new Date(conge.dateDebut).toLocaleDateString('fr-FR')} au {new Date(conge.dateFin).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-800">Approuvé</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-muted-foreground">Aucun congé approuvé</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refuse" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {conges?.filter(c => c.statut === 'refuse').length ? (
                <div className="space-y-4">
                  {conges.filter(c => c.statut === 'refuse').map((conge) => (
                    <div key={conge.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                          <X className="h-5 w-5 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium">{getTechnicienNom(conge.technicienId)}</p>
                          <p className="text-sm text-muted-foreground">
                            {typeCongeLabels[conge.type]} • {new Date(conge.dateDebut).toLocaleDateString('fr-FR')} au {new Date(conge.dateFin).toLocaleDateString('fr-FR')}
                          </p>
                          {conge.commentaireValidation && (
                            <p className="text-sm text-red-600 mt-1">Raison : {conge.commentaireValidation}</p>
                          )}
                        </div>
                      </div>
                      <Badge className="bg-red-100 text-red-800">Refusé</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-muted-foreground">Aucun congé refusé</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
