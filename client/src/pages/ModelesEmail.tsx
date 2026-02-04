import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Mail, 
  Eye,
  FileText,
  Star,
  Copy
} from "lucide-react";

const EMAIL_TYPES = [
  { value: "relance_devis", label: "Relance de devis", description: "Pour relancer les clients sur les devis non signés" },
  { value: "envoi_devis", label: "Envoi de devis", description: "Pour envoyer un nouveau devis au client" },
  { value: "envoi_facture", label: "Envoi de facture", description: "Pour envoyer une facture au client" },
  { value: "rappel_paiement", label: "Rappel de paiement", description: "Pour rappeler un paiement en attente" },
  { value: "autre", label: "Autre", description: "Modèle personnalisé" },
];

const VARIABLES_DISPONIBLES = [
  { key: "nom_client", description: "Nom du client" },
  { key: "prenom_client", description: "Prénom du client" },
  { key: "email_client", description: "Email du client" },
  { key: "numero_devis", description: "Numéro du devis" },
  { key: "numero_facture", description: "Numéro de la facture" },
  { key: "montant_ttc", description: "Montant TTC" },
  { key: "date_devis", description: "Date du devis" },
  { key: "date_facture", description: "Date de la facture" },
  { key: "date_echeance", description: "Date d'échéance" },
  { key: "lien_signature", description: "Lien de signature électronique" },
  { key: "lien_paiement", description: "Lien de paiement en ligne" },
  { key: "nom_entreprise", description: "Nom de votre entreprise" },
  { key: "telephone_entreprise", description: "Téléphone de votre entreprise" },
];

