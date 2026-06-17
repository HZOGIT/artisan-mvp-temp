import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Clock, Package, CheckCircle2, AlertTriangle, Building2, Plus, Eye, Truck } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/modern/shared/ui/table";
import { Badge } from "@/modern/shared/ui/badge";
import { Progress } from "@/modern/shared/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/modern/shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Textarea } from "@/modern/shared/ui/textarea";
import { usePerformancesFournisseurs } from "../application/use-performances-fournisseurs";
import { STATUTS_COMMANDE, formatCurrency, formatDate, statutClass, statutVariant, fiabiliteColor, fiabiliteLevel, globalStats, type Performance, type StatutCommande } from "../domain/performances-fournisseurs";

// Page `performances-fournisseurs` — migration clean-archi de `pages/PerformancesFournisseurs.tsx`. Markup
// à l'identique. tRPC encapsulé dans `use-performances-fournisseurs`, agrégats/règles purs en domain.
function FiabiliteIcon({ taux }: { taux: number }) {
  const level = fiabiliteLevel(taux);
  if (level === "up") return <TrendingUp className="h-4 w-4 text-green-600" />;
  if (level === "warn") return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
  return <TrendingDown className="h-4 w-4 text-red-600" />;
}

const EMPTY_FORM = { fournisseurId: 0, reference: "", dateLivraisonPrevue: "", notes: "" };

