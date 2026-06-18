import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Eye, Save, X } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Input } from "@/modern/shared/ui/input";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/modern/shared/ui/table";
import { BulletproofModal } from "./bulletproof-modal";
import { useModelesTransactionnels } from "../application/use-modeles-transactionnels";
import { TYPE_OPTIONS, VARIABLES_DISPONIBLES, MODELES_PAR_DEFAUT, varCode, defautToCreateInput, type Modele, type ModeleForm, type EmailType, type ModeleDefaut } from "../domain/modeles-email-transactionnels";

// Page `modeles-email-transactionnels` — migration clean-archi de `pages/ModelesEmailTransactionnels.tsx`.
// Markup/classes conservés (parité) ; le sélecteur de type envoie désormais des valeurs d'enum VALIDES
// (le legacy envoyait des valeurs hors enum → 400). tRPC encapsulé dans `use-modeles-transactionnels`.
const EMPTY_FORM: ModeleForm = { nom: "", sujet: "", contenu: "", type: "autre" };

export default function ModelesTransactionnelsPage() {
  const { t } = useTranslation("modelesTransactionnels");
  const { modeles, create, update, remove } = useModelesTransactionnels();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [selectedModele, setSelectedModele] = useState<Modele | null>(null);
  const [formData, setFormData] = useState<ModeleForm>(EMPTY_FORM);

  const handleCreate = () => {
    if (!formData.nom || !formData.sujet || !formData.contenu) { toast.error(t("errChamps")); return; }
    create.mutate(
      { nom: formData.nom, sujet: formData.sujet, contenu: formData.contenu, type: formData.type },
      {
        onSuccess: () => { toast.success(t("toastCree")); setFormData(EMPTY_FORM); setIsCreateModalOpen(false); },
        onError: (e) => toast.error(t("errPrefix") + e.message),
      },
    );
  };

  const handleUpdate = () => {
    if (!selectedModele) return;
    if (!formData.nom || !formData.sujet || !formData.contenu) { toast.error(t("errChamps")); return; }
    update.mutate(
      { id: selectedModele.id, nom: formData.nom, sujet: formData.sujet, contenu: formData.contenu, type: formData.type },
      {
        onSuccess: () => { toast.success(t("toastMaj")); setIsEditModalOpen(false); },
        onError: (e) => toast.error(t("errPrefix") + e.message),
      },
    );
  };

  const handleEdit = (modele: Modele) => {
    setSelectedModele(modele);
    setFormData({ nom: modele.nom, sujet: modele.sujet, contenu: modele.contenu, type: modele.type as EmailType });
    setIsEditModalOpen(true);
  };

  const handlePreview = (modele: Modele) => { setSelectedModele(modele); setIsPreviewModalOpen(true); };

  const handleAddDefault = (d: ModeleDefaut) => {
    create.mutate(defautToCreateInput(d, t(`defaut.${d.key}`)), {
      onSuccess: () => toast.success(t("toastCree")),
      onError: (e) => toast.error(t("errPrefix") + e.message),
    });
  };

  const TypeSelect = () => (
    <select
      value={formData.type}
      onChange={(e) => setFormData({ ...formData, type: e.target.value as EmailType })}
      className="w-full px-3 py-2 border rounded-md"
    >
      {TYPE_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>{t(`typeOption.${opt}`)}</option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t("titre")}</h1>
        <p className="text-muted-foreground">{t("sousTitre")}</p>
      </div>

      {/* Modèles par défaut */}
      <Card>
        <CardHeader>
          <CardTitle>{t("defautTitre")}</CardTitle>
          <CardDescription>{t("defautDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MODELES_PAR_DEFAUT.map((template) => (
              <Card key={template.key} className="border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t(`defaut.${template.key}`)}</CardTitle>
                  <CardDescription className="text-xs">{t("typeLabel", { type: t(`typeOption.${template.type}`) })}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => handleAddDefault(template)} size="sm" className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    {t("ajouter")}
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
              <CardTitle>{t("mesModeles")}</CardTitle>
              <CardDescription>{t("nbCrees", { count: modeles.length })}</CardDescription>
            </div>
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t("nouveau")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {modeles.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colNom")}</TableHead>
                    <TableHead>{t("colType")}</TableHead>
                    <TableHead>{t("colSujet")}</TableHead>
                    <TableHead className="text-right">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modeles.map((modele) => (
                    <TableRow key={modele.id}>
                      <TableCell className="font-semibold">{modele.nom}</TableCell>
                      <TableCell>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">{t(`typeOption.${modele.type}`, modele.type)}</span>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{modele.sujet}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="sm" onClick={() => handlePreview(modele)}><Eye className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(modele)}><Edit2 className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => remove.mutate({ id: modele.id }, { onSuccess: () => toast.success(t("toastSupprime")) })}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">{t("aucun")}</div>
          )}
        </CardContent>
      </Card>

      {/* Variables disponibles */}
      <Card>
        <CardHeader>
          <CardTitle>{t("variablesTitre")}</CardTitle>
          <CardDescription>{t("variablesDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {VARIABLES_DISPONIBLES.map((name) => (
              <div key={name} className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                <code className="font-mono text-sm font-semibold text-blue-600">{varCode(name)}</code>
                <span className="text-sm text-muted-foreground">{t(`variable.${name}`)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modal Création */}
      <BulletproofModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title={t("modalCreer")}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t("champNom")}</label>
            <Input value={formData.nom} onChange={(e) => setFormData({ ...formData, nom: e.target.value })} placeholder={t("champNomPlaceholder")} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">{t("champType")}</label>
            <TypeSelect />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">{t("champSujet")}</label>
            <Input value={formData.sujet} onChange={(e) => setFormData({ ...formData, sujet: e.target.value })} placeholder={t("champSujetPlaceholder")} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">{t("champContenu")}</label>
            <Textarea value={formData.contenu} onChange={(e) => setFormData({ ...formData, contenu: e.target.value })} placeholder={t("champContenuPlaceholder")} rows={8} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}><X className="w-4 h-4 mr-2" />{t("annuler")}</Button>
            <Button onClick={handleCreate} disabled={create.isPending}><Save className="w-4 h-4 mr-2" />{t("creer")}</Button>
          </div>
        </div>
      </BulletproofModal>

      {/* Modal Édition */}
      <BulletproofModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={t("modalEditer")}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t("champNom")}</label>
            <Input value={formData.nom} onChange={(e) => setFormData({ ...formData, nom: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">{t("champType")}</label>
            <TypeSelect />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">{t("champSujet")}</label>
            <Input value={formData.sujet} onChange={(e) => setFormData({ ...formData, sujet: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">{t("champContenu")}</label>
            <Textarea value={formData.contenu} onChange={(e) => setFormData({ ...formData, contenu: e.target.value })} rows={8} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}><X className="w-4 h-4 mr-2" />{t("annuler")}</Button>
            <Button onClick={handleUpdate} disabled={update.isPending}><Save className="w-4 h-4 mr-2" />{t("mettreAJour")}</Button>
          </div>
        </div>
      </BulletproofModal>

      {/* Modal Prévisualisation */}
      <BulletproofModal isOpen={isPreviewModalOpen} onClose={() => setIsPreviewModalOpen(false)} title={t("modalApercu")}>
        {selectedModele && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t("champSujet")}</label>
              <div className="p-3 bg-gray-50 rounded border">{selectedModele.sujet}</div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t("champContenu")}</label>
              <div className="p-3 bg-gray-50 rounded border whitespace-pre-wrap max-h-96 overflow-y-auto">{selectedModele.contenu}</div>
            </div>
            <Button variant="outline" onClick={() => setIsPreviewModalOpen(false)} className="w-full">{t("fermer")}</Button>
          </div>
        )}
      </BulletproofModal>
    </div>
  );
}
