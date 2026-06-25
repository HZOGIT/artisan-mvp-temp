import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, FileText, Loader2, Search, Eye, Download } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/shared/ui/dialog";
import { Badge } from "@/shared/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Switch } from "@/shared/ui/switch";
import { useContrats } from "../application/use-contrats";
import {
  clientNom, computeStats, filterContrats, statutVariant, TYPES_CONTRAT, PERIODICITES, STATUTS,
  type Contrat, type ContratType, type Periodicite,
} from "../domain/contrat";
import { TVA_CATEGORIES } from "@/shared/tva/taux-tva-fr";

interface ContratFormData {
  clientId: number;
  titre: string;
  description: string;
  type: ContratType;
  montantHT: string;
  tauxTVA: string;
  periodicite: Periodicite;
  dateDebut: string;
  dateFin: string;
  reconduction: boolean;
  preavisResiliation: number;
  conditionsParticulieres: string;
  notes: string;
}

const initialFormData: ContratFormData = {
  clientId: 0,
  titre: "",
  description: "",
  type: "entretien",
  montantHT: "",
  tauxTVA: "20",
  periodicite: "annuel",
  dateDebut: new Date().toISOString().split("T")[0],
  dateFin: "",
  reconduction: true,
  preavisResiliation: 1,
  conditionsParticulieres: "",
  notes: "",
};