export default function PerformancesFournisseursPage() {
  const { t } = useTranslation("performancesFournisseurs");
  const { performances, commandes, fournisseurs, isLoading, create, updateStatut } = usePerformancesFournisseurs();
  const [selectedFournisseur, setSelectedFournisseur] = useState<Performance | null>(null);
  const [isCommandeDialogOpen, setIsCommandeDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [commandeForm, setCommandeForm] = useState(EMPTY_FORM);

  const handleCreateCommande = () => {
    if (!commandeForm.fournisseurId) { toast.error(t("errFournisseur")); return; }
    create.mutate(
      { fournisseurId: commandeForm.fournisseurId, reference: commandeForm.reference || undefined, dateLivraisonPrevue: commandeForm.dateLivraisonPrevue || undefined, notes: commandeForm.notes || undefined, lignes: [] },
      { onSuccess: () => { toast.success(t("toastCree")); setIsCommandeDialogOpen(false); setCommandeForm(EMPTY_FORM); }, onError: (e) => toast.error(e.message) },
    );
  };

  const handleUpdateStatut = (commandeId: number, statut: StatutCommande) => {
    updateStatut.mutate(
      { id: commandeId, statut, ...(statut === "livree" ? { dateLivraisonReelle: new Date().toISOString() } : {}) },
      { onSuccess: () => toast.success(t("toastStatut")), onError: (e) => toast.error(e.message) },
    );
  };

  const stats = globalStats(performances);

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
          <h1 className="text-2xl font-bold tracking-tight">{t("titre")}</h1>
          <p className="text-muted-foreground">{t("sousTitre")}</p>
        </div>
        <Button onClick={() => setIsCommandeDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />{t("nouvelleCommande")}</Button>
      </div>

      {/* Statistiques globales */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("totalCommandes")}</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCommandes}</div>
            <p className="text-xs text-muted-foreground">{t("livreesCount", { count: stats.totalLivrees })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("tauxFiabilite")}</CardTitle>
            <FiabiliteIcon taux={stats.tauxFiabiliteGlobal} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${fiabiliteColor(stats.tauxFiabiliteGlobal)}`}>{stats.tauxFiabiliteGlobal}%</div>
            <Progress value={stats.tauxFiabiliteGlobal} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("commandesEnRetard")}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.totalEnRetard}</div>
            <p className="text-xs text-muted-foreground">{t("pctDuTotal", { pct: stats.totalCommandes > 0 ? Math.round((stats.totalEnRetard / stats.totalCommandes) * 100) : 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("montantTotal")}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.montantTotalGlobal)}</div>
            <p className="text-xs text-muted-foreground">{t("toutesCommandes")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tableau des performances par fournisseur */}
      <Card>
        <CardHeader>
          <CardTitle>{t("perfParFournisseur")}</CardTitle>
          <CardDescription>{t("perfDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {performances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("aucunePerf")}</p>
              <p className="text-sm">{t("aucunePerfAstuce")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colFournisseur")}</TableHead>
                  <TableHead className="text-center">{t("colCommandes")}</TableHead>
                  <TableHead className="text-center">{t("colLivrees")}</TableHead>
                  <TableHead className="text-center">{t("colEnRetard")}</TableHead>
                  <TableHead className="text-center">{t("colDelai")}</TableHead>
                  <TableHead className="text-center">{t("colFiabilite")}</TableHead>
                  <TableHead className="text-right">{t("colMontant")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performances.map((perf) => (
                  <TableRow key={perf.fournisseur.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{perf.fournisseur.nom}</div>
                        {perf.fournisseur.email && <div className="text-sm text-muted-foreground">{perf.fournisseur.email}</div>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{perf.totalCommandes}</TableCell>
                    <TableCell className="text-center"><span className="text-green-600">{perf.commandesLivrees}</span></TableCell>
                    <TableCell className="text-center"><span className={perf.commandesEnRetard > 0 ? "text-red-600" : ""}>{perf.commandesEnRetard}</span></TableCell>
                    <TableCell className="text-center">
                      {perf.delaiMoyenLivraison !== null ? (
                        <span className="flex items-center justify-center gap-1"><Clock className="h-3 w-3" />{t("jours", { n: perf.delaiMoyenLivraison })}</span>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <FiabiliteIcon taux={perf.tauxFiabilite} />
                        <span className={fiabiliteColor(perf.tauxFiabilite)}>{perf.tauxFiabilite}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(perf.montantTotal)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedFournisseur(perf); setIsDetailDialogOpen(true); }}>
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
          <CardTitle>{t("dernieresCommandes")}</CardTitle>
          <CardDescription>{t("dernieresDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {commandes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("aucuneCommande")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colReference")}</TableHead>
                  <TableHead>{t("colDateCommande")}</TableHead>
                  <TableHead>{t("colLivraisonPrevue")}</TableHead>
                  <TableHead>{t("colLivraisonReelle")}</TableHead>
                  <TableHead>{t("colStatut")}</TableHead>
                  <TableHead className="text-right">{t("colMontant2")}</TableHead>
                  <TableHead>{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commandes.slice(0, 10).map((commande) => (
                  <TableRow key={commande.id}>
                    <TableCell className="font-medium">{commande.reference || `CMD-${commande.id}`}</TableCell>
                    <TableCell>{formatDate(commande.dateCommande)}</TableCell>
                    <TableCell>{formatDate(commande.dateLivraisonPrevue)}</TableCell>
                    <TableCell>{formatDate(commande.dateLivraisonReelle)}</TableCell>
                    <TableCell>
                      <Badge className={statutClass(commande.statut) ?? undefined} variant={statutVariant(commande.statut)}>{t(`statut.${commande.statut}`, commande.statut ?? "")}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{commande.montantTotal ? formatCurrency(Number(commande.montantTotal)) : "-"}</TableCell>
                    <TableCell>
                      <Select value={commande.statut || "en_attente"} onValueChange={(value) => handleUpdateStatut(commande.id, value as StatutCommande)}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUTS_COMMANDE.map((s) => (<SelectItem key={s} value={s}>{t(`statut.${s}`)}</SelectItem>))}
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
            <DialogTitle>{t("dialogNouvelle")}</DialogTitle>
            <DialogDescription>{t("dialogNouvelleDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("fournisseurRequis")}</Label>
              <Select value={commandeForm.fournisseurId.toString()} onValueChange={(value) => setCommandeForm({ ...commandeForm, fournisseurId: parseInt(value) })}>
                <SelectTrigger><SelectValue placeholder={t("selFournisseur")} /></SelectTrigger>
                <SelectContent>
                  {fournisseurs.map((f) => (<SelectItem key={f.id} value={f.id.toString()}>{f.nom}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("reference")}</Label>
              <Input value={commandeForm.reference} onChange={(e) => setCommandeForm({ ...commandeForm, reference: e.target.value })} placeholder={t("referencePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("dateLivraisonPrevue")}</Label>
              <Input type="date" value={commandeForm.dateLivraisonPrevue} onChange={(e) => setCommandeForm({ ...commandeForm, dateLivraisonPrevue: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("notes")}</Label>
              <Textarea value={commandeForm.notes} onChange={(e) => setCommandeForm({ ...commandeForm, notes: e.target.value })} placeholder={t("notesPlaceholder")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCommandeDialogOpen(false)}>{t("annuler")}</Button>
            <Button onClick={handleCreateCommande} disabled={create.isPending}>{t("creerCommande")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog détails fournisseur */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("dialogDetails", { nom: selectedFournisseur?.fournisseur.nom })}</DialogTitle>
            <DialogDescription>{t("dialogDetailsDesc")}</DialogDescription>
          </DialogHeader>
          {selectedFournisseur && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <div className="text-2xl font-bold">{selectedFournisseur.commandesLivrees}</div>
                        <div className="text-sm text-muted-foreground">{t("commandesLivrees")}</div>
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
                        <div className="text-sm text-muted-foreground">{t("livraisonsRetard")}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t("tauxFiabilite")}</span>
                  <span className={fiabiliteColor(selectedFournisseur.tauxFiabilite)}>{selectedFournisseur.tauxFiabilite}%</span>
                </div>
                <Progress value={selectedFournisseur.tauxFiabilite} />
              </div>

              {selectedFournisseur.delaiMoyenLivraison !== null && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  <span>{t("delaiMoyen")}<strong>{t("joursStrong", { n: selectedFournisseur.delaiMoyenLivraison })}</strong></span>
                </div>
              )}

              <div className="border-t pt-4">
                <div className="text-sm text-muted-foreground">{t("contact")}</div>
                <div className="mt-2 space-y-1">
                  {selectedFournisseur.fournisseur.contact && <div>{selectedFournisseur.fournisseur.contact}</div>}
                  {selectedFournisseur.fournisseur.email && <div className="text-blue-600">{selectedFournisseur.fournisseur.email}</div>}
                  {selectedFournisseur.fournisseur.telephone && <div>{selectedFournisseur.fournisseur.telephone}</div>}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsDetailDialogOpen(false)}>{t("fermer")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
