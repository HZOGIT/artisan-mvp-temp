import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Plus, Pencil, Trash2, Phone, Mail, Wrench, Calendar, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface TechnicienForm {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  specialite: string;
  couleur: string;
  coutHoraire: string;
  statut: "actif" | "inactif" | "conge";
}

const initialForm: TechnicienForm = {
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  specialite: "",
  couleur: "#3b82f6",
  coutHoraire: "",
  statut: "actif",
};

const couleurs = [
  { value: "#3b82f6", label: "Bleu" },
  { value: "#10b981", label: "Vert" },
  { value: "#f59e0b", label: "Orange" },
  { value: "#ef4444", label: "Rouge" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Rose" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#84cc16", label: "Lime" },
];

export default function Techniciens() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TechnicienForm>(initialForm);
  const [selectedTechnicien, setSelectedTechnicien] = useState<number | null>(null);
  const [habilForm, setHabilForm] = useState({ type: "", numero: "", organisme: "", dateObtention: "", dateExpiration: "" });

  const { data: techniciens, refetch } = trpc.techniciens.getAll.useQuery();
  const { data: stats } = trpc.techniciens.getStats.useQuery(
    { technicienId: selectedTechnicien! },
    { enabled: !!selectedTechnicien }
  );
  const { data: habilitations, refetch: refetchHabil } = trpc.techniciens.getHabilitations.useQuery(
    { technicienId: selectedTechnicien! },
    { enabled: !!selectedTechnicien }
  );

  const addHabilMutation = trpc.techniciens.addHabilitation.useMutation({
    onSuccess: () => {
      toast.success("Habilitation ajoutée");
      setHabilForm({ type: "", numero: "", organisme: "", dateObtention: "", dateExpiration: "" });
      refetchHabil();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteHabilMutation = trpc.techniciens.deleteHabilitation.useMutation({
    onSuccess: () => {
      toast.success("Habilitation supprimée");
      refetchHabil();
    },
    onError: (error) => toast.error(error.message),
  });

  const createMutation = trpc.techniciens.create.useMutation({
    onSuccess: () => {
      toast.success("Technicien créé avec succès");
      setIsDialogOpen(false);
      setForm(initialForm);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.techniciens.update.useMutation({
    onSuccess: () => {
      toast.success("Technicien mis à jour");
      setIsDialogOpen(false);
      setEditingId(null);
      setForm(initialForm);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.techniciens.delete.useMutation({
    onSuccess: () => {
      toast.success("Technicien supprimé");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // `coutHoraire` vide -> undefined : l'input serveur est un decimal validé (rejette "").
    const payload = { ...form, coutHoraire: form.coutHoraire || undefined };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (technicien: typeof techniciens extends (infer T)[] | undefined ? T : never) => {
    if (!technicien) return;
    setEditingId(technicien.id);
    setForm({
      nom: technicien.nom,
      prenom: technicien.prenom || "",
      email: technicien.email || "",
      telephone: technicien.telephone || "",
      specialite: technicien.specialite || "",
      couleur: technicien.couleur || "#3b82f6",
      coutHoraire: (technicien as any).coutHoraire != null ? String((technicien as any).coutHoraire) : "",
      statut: technicien.statut as "actif" | "inactif" | "conge",
    });
    setIsDialogOpen(true);
  };

  const getStatutBadge = (statut: string | null) => {
    switch (statut) {
      case "actif":
        return <Badge className="bg-green-500">Actif</Badge>;
      case "inactif":
        return <Badge variant="secondary">Inactif</Badge>;
      case "conge":
        return <Badge className="bg-orange-500">En congé</Badge>;
      default:
        return <Badge variant="outline">Inconnu</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Gestion de l'équipe
          </h1>
          <p className="text-muted-foreground">
            Gérez vos techniciens et assignez-les aux interventions
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingId(null);
            setForm(initialForm);
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau technicien
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Modifier le technicien" : "Nouveau technicien"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nom">Nom *</Label>
                  <Input
                    id="nom"
                    value={form.nom}
                    onChange={(e) => setForm({ ...form, nom: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prenom">Prénom</Label>
                  <Input
                    id="prenom"
                    value={form.prenom}
                    onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telephone">Téléphone</Label>
                  <Input
                    id="telephone"
                    value={form.telephone}
                    onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialite">Spécialité</Label>
                <Input
                  id="specialite"
                  value={form.specialite}
                  onChange={(e) => setForm({ ...form, specialite: e.target.value })}
                  placeholder="Ex: Plomberie, Électricité..."
                />
              </div>
              {/* Coût horaire chargé (OPE-123) — base du coût main-d'œuvre des chantiers */}
              <div className="space-y-2">
                <Label htmlFor="coutHoraire">Coût horaire chargé (€/h)</Label>
                <Input
                  id="coutHoraire"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.coutHoraire}
                  onChange={(e) => setForm({ ...form, coutHoraire: e.target.value })}
                  placeholder="Ex: 35.00 (optionnel)"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Couleur</Label>
                  <Select
                    value={form.couleur}
                    onValueChange={(value) => setForm({ ...form, couleur: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {couleurs.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: c.value }}
                            />
                            {c.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Statut</Label>
                  <Select
                    value={form.statut}
                    onValueChange={(value: "actif" | "inactif" | "conge") =>
                      setForm({ ...form, statut: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="actif">Actif</SelectItem>
                      <SelectItem value="inactif">Inactif</SelectItem>
                      <SelectItem value="conge">En congé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Mettre à jour" : "Créer"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des techniciens */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Équipe ({techniciens?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {techniciens?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Aucun technicien. Ajoutez votre premier membre d'équipe.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Technicien</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Spécialité</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {techniciens?.map((tech) => (
                    <TableRow
                      key={tech.id}
                      className={`cursor-pointer ${selectedTechnicien === tech.id ? "bg-muted" : ""}`}
                      onClick={() => setSelectedTechnicien(tech.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tech.couleur || "#3b82f6" }}
                          />
                          <div>
                            <p className="font-medium">
                              {tech.prenom} {tech.nom}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {tech.email && (
                            <p className="text-sm flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {tech.email}
                            </p>
                          )}
                          {tech.telephone && (
                            <p className="text-sm flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {tech.telephone}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {tech.specialite && (
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            <Wrench className="h-3 w-3" />
                            {tech.specialite}
                          </Badge>
                        )}
                        {(tech as any).coutHoraire != null && (tech as any).coutHoraire !== "" && (
                          <span className="text-xs text-muted-foreground block mt-1">
                            {Number((tech as any).coutHoraire).toFixed(2)} €/h
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getStatutBadge(tech.statut)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(tech);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Supprimer ce technicien ?")) {
                                deleteMutation.mutate({ id: tech.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Statistiques du technicien sélectionné */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Statistiques
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedTechnicien && stats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-sm text-muted-foreground">Total</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{stats.terminees}</p>
                    <p className="text-sm text-muted-foreground">Terminées</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{stats.enCours}</p>
                    <p className="text-sm text-muted-foreground">En cours</p>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <p className="text-2xl font-bold text-orange-600">{stats.planifiees}</p>
                    <p className="text-sm text-muted-foreground">Planifiées</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Sélectionnez un technicien pour voir ses statistiques
              </div>
            )}
          </CardContent>
        </Card>

        {/* Habilitations / certifications du technicien sélectionné (OPE-162) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Habilitations & certifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedTechnicien ? (
              <div className="text-center py-8 text-muted-foreground">
                Sélectionnez un technicien pour gérer ses habilitations
              </div>
            ) : (
              <div className="space-y-4">
                {/* Liste */}
                {habilitations && habilitations.length > 0 ? (
                  <div className="space-y-2">
                    {habilitations.map((h) => {
                      const exp = h.dateExpiration ? new Date(h.dateExpiration) : null;
                      const valid = exp && !isNaN(exp.getTime());
                      const joursRestants = valid ? Math.ceil((exp!.getTime() - Date.now()) / 86400000) : null;
                      let badge: { label: string; variant: "default" | "secondary" | "destructive" | "outline" } = { label: "Sans échéance", variant: "outline" };
                      if (joursRestants != null) {
                        if (joursRestants < 0) badge = { label: "Expirée", variant: "destructive" };
                        else if (joursRestants <= 60) badge = { label: `Expire dans ${joursRestants} j`, variant: "secondary" };
                        else badge = { label: "Valide", variant: "default" };
                      }
                      return (
                        <div key={h.id} className="flex items-start justify-between gap-2 p-3 border rounded-lg">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{h.type}</span>
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                              {h.numero && <p>N° {h.numero}</p>}
                              {h.organisme && <p>Organisme : {h.organisme}</p>}
                              {valid && <p>Échéance : {exp!.toLocaleDateString("fr-FR")}</p>}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Supprimer cette habilitation ?")) {
                                deleteHabilMutation.mutate({ technicienId: selectedTechnicien, id: h.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune habilitation enregistrée.</p>
                )}

                {/* Formulaire d'ajout */}
                <form
                  className="space-y-2 border-t pt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!habilForm.type.trim()) {
                      toast.error("Le type d'habilitation est requis");
                      return;
                    }
                    addHabilMutation.mutate({
                      technicienId: selectedTechnicien,
                      type: habilForm.type.trim(),
                      numero: habilForm.numero.trim() || undefined,
                      organisme: habilForm.organisme.trim() || undefined,
                      dateObtention: habilForm.dateObtention || undefined,
                      dateExpiration: habilForm.dateExpiration || undefined,
                    });
                  }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Type *</Label>
                      <Input
                        value={habilForm.type}
                        onChange={(e) => setHabilForm({ ...habilForm, type: e.target.value })}
                        placeholder="Habilitation électrique B1V…"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">N°</Label>
                      <Input
                        value={habilForm.numero}
                        onChange={(e) => setHabilForm({ ...habilForm, numero: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Organisme</Label>
                      <Input
                        value={habilForm.organisme}
                        onChange={(e) => setHabilForm({ ...habilForm, organisme: e.target.value })}
                        placeholder="APAVE, Qualibat…"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Obtention</Label>
                      <Input
                        type="date"
                        value={habilForm.dateObtention}
                        onChange={(e) => setHabilForm({ ...habilForm, dateObtention: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Expiration</Label>
                      <Input
                        type="date"
                        value={habilForm.dateExpiration}
                        onChange={(e) => setHabilForm({ ...habilForm, dateExpiration: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm" disabled={addHabilMutation.isPending}>
                    <Plus className="h-4 w-4 mr-1" />
                    Ajouter
                  </Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