export default function ContratsPage() {
  const { t } = useTranslation("contrats");
  const { contrats, clients, isLoading, create, update, remove, generateFacture } = useContrats();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ContratFormData>(initialFormData);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState<string>("tous");

  const nomClient = (contrat: Contrat) => clientNom(clients, contrat.clientId);
  const stats = useMemo(() => computeStats(contrats), [contrats]);
  const filteredContrats = filterContrats(contrats, { search, statut: filterStatut, nomClient });

  const closeDialog = () => { setIsDialogOpen(false); setEditingId(null); setFormData(initialFormData); };

  const handleSubmit = () => {
    if (!formData.clientId || !formData.titre || !formData.montantHT) {
      toast.error(t("champsObligatoires"));
      return;
    }
    if (editingId) {
      update.mutate(
        {
          id: editingId,
          titre: formData.titre,
          description: formData.description || undefined,
          type: formData.type,
          montantHT: formData.montantHT,
          tauxTVA: formData.tauxTVA,
          periodicite: formData.periodicite,
          dateFin: formData.dateFin ? new Date(formData.dateFin) : undefined,
          reconduction: formData.reconduction,
          preavisResiliation: formData.preavisResiliation,
          conditionsParticulieres: formData.conditionsParticulieres || undefined,
          notes: formData.notes || undefined,
        },
        { onSuccess: () => { toast.success(t("toastMaj")); closeDialog(); }, onError: (e) => toast.error(e.message) },
      );
    } else {
      create.mutate(
        {
          clientId: formData.clientId,
          titre: formData.titre,
          description: formData.description || undefined,
          type: formData.type,
          montantHT: formData.montantHT,
          tauxTVA: formData.tauxTVA,
          periodicite: formData.periodicite,
          dateDebut: new Date(formData.dateDebut),
          dateFin: formData.dateFin ? new Date(formData.dateFin) : undefined,
          reconduction: formData.reconduction,
          preavisResiliation: formData.preavisResiliation,
          conditionsParticulieres: formData.conditionsParticulieres || undefined,
          notes: formData.notes || undefined,
        },
        { onSuccess: () => { toast.success(t("toastCree")); closeDialog(); }, onError: (e) => toast.error(e.message) },
      );
    }
  };

  const handleEdit = (contrat: Contrat) => {
    setEditingId(contrat.id);
    setFormData({
      clientId: contrat.clientId,
      titre: contrat.titre,
      description: contrat.description || "",
      type: contrat.type,
      montantHT: contrat.montantHT || "",
      tauxTVA: String(parseFloat(contrat.tauxTVA || "20")) || "20",
      periodicite: contrat.periodicite,
      dateDebut: contrat.dateDebut ? new Date(contrat.dateDebut).toISOString().split("T")[0] : "",
      dateFin: contrat.dateFin ? new Date(contrat.dateFin).toISOString().split("T")[0] : "",
      reconduction: contrat.reconduction ?? true,
      preavisResiliation: contrat.preavisResiliation ?? 1,
      conditionsParticulieres: contrat.conditionsParticulieres || "",
      notes: contrat.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (!confirm(t("confirmSuppression"))) return;
    remove.mutate({ id }, { onSuccess: () => toast.success(t("toastSupprime")), onError: (e) => toast.error(e.message) });
  };

  const handleGenerateFacture = (contratId: number) =>
    generateFacture.mutate({ contratId }, { onSuccess: () => toast.success(t("toastFactureGeneree")), onError: (e) => toast.error(e.message) });

  /** Le détail contrat n'est pas (encore) migré → navigation pleine page vers la route legacy. */
  const goToDetail = (id: number) => window.location.assign(`/contrats/${id}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : closeDialog())}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />{t("nouveau")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? t("editTitle") : t("createTitle")}</DialogTitle>
              <DialogDescription>{editingId ? t("editDescription") : t("createDescription")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("client")}</Label>
                  <Select
                    value={formData.clientId ? formData.clientId.toString() : ""}
                    onValueChange={(v) => setFormData({ ...formData, clientId: parseInt(v) })}
                    disabled={!!editingId}
                  >
                    <SelectTrigger><SelectValue placeholder={t("clientPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.nom} {c.prenom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("typeLabel")}</Label>
                  <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as ContratType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPES_CONTRAT.map((value) => (
                        <SelectItem key={value} value={value}>{t(`typeOption.${value}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("titre")}</Label>
                <Input value={formData.titre} onChange={(e) => setFormData({ ...formData, titre: e.target.value })} placeholder={t("titrePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("description")}</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={t("descriptionPlaceholder")} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t("montantHT")}</Label>
                  <Input type="number" step="0.01" value={formData.montantHT} onChange={(e) => setFormData({ ...formData, montantHT: e.target.value })} placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label>{t("tauxTVA")}</Label>
                  <Select value={formData.tauxTVA} onValueChange={(v) => setFormData({ ...formData, tauxTVA: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TVA_CATEGORIES.map((c) => (
                        <SelectItem key={c.id} value={c.taux}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("periodicite")}</Label>
                  <Select value={formData.periodicite} onValueChange={(v) => setFormData({ ...formData, periodicite: v as Periodicite })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERIODICITES.map((value) => (
                        <SelectItem key={value} value={value}>{t(`periodiciteLabel.${value}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("dateDebut")}</Label>
                  <Input type="date" value={formData.dateDebut} onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })} disabled={!!editingId} />
                </div>
                <div className="space-y-2">
                  <Label>{t("dateFin")}</Label>
                  <Input type="date" value={formData.dateFin} onChange={(e) => setFormData({ ...formData, dateFin: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label>{t("reconduction")}</Label>
                  <Switch checked={formData.reconduction} onCheckedChange={(v) => setFormData({ ...formData, reconduction: v })} />
                </div>
                <div className="space-y-2">
                  <Label>{t("preavis")}</Label>
                  <Input type="number" min="1" value={formData.preavisResiliation} onChange={(e) => setFormData({ ...formData, preavisResiliation: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("conditions")}</Label>
                <Textarea value={formData.conditionsParticulieres} onChange={(e) => setFormData({ ...formData, conditionsParticulieres: e.target.value })} placeholder={t("conditionsPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("notes")}</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder={t("notesPlaceholder")} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>{t("annuler")}</Button>
              <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
                {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? t("mettreAJour") : t("creer")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t("statTotal")}</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t("statActifs")}</p>
            <p className="text-2xl font-bold text-green-600">{stats.actifs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t("statCaAnnuel")}</p>
            <p className="text-2xl font-bold text-primary">{stats.caAnnuel.toFixed(2)} €</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">{t("filterTous")}</SelectItem>
            {STATUTS.map((s) => (
              <SelectItem key={s} value={s}>{t(`statut.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : filteredContrats.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{search || filterStatut !== "tous" ? t("aucunTrouve") : t("aucunContrat")}</p>
            {!search && filterStatut === "tous" && (
              <Button className="mt-4" onClick={() => setIsDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />{t("creerPremier")}</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colReference")}</TableHead>
                  <TableHead>{t("colClient")}</TableHead>
                  <TableHead>{t("colTitre")}</TableHead>
                  <TableHead>{t("colType")}</TableHead>
                  <TableHead>{t("colPeriodicite")}</TableHead>
                  <TableHead className="text-right">{t("colMontant")}</TableHead>
                  <TableHead>{t("colProchaine")}</TableHead>
                  <TableHead>{t("colStatut")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContrats.map((contrat) => (
                  <TableRow key={contrat.id} className="cursor-pointer hover:bg-muted/50" onClick={() => goToDetail(contrat.id)}>
                    <TableCell className="font-medium">{contrat.reference}</TableCell>
                    <TableCell>{nomClient(contrat)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{contrat.titre}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t(`type.${contrat.type}`)}</Badge>
                    </TableCell>
                    <TableCell>{t(`periodiciteLabel.${contrat.periodicite}`)}</TableCell>
                    <TableCell className="text-right">{parseFloat(contrat.montantHT || "0").toFixed(2)} €</TableCell>
                    <TableCell>
                      {contrat.prochainFacturation ? format(new Date(contrat.prochainFacturation), "dd/MM/yyyy") : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statutVariant(contrat.statut)}>{t(`statut.${contrat.statut}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => goToDetail(contrat.id)} title={t("voirDetails")}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" asChild title={t("telechargerPdf")}>
                          <a href={`/api/contrats/${contrat.id}/pdf`} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleGenerateFacture(contrat.id)} disabled={generateFacture.isPending || contrat.statut !== "actif"} title={t("genererFacture")}>
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(contrat)} title={t("modifier")}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(contrat.id)} title={t("supprimer")}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
