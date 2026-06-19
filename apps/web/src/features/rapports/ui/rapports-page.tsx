import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Plus, FileText, Star, Play, Download, Trash2, BarChart3, LineChart, PieChart, Table as TableIcon, TrendingUp, Users, Package, Wrench, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useRapports } from "../application/use-rapports";
import { TYPE_VALUES, FORMAT_VALUES, GRAPHIQUE_VALUES, EMPTY_FORM, humanizeColumn, favoris, formatCell, deriveColonnes, type RapportForm, type RapportType, type RapportFormat, type GraphiqueType, type ResultatRapport, type ResultatLigne } from "../domain/rapports";

/*
 * Page `rapports` (rapports personnalisables) — migration clean-archi de `pages/Rapports.tsx`. Markup à
 * l'identique. tRPC encapsulé dans `use-rapports`, agrégats/formatage purs en domain.
 */
const TYPE_ICON: Record<string, typeof TrendingUp> = { ventes: TrendingUp, clients: Users, interventions: Wrench, stocks: Package, techniciens: Users, financier: Calculator };
const FORMAT_ICON: Record<string, typeof TableIcon> = { tableau: TableIcon, graphique: BarChart3, liste: FileText };
const GRAPHIQUE_ICON: Record<string, typeof BarChart3> = { bar: BarChart3, line: LineChart, pie: PieChart, doughnut: PieChart };

