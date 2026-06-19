import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Mail, Eye, Star, Copy } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { Switch } from "@/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useModelesEmail } from "../application/use-modeles-email";
import { EMAIL_TYPES, VARIABLES_DISPONIBLES, VARIABLES_RACCOURCIS, typeBadgeColor, filterByType, renderPreview, type Modele, type ModeleForm, type EmailType } from "../domain/modeles-email";

/*
 * Page `modeles-email` (modèles d'emails) — migration clean-archi de `pages/ModelesEmail.tsx`.
 * Markup/classes Tailwind conservés à l'identique (parité). tRPC encapsulé dans `use-modeles-email`.
 */
const EMPTY_FORM: ModeleForm = { nom: "", type: "relance_devis", sujet: "", contenu: "", isDefault: false };

export default function ModelesEmailPage() {
  const { t } = useTranslation("modelesEmail");
  const { modeles, isLoading, create, update, remove } = useModelesEmail();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editingModele, setEditingModele] = useState<Modele | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [formData, setFormData] = useState<ModeleForm>(EMPTY_FORM);

  const resetForm = () => { setFormData(EMPTY_FORM); setEditingModele(null); };

  const handleOpenDialog = (modele?: Modele) => {
    if (modele) {
      setEditingModele(modele);
      setFormData({ nom: modele.nom, type: modele.type as EmailType, sujet: modele.sujet, contenu: modele.contenu, isDefault: modele.isDefault || false });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.nom || !formData.sujet || !formData.contenu) { toast.error(t("errChamps")); return; }
    const onSuccess = () => { setIsDialogOpen(false); resetForm(); };
    if (editingModele) {
      update.mutate(
        { id: editingModele.id, nom: formData.nom, sujet: formData.sujet, contenu: formData.contenu, isDefault: formData.isDefault },
        { onSuccess: () => { toast.success(t("toastMaj")); onSuccess(); }, onError: (e) => toast.error(e.message) },
      );
    } else {
      create.mutate(
        { nom: formData.nom, type: formData.type, sujet: formData.sujet, contenu: formData.contenu, isDefault: formData.isDefault },
        { onSuccess: () => { toast.success(t("toastCree")); onSuccess(); }, onError: (e) => toast.error(e.message) },
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm(t("confirmSupprimer"))) {
      remove.mutate({ id }, { onSuccess: () => toast.success(t("toastSupprime")), onError: (e) => toast.error(e.message) });
    }
  };

  const handlePreview = (modele: Modele) => { setPreviewContent(renderPreview(modele.contenu)); setIsPreviewOpen(true); };
  const insertVariable = (variable: string) => setFormData((f) => ({ ...f, contenu: f.contenu + `{{${variable}}}` }));
  const copyVariable = (variable: string) => { navigator.clipboard.writeText(`{{${variable}}}`); toast.success(t("toastVariableCopiee")); };

  const filteredModeles = filterByType(modeles, activeTab);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("titre")}</h1>
          <p className="text-muted-foreground mt-1">{t("sousTitre")}</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          {t("nouveau")}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">{t("tous")}</TabsTrigger>
          {EMAIL_TYPES.map((type) => (
            <TabsTrigger key={type} value={type}>{t(`type.${type}`)}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredModeles.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">{t("aucunTitre")}</h3>
                <p className="text-muted-foreground text-center mt-2">{t("aucunDesc")}</p>
                <Button className="mt-4" onClick={() => handleOpenDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("creerUn")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colNom")}</TableHead>
                    <TableHead>{t("colType")}</TableHead>
                    <TableHead>{t("colSujet")}</TableHead>
                    <TableHead>{t("colDefaut")}</TableHead>
                    <TableHead className="text-right">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredModeles.map((modele) => (
                    <TableRow key={modele.id}>
                      <TableCell className="font-medium">{modele.nom}</TableCell>
                      <TableCell>
                        <Badge className={typeBadgeColor(modele.type)}>{t(`type.${modele.type}`, modele.type)}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{modele.sujet}</TableCell>
                      <TableCell>
                        {modele.isDefault && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handlePreview(modele)} title={t("previsualiser")}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(modele)} title={t("modifier")}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(modele.id)} title={t("supprimer")}>
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
          <CardTitle className="text-lg">{t("variablesTitre")}</CardTitle>
          <CardDescription>{t("variablesDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {VARIABLES_DISPONIBLES.map((variable) => (
              <div
                key={variable}
                className="flex items-center justify-between p-2 rounded-md border bg-muted/50 hover:bg-muted cursor-pointer"
                onClick={() => copyVariable(variable)}
                title={t(`variable.${variable}`)}
              >
                <code className="text-sm font-mono">{`{{${variable}}}`}</code>
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
            <DialogTitle>{editingModele ? t("dialogTitreEdit") : t("dialogTitreNew")}</DialogTitle>
            <DialogDescription>{t("dialogDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nom">{t("champNom")}</Label>
                <Input id="nom" value={formData.nom} onChange={(e) => setFormData({ ...formData, nom: e.target.value })} placeholder={t("champNomPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">{t("champType")}</Label>
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value as EmailType })} disabled={!!editingModele}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMAIL_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{t(`type.${type}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sujet">{t("champSujet")}</Label>
              <Input id="sujet" value={formData.sujet} onChange={(e) => setFormData({ ...formData, sujet: e.target.value })} placeholder={t("champSujetPlaceholder")} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="contenu">{t("champContenu")}</Label>
                <div className="flex gap-1">
                  {VARIABLES_RACCOURCIS.map((v) => (
                    <Button key={v} variant="outline" size="sm" onClick={() => insertVariable(v)} className="text-xs">{v}</Button>
                  ))}
                </div>
              </div>
              <Textarea id="contenu" value={formData.contenu} onChange={(e) => setFormData({ ...formData, contenu: e.target.value })} placeholder={t("champContenuPlaceholder")} rows={10} />
            </div>

            <div className="flex items-center space-x-2">
              <Switch id="isDefault" checked={formData.isDefault} onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })} />
              <Label htmlFor="isDefault">{t("parDefautLabel")}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t("annuler")}</Button>
            <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
              {editingModele ? t("mettreAJour") : t("creer")}
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
              {t("apercuTitre")}
            </DialogTitle>
            <DialogDescription>{t("apercuDesc")}</DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 p-4 rounded-md">
            <pre className="whitespace-pre-wrap font-sans text-sm">{previewContent}</pre>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsPreviewOpen(false)}>{t("fermer")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