interface ModeleEmail {
  id: number;
  nom: string;
  type: string;
  sujet: string;
  contenu: string;
  isDefault: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FormData {
  nom: string;
  type: string;
  sujet: string;
  contenu: string;
  isDefault: boolean;
}

export default function ModelesEmail() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editingModele, setEditingModele] = useState<ModeleEmail | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [formData, setFormData] = useState<FormData>({
    nom: "",
    type: "relance_devis",
    sujet: "",
    contenu: "",
    isDefault: false,
  });

  const { data: modeles, isLoading, refetch } = trpc.modelesEmail.list.useQuery();
  const createMutation = trpc.modelesEmail.create.useMutation({
    onSuccess: () => {
      toast.success("Modèle créé avec succès");
      setIsDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const updateMutation = trpc.modelesEmail.update.useMutation({
    onSuccess: () => {
      toast.success("Modèle mis à jour avec succès");
      setIsDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const deleteMutation = trpc.modelesEmail.delete.useMutation({
    onSuccess: () => {
      toast.success("Modèle supprimé avec succès");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      nom: "",
      type: "relance_devis",
      sujet: "",
      contenu: "",
      isDefault: false,
    });
    setEditingModele(null);
  };

  const handleOpenDialog = (modele?: ModeleEmail) => {
    if (modele) {
      setEditingModele(modele);
      setFormData({
        nom: modele.nom,
        type: modele.type,
        sujet: modele.sujet,
        contenu: modele.contenu,
        isDefault: modele.isDefault || false,
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.nom || !formData.sujet || !formData.contenu) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    if (editingModele) {
      updateMutation.mutate({
        id: editingModele.id,
        nom: formData.nom,
        sujet: formData.sujet,
        contenu: formData.contenu,
        isDefault: formData.isDefault,
      });
    } else {
      createMutation.mutate({
        nom: formData.nom,
        type: formData.type as "relance_devis" | "envoi_devis" | "envoi_facture" | "rappel_paiement" | "autre",
        sujet: formData.sujet,
        contenu: formData.contenu,
        isDefault: formData.isDefault,
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce modèle ?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handlePreview = (modele: ModeleEmail) => {
    // Remplacer les variables par des exemples
    let preview = modele.contenu;
    const exemples: Record<string, string> = {
      nom_client: "Dupont",
      prenom_client: "Jean",
      email_client: "jean.dupont@email.com",
      numero_devis: "DEV-2025-001",
      numero_facture: "FAC-2025-001",
      montant_ttc: "1 250,00 €",
      date_devis: "13/01/2025",
      date_facture: "13/01/2025",
      date_echeance: "13/02/2025",
      lien_signature: "https://example.com/signature/abc123",
      lien_paiement: "https://example.com/paiement/xyz789",
      nom_entreprise: "Mon Entreprise",
      telephone_entreprise: "01 23 45 67 89",
    };
    
    for (const [key, value] of Object.entries(exemples)) {
      preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    
    setPreviewContent(preview);
    setIsPreviewOpen(true);
  };

  const insertVariable = (variable: string) => {
    const newContent = formData.contenu + `{{${variable}}}`;
    setFormData({ ...formData, contenu: newContent });
  };

  const copyVariable = (variable: string) => {
    navigator.clipboard.writeText(`{{${variable}}}`);
    toast.success("Variable copiée dans le presse-papiers");
  };

  const getTypeLabel = (type: string) => {
    return EMAIL_TYPES.find(t => t.value === type)?.label || type;
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "relance_devis": return "bg-orange-100 text-orange-800";
      case "envoi_devis": return "bg-blue-100 text-blue-800";
      case "envoi_facture": return "bg-green-100 text-green-800";
      case "rappel_paiement": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const filteredModeles = modeles?.filter(m => 
    activeTab === "all" || m.type === activeTab
  ) || [];

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
          <h1 className="text-2xl font-bold tracking-tight">Modèles d'emails</h1>
          <p className="text-muted-foreground">
            Gérez vos modèles d'emails personnalisables pour les relances et communications
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau modèle
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Tous</TabsTrigger>
          {EMAIL_TYPES.map(type => (
            <TabsTrigger key={type.value} value={type.value}>
              {type.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredModeles.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Aucun modèle</h3>
                <p className="text-muted-foreground text-center mt-2">
                  Créez votre premier modèle d'email pour personnaliser vos communications
                </p>
                <Button className="mt-4" onClick={() => handleOpenDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Créer un modèle
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Sujet</TableHead>
                    <TableHead>Par défaut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredModeles.map((modele) => (
                    <TableRow key={modele.id}>
                      <TableCell className="font-medium">{modele.nom}</TableCell>
                      <TableCell>
                        <Badge className={getTypeBadgeColor(modele.type)}>
                          {getTypeLabel(modele.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{modele.sujet}</TableCell>
                      <TableCell>
                        {modele.isDefault && (
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePreview(modele)}
                            title="Prévisualiser"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(modele)}
                            title="Modifier"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(modele.id)}
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
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Variables disponibles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Variables disponibles</CardTitle>
          <CardDescription>
            Utilisez ces variables dans vos modèles. Elles seront remplacées automatiquement lors de l'envoi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {VARIABLES_DISPONIBLES.map((variable) => (
              <div
                key={variable.key}
                className="flex items-center justify-between p-2 rounded-md border bg-muted/50 hover:bg-muted cursor-pointer"
                onClick={() => copyVariable(variable.key)}
                title={variable.description}
              >
                <code className="text-sm font-mono">{`{{${variable.key}}}`}</code>
                <Copy className="h-3 w-3 text-muted-foreground" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de création/édition */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingModele ? "Modifier le modèle" : "Nouveau modèle d'email"}
            </DialogTitle>
            <DialogDescription>
              Créez un modèle personnalisable avec des variables dynamiques
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nom">Nom du modèle *</Label>
                <Input
                  id="nom"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  placeholder="Ex: Relance devis standard"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                  disabled={!!editingModele}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sujet">Sujet de l'email *</Label>
              <Input
                id="sujet"
                value={formData.sujet}
                onChange={(e) => setFormData({ ...formData, sujet: e.target.value })}
                placeholder="Ex: Relance - Devis n°{{numero_devis}}"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="contenu">Contenu de l'email *</Label>
                <div className="flex gap-1">
                  {["nom_client", "numero_devis", "montant_ttc", "lien_signature"].map((v) => (
                    <Button
                      key={v}
                      variant="outline"
                      size="sm"
                      onClick={() => insertVariable(v)}
                      className="text-xs"
                    >
                      {v}
                    </Button>
                  ))}
                </div>
              </div>
              <Textarea
                id="contenu"
                value={formData.contenu}
                onChange={(e) => setFormData({ ...formData, contenu: e.target.value })}
                placeholder="Bonjour {{prenom_client}} {{nom_client}},&#10;&#10;Nous vous rappelons que votre devis n°{{numero_devis}} d'un montant de {{montant_ttc}} est en attente de signature.&#10;&#10;Vous pouvez le signer en ligne en cliquant sur le lien suivant : {{lien_signature}}&#10;&#10;Cordialement,&#10;{{nom_entreprise}}"
                rows={10}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
              />
              <Label htmlFor="isDefault">Définir comme modèle par défaut pour ce type</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Annuler
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingModele ? "Mettre à jour" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de prévisualisation */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Prévisualisation
            </DialogTitle>
            <DialogDescription>
              Aperçu du modèle avec des données d'exemple
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 p-4 rounded-md">
            <pre className="whitespace-pre-wrap font-sans text-sm">
              {previewContent}
            </pre>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsPreviewOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