function exportCsv(resultats: ResultatRapport, selectedRapport: number): void {
  const lignes = resultats.resultats as ResultatLigne[];
  if (!lignes.length) return;
  const colonnes = deriveColonnes(lignes);
  const headers = colonnes.join(",");
  const rows = lignes.map((ligne) =>
    colonnes.map((col) => {
      const val = ligne[col];
      if (val instanceof Date) return format(val, "dd/MM/yyyy");
      if (typeof val === "string" && val.includes(",")) return `"${val}"`;
      return String(val ?? "");
    }).join(","),
  );
  const csv = [headers, ...rows].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `rapport_${selectedRapport}_${format(new Date(), "yyyyMMdd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function RapportsPage() {
  const { t } = useTranslation("rapports");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedRapport, setSelectedRapport] = useState<number | null>(null);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [formData, setFormData] = useState<RapportForm>(EMPTY_FORM);
  const { rapports, resultats, loadingResultats, create, remove, toggleFavori } = useRapports(selectedRapport, dateDebut, dateFin);

  const handleCreate = () => {
    create.mutate(
      {
        nom: formData.nom,
        description: formData.description || undefined,
        type: formData.type,
        format: formData.format,
        graphiqueType: formData.format === "graphique" ? formData.graphiqueType : undefined,
        filtres: { dateDebut: formData.dateDebut || undefined, dateFin: formData.dateFin || undefined },
      },
      {
        onSuccess: () => { toast.success(t("toastCree")); setShowCreateDialog(false); setFormData(EMPTY_FORM); },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleExportCsv = () => {
    if (!resultats || !selectedRapport) return;
    exportCsv(resultats, selectedRapport);
    toast.success(t("toastCsv"));
  };

  const rapportsFavoris = favoris(rapports);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("titre")}</h1>
          <p className="text-muted-foreground mt-1">{t("sousTitre")}</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />{t("nouveau")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{t("creerTitre")}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("nom")}</Label>
                  <Input placeholder={t("nomPlaceholder")} value={formData.nom} onChange={(e) => setFormData({ ...formData, nom: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t("typeRapport")}</Label>
                  <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as RapportType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPE_VALUES.map((value) => {
                        const Icon = TYPE_ICON[value];
                        return <SelectItem key={value} value={value}><div className="flex items-center gap-2"><Icon className="h-4 w-4" />{t(`type.${value}`)}</div></SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("descriptionOpt")}</Label>
                <Textarea placeholder={t("descriptionPlaceholder")} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("formatAffichage")}</Label>
                  <Select value={formData.format} onValueChange={(v) => setFormData({ ...formData, format: v as RapportFormat })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FORMAT_VALUES.map((value) => {
                        const Icon = FORMAT_ICON[value];
                        return <SelectItem key={value} value={value}><div className="flex items-center gap-2"><Icon className="h-4 w-4" />{t(`format.${value}`)}</div></SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {formData.format === "graphique" && (
                  <div className="space-y-2">
                    <Label>{t("typeGraphique")}</Label>
                    <Select value={formData.graphiqueType} onValueChange={(v) => setFormData({ ...formData, graphiqueType: v as GraphiqueType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GRAPHIQUE_VALUES.map((value) => {
                          const Icon = GRAPHIQUE_ICON[value];
                          return <SelectItem key={value} value={value}><div className="flex items-center gap-2"><Icon className="h-4 w-4" />{t(`graphique.${value}`)}</div></SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("dateDebutOpt")}</Label>
                  <Input type="date" value={formData.dateDebut} onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t("dateFinOpt")}</Label>
                  <Input type="date" value={formData.dateFin} onChange={(e) => setFormData({ ...formData, dateFin: e.target.value })} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t("annuler")}</Button>
                <Button onClick={handleCreate} disabled={!formData.nom || create.isPending}>{create.isPending ? t("creation") : t("creerRapport")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="mes-rapports" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mes-rapports">{t("tabMes")}</TabsTrigger>
          <TabsTrigger value="executer">{t("tabExecuter")}</TabsTrigger>
          <TabsTrigger value="modeles">{t("tabModeles")}</TabsTrigger>
        </TabsList>

        <TabsContent value="mes-rapports" className="space-y-4">
          {rapportsFavoris.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />{t("favoris")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rapportsFavoris.map((rapport) => {
                    const Icon = TYPE_ICON[rapport.type];
                    return (
                      <Card key={rapport.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedRapport(rapport.id)}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              {Icon && <Icon className="h-5 w-5 text-primary" />}
                              <div>
                                <p className="font-medium">{rapport.nom}</p>
                                <p className="text-xs text-muted-foreground">{t(`type.${rapport.type}`, rapport.type)}</p>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); toggleFavori.mutate({ id: rapport.id }); }}>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("tous")}</CardTitle>
              <CardDescription>{t("nbCrees", { count: rapports.length })}</CardDescription>
            </CardHeader>
            <CardContent>
              {rapports.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colNom")}</TableHead>
                      <TableHead>{t("colType")}</TableHead>
                      <TableHead>{t("colFormat")}</TableHead>
                      <TableHead>{t("colCree")}</TableHead>
                      <TableHead className="text-right">{t("colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rapports.map((rapport) => {
                      const fmt = rapport.format ?? "tableau";
                      const FormatIcon = FORMAT_ICON[fmt];
                      return (
                        <TableRow key={rapport.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {rapport.favori && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                              <span className="font-medium">{rapport.nom}</span>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{t(`type.${rapport.type}`, rapport.type)}</Badge></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {FormatIcon && <FormatIcon className="h-4 w-4" />}
                              {t(`format.${fmt}`, fmt)}
                            </div>
                          </TableCell>
                          <TableCell>{format(new Date(rapport.createdAt), "dd/MM/yyyy", { locale: fr })}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => setSelectedRapport(rapport.id)}><Play className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => toggleFavori.mutate({ id: rapport.id })}><Star className={`h-4 w-4 ${rapport.favori ? "text-yellow-500 fill-yellow-500" : ""}`} /></Button>
                              <Button variant="ghost" size="icon" onClick={() => remove.mutate({ id: rapport.id }, { onSuccess: () => toast.success(t("toastSupprime")) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
                  <p className="text-muted-foreground">{t("aucun")}</p>
                  <Button className="mt-4" onClick={() => setShowCreateDialog(true)}><Plus className="h-4 w-4 mr-2" />{t("creerPremier")}</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="executer" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-lg">{t("parametres")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("rapportAExecuter")}</Label>
                  <Select value={selectedRapport?.toString() ?? ""} onValueChange={(v) => setSelectedRapport(parseInt(v))}>
                    <SelectTrigger><SelectValue placeholder={t("selRapport")} /></SelectTrigger>
                    <SelectContent>
                      {rapports.map((rapport) => (<SelectItem key={rapport.id} value={rapport.id.toString()}>{rapport.nom}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t("dateDebut")}</Label><Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} /></div>
                <div className="space-y-2"><Label>{t("dateFin")}</Label><Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} /></div>
                {resultats && (
                  <Button onClick={handleExportCsv} className="w-full" variant="outline"><Download className="h-4 w-4 mr-2" />{t("exporterCsv")}</Button>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-lg">{t("resultats")}</CardTitle>
                {resultats && <CardDescription>{t("nbLignes", { count: resultats.nombreLignes })}</CardDescription>}
              </CardHeader>
              <CardContent>
                {loadingResultats ? (
                  <div className="text-center py-8"><p className="text-muted-foreground">{t("chargement")}</p></div>
                ) : resultats ? (
                  <div className="space-y-4">
                    {(() => {
                      const lignes = resultats.resultats as ResultatLigne[];
                      const colonnes = deriveColonnes(lignes);
                      return (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {colonnes.map((col) => (<TableHead key={col} className="capitalize">{humanizeColumn(col)}</TableHead>))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lignes.map((ligne, index) => (
                                <TableRow key={index}>
                                  {colonnes.map((col) => (<TableCell key={col}>{formatCell(ligne[col])}</TableCell>))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">{t("selResultats")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="modeles" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {TYPE_VALUES.map((value) => {
              const Icon = TYPE_ICON[value];
              return (
                <Card key={value} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-lg bg-primary/10"><Icon className="h-6 w-6 text-primary" /></div>
                      <div className="flex-1">
                        <h3 className="font-semibold">{t(`type.${value}`)}</h3>
                        <p className="text-sm text-muted-foreground mb-4">{t(`typeDesc.${value}`)}</p>
                        <Button size="sm" onClick={() => { setFormData({ ...formData, nom: t("rapportNom", { type: t(`type.${value}`) }), type: value }); setShowCreateDialog(true); }}>
                          <Plus className="h-4 w-4 mr-1" />{t("creer")}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
