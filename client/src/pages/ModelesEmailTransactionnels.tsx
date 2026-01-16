import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit2, Trash2, Eye, Save, X } from "lucide-react";
import { toast } from "sonner";
import { BulletproofModal } from "@/components/BulletproofModal";

interface ModeleEmail {
  id: number;
  nom: string;
  sujet: string;
  contenu: string;
  variables: string;
  type: "relance" | "confirmation" | "rappel" | "autre";
  createdAt: Date;
}

const VARIABLES_DISPONIBLES = [
  { code: "{{nomClient}}", description: "Nom du client" },
  { code: "{{prenomClient}}", description: "Prénom du client" },
  { code: "{{numeroDevis}}", description: "Numéro du devis" },
  { code: "{{numeroFacture}}", description: "Numéro de la facture" },
  { code: "{{montant}}", description: "Montant TTC" },
  { code: "{{dateEcheance}}", description: "Date d'échéance" },
  { code: "{{nomEntreprise}}", description: "Nom de l'entreprise" },
  { code: "{{telephoneEntreprise}}", description: "Téléphone de l'entreprise" },
  { code: "{{emailEntreprise}}", description: "Email de l'entreprise" },
];

const MODELES_PAR_DEFAUT = [
  {
    nom: "Relance Devis",
    type: "relance" as const,
    sujet: "Relance - Devis {{numeroDevis}}",
    contenu: `Bonjour {{prenomClient}},

Nous vous relançons concernant le devis {{numeroDevis}} d'un montant de {{montant}} €.

Pouvez-vous nous confirmer votre intérêt ?

Cordialement,
{{nomEntreprise}}`,
  },
  {
    nom: "Confirmation Facture",
    type: "confirmation" as const,
    sujet: "Facture {{numeroFacture}} - {{nomEntreprise}}",
    contenu: `Bonjour {{prenomClient}},

Veuillez trouver ci-joint votre facture {{numeroFacture}}.

Montant: {{montant}} €
Date d'échéance: {{dateEcheance}}

Merci de votre confiance.

Cordialement,
{{nomEntreprise}}`,
  },
  {
    nom: "Rappel Paiement",
    type: "rappel" as const,
    sujet: "Rappel - Facture {{numeroFacture}} impayée",
    contenu: `Bonjour {{prenomClient}},

Nous vous rappelons que la facture {{numeroFacture}} d'un montant de {{montant}} € n'a pas encore été payée.

Date d'échéance: {{dateEcheance}}

Veuillez procéder au paiement au plus tôt.

Cordialement,
{{nomEntreprise}}`,
  },
];

export default function ModelesEmailTransactionnels() {
  const [modeles, setModeles] = useState<ModeleEmail[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [selectedModele, setSelectedModele] = useState<ModeleEmail | null>(null);
  const [formData, setFormData] = useState({
    nom: "",
    sujet: "",
    contenu: "",
    type: "autre" as const,
  });

  const createMutation = trpc.modelesEmail.create.useMutation({
    onSuccess: () => {
      toast.success("Modèle créé avec succès");
      setFormData({ nom: "", sujet: "", contenu: "", type: "autre" });
      setIsCreateModalOpen(false);
      // Recharger la liste
      refetch();
    },
    onError: (error) => {
      toast.error("Erreur : " + error.message);
    },
  });

  const updateMutation = trpc.modelesEmail.update.useMutation({
    onSuccess: () => {
      toast.success("Modèle mis à jour avec succès");
      setIsEditModalOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error("Erreur : " + error.message);
    },
  });

  const deleteMutation = trpc.modelesEmail.delete.useMutation({
    onSuccess: () => {
      toast.success("Modèle supprimé avec succès");
      refetch();
    },
    onError: (error) => {
      toast.error("Erreur : " + error.message);
    },
  });

  const { data: modelesData, refetch } = trpc.modelesEmail.list.useQuery();

  const handleCreate = () => {
    if (!formData.nom || !formData.sujet || !formData.contenu) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    createMutation.mutate({
      nom: formData.nom,
      sujet: formData.sujet,
      contenu: formData.contenu,
      type: formData.type,
      variables: VARIABLES_DISPONIBLES.map((v) => v.code).join(","),
    });
  };

  const handleUpdate = () => {
    if (!selectedModele) return;
    if (!formData.nom || !formData.sujet || !formData.contenu) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    updateMutation.mutate({
      id: selectedModele.id,
      nom: formData.nom,
      sujet: formData.sujet,
      contenu: formData.contenu,
      type: formData.type,
    });
  };

  const handleEdit = (modele: ModeleEmail) => {
    setSelectedModele(modele);
    setFormData({
      nom: modele.nom,
      sujet: modele.sujet,
      contenu: modele.contenu,
      type: modele.type,
    });
    setIsEditModalOpen(true);
  };

  const handlePreview = (modele: ModeleEmail) => {
    setSelectedModele(modele);
    setIsPreviewModalOpen(true);
  };

  const handleAddDefault = (template: typeof MODELES_PAR_DEFAUT[0]) => {
    createMutation.mutate({
      nom: template.nom,
      sujet: template.sujet,
      contenu: template.contenu,
      type: template.type,
      variables: VARIABLES_DISPONIBLES.map((v) => v.code).join(","),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Modèles d'E-mails Transactionnels</h1>
        <p className="text-muted-foreground">
          Gérez les modèles d'e-mails automatisés avec variables dynamiques
        </p>
      </div>

      {/* Modèles par défaut */}
      <Card>
        <CardHeader>
          <CardTitle>Modèles par défaut</CardTitle>
          <CardDescription>
            Ajouter rapidement des modèles prédéfinis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MODELES_PAR_DEFAUT.map((template) => (
              <Card key={template.nom} className="border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{template.nom}</CardTitle>
                  <CardDescription className="text-xs">
                    Type: {template.type}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => handleAddDefault(template)}
                    size="sm"
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Liste des modèles */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Mes modèles</CardTitle>
              <CardDescription>
                {modelesData?.length || 0} modèle(s) créé(s)
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nouveau modèle
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {modelesData && modelesData.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Sujet</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelesData.map((modele) => (
                    <TableRow key={modele.id}>
                      <TableCell className="font-semibold">{modele.nom}</TableCell>
                      <TableCell>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          {modele.type}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {modele.sujet}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePreview(modele)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(modele)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate({ id: modele.id })}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Aucun modèle créé. Commencez par ajouter un modèle par défaut.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Variables disponibles */}
      <Card>
        <CardHeader>
          <CardTitle>Variables disponibles</CardTitle>
          <CardDescription>
            Utilisez ces variables dans vos modèles pour personnaliser les e-mails
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {VARIABLES_DISPONIBLES.map((variable) => (
              <div key={variable.code} className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                <code className="font-mono text-sm font-semibold text-blue-600">
                  {variable.code}
                </code>
                <span className="text-sm text-muted-foreground">
                  {variable.description}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modal Création */}
      <BulletproofModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Créer un modèle d'e-mail"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Nom du modèle</label>
            <Input
              value={formData.nom}
              onChange={(e) =>
                setFormData({ ...formData, nom: e.target.value })
              }
              placeholder="Ex: Relance Devis"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as any,
                })
              }
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="relance">Relance</option>
              <option value="confirmation">Confirmation</option>
              <option value="rappel">Rappel</option>
              <option value="autre">Autre</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Sujet</label>
            <Input
              value={formData.sujet}
              onChange={(e) =>
                setFormData({ ...formData, sujet: e.target.value })
              }
              placeholder="Ex: Relance - Devis {{numeroDevis}}"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Contenu</label>
            <Textarea
              value={formData.contenu}
              onChange={(e) =>
                setFormData({ ...formData, contenu: e.target.value })
              }
              placeholder="Écrivez votre modèle d'e-mail..."
              rows={8}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
            >
              <X className="w-4 h-4 mr-2" />
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              Créer
            </Button>
          </div>
        </div>
      </BulletproofModal>

      {/* Modal Édition */}
      <BulletproofModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Éditer le modèle"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Nom du modèle</label>
            <Input
              value={formData.nom}
              onChange={(e) =>
                setFormData({ ...formData, nom: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as any,
                })
              }
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="relance">Relance</option>
              <option value="confirmation">Confirmation</option>
              <option value="rappel">Rappel</option>
              <option value="autre">Autre</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Sujet</label>
            <Input
              value={formData.sujet}
              onChange={(e) =>
                setFormData({ ...formData, sujet: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Contenu</label>
            <Textarea
              value={formData.contenu}
              onChange={(e) =>
                setFormData({ ...formData, contenu: e.target.value })
              }
              rows={8}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setIsEditModalOpen(false)}
            >
              <X className="w-4 h-4 mr-2" />
              Annuler
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              Mettre à jour
            </Button>
          </div>
        </div>
      </BulletproofModal>

      {/* Modal Prévisualisation */}
      <BulletproofModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        title="Prévisualisation"
      >
        {selectedModele && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Sujet</label>
              <div className="p-3 bg-gray-50 rounded border">
                {selectedModele.sujet}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Contenu</label>
              <div className="p-3 bg-gray-50 rounded border whitespace-pre-wrap max-h-96 overflow-y-auto">
                {selectedModele.contenu}
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => setIsPreviewModalOpen(false)}
              className="w-full"
            >
              Fermer
            </Button>
          </div>
        )}
      </BulletproofModal>
    </div>
  );
}
