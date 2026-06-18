import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Building2, Calendar, Euro, Users, FileText, Trash2, Edit, ChevronRight, Clock, CheckCircle2, PauseCircle, XCircle, AlertCircle, Eye, EyeOff, ListChecks, Bell, Circle, AlarmClock } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/modern/shared/ui/dialog";
import { Badge } from "@/modern/shared/ui/badge";
import { Progress } from "@/modern/shared/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modern/shared/ui/tabs";
import { Switch } from "@/modern/shared/ui/switch";
import { useChantiers } from "../application/use-chantiers";
import { defaultChantierForm, statutVariant, prioriteColor, techNom, mainOeuvreSynthese, activitesForChantier, activitesParEcheance, rappelsActifs, suiviPourcentage, PRIORITES, STATUTS, RAPPEL_TYPES, type Priorite, type StatutChantier, type ActiviteType, type SuiviStatut } from "../domain/chantiers";

const STATUT_ICON: Record<string, typeof Clock> = { planifie: Clock, en_cours: AlertCircle, en_pause: PauseCircle, termine: CheckCircle2, annule: XCircle };
const STATUT_KEY: Record<string, string> = { planifie: "statutPlanifie", en_cours: "statutEnCours", en_pause: "statutEnPause", termine: "statutTermine", annule: "statutAnnule", a_faire: "statutAFaire" };

// Page `chantiers` — migration clean-archi de `pages/Chantiers.tsx`. Markup à l'identique. Agrégats
// (main-d'œuvre, rappels) + règles (badges) en domain (purs, testés) ; tRPC encapsulé dans `use-chantiers`.
export default function ChantiersPage() {
  const { t } = useTranslation("chantiers");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedChantier, setSelectedChantier] = useState<number | null>(null);
  const [formData, setFormData] = useState(defaultChantierForm);
  const [suiviForm, setSuiviForm] = useState({ titre: "", description: "", ordre: 1, visibleClient: true });
  const [isSuiviDialogOpen, setIsSuiviDialogOpen] = useState(false);
  const [pointageForm, setPointageForm] = useState({ date: new Date().toISOString().slice(0, 10), heures: "", technicienId: "", description: "" });
  const [rappelTitre, setRappelTitre] = useState("");
  const [rappelEcheance, setRappelEcheance] = useState("");
  const [rappelType, setRappelType] = useState<ActiviteType>("autre");

  const c = useChantiers(selectedChantier);
  const { chantiers, clients, techniciens, chantierDetails, phases, interventions, statistiques, suiviEtapes, pointages, activites } = c;
  const activitesChantier = activitesForChantier(activites, selectedChantier);

  const StatutBadge = ({ statut: s }: { statut: string }) => {
    const Icon = STATUT_ICON[s] ?? Clock;
    return <Badge variant={statutVariant(s)} className="flex items-center gap-1"><Icon className="h-3 w-3" />{t(STATUT_KEY[s] ?? "statutPlanifie")}</Badge>;
  };

  const handleSubmit = () => {
    if (!formData.clientId || !formData.reference || !formData.nom) { toast.error(t("champsObligatoires")); return; }
    c.create.mutate(formData, { onSuccess: () => { toast.success(t("toastCree")); setIsDialogOpen(false); setFormData(defaultChantierForm()); }, onError: (e) => toast.error(e.message) });
  };

  if (c.isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  const synth = mainOeuvreSynthese(phases, pointages);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("titre")}</h1>
          <p className="text-muted-foreground mt-1">{t("sousTitre")}</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t("nouveauChantier")}</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("creerTitre")}</DialogTitle>
              <DialogDescription>{t("creerDesc")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("client")}</Label>
                  <Select value={formData.clientId.toString()} onValueChange={(v) => setFormData({ ...formData, clientId: parseInt(v) })}>
                    <SelectTrigger><SelectValue placeholder={t("selClient")} /></SelectTrigger>
                    <SelectContent>{clients.map((client) => (<SelectItem key={client.id} value={client.id.toString()}>{client.nom}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference">{t("reference")}</Label>
                  <Input id="reference" value={formData.reference} onChange={(e) => setFormData({ ...formData, reference: e.target.value })} placeholder="CHANT-2024-001" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nom">{t("nom")}</Label>
                <Input id="nom" value={formData.nom} onChange={(e) => setFormData({ ...formData, nom: e.target.value })} placeholder={t("nomPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t("description")}</Label>
                <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={t("descriptionPlaceholder")} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2"><Label htmlFor="adresse">{t("adresse")}</Label><Input id="adresse" value={formData.adresse} onChange={(e) => setFormData({ ...formData, adresse: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="codePostal">{t("codePostal")}</Label><Input id="codePostal" value={formData.codePostal} onChange={(e) => setFormData({ ...formData, codePostal: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="ville">{t("ville")}</Label><Input id="ville" value={formData.ville} onChange={(e) => setFormData({ ...formData, ville: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2"><Label htmlFor="dateDebut">{t("dateDebut")}</Label><Input id="dateDebut" type="date" value={formData.dateDebut} onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="dateFinPrevue">{t("dateFinPrevue")}</Label><Input id="dateFinPrevue" type="date" value={formData.dateFinPrevue} onChange={(e) => setFormData({ ...formData, dateFinPrevue: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="budgetPrevisionnel">{t("budget")}</Label><Input id="budgetPrevisionnel" type="number" value={formData.budgetPrevisionnel} onChange={(e) => setFormData({ ...formData, budgetPrevisionnel: e.target.value })} /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priorite">{t("priorite")}</Label>
                <Select value={formData.priorite} onValueChange={(v) => setFormData({ ...formData, priorite: v as Priorite })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITES.map((p) => (<SelectItem key={p} value={p}>{t(`priorites.${p}`)}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t("annuler")}</Button>
              <Button onClick={handleSubmit} disabled={c.create.isPending}>{c.create.isPending ? t("creation") : t("creer")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste */}
        <div className="lg:col-span-1 space-y-4">
          {chantiers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t("aucunChantier")}</p>
                <Button variant="link" onClick={() => setIsDialogOpen(true)}>{t("creerPremier")}</Button>
              </CardContent>
            </Card>
          ) : (
            chantiers.map((chantier) => (
              <Card key={chantier.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedChantier === chantier.id ? "ring-2 ring-primary" : ""}`} onClick={() => setSelectedChantier(chantier.id)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div><CardTitle className="text-base">{chantier.nom}</CardTitle><CardDescription>{chantier.reference}</CardDescription></div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2">
                    <StatutBadge statut={chantier.statut || "planifie"} />
                    <Badge className={prioriteColor(chantier.priorite || "normale")}>{t(`priorites.${chantier.priorite || "normale"}`)}</Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("avancement")}</span><span>{chantier.avancement || 0}%</span></div>
                    <Progress value={chantier.avancement || 0} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Détails */}
        <div className="lg:col-span-2">
          {selectedChantier && chantierDetails ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div><CardTitle>{chantierDetails.nom}</CardTitle><CardDescription>{chantierDetails.reference}</CardDescription></div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm"><Edit className="h-4 w-4 mr-1" />{t("modifier")}</Button>
                      <Button variant="destructive" size="sm" onClick={() => c.remove.mutate({ id: selectedChantier }, { onSuccess: () => { toast.success(t("toastSupprime")); setSelectedChantier(null); }, onError: (e) => toast.error(e.message) })}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="apercu">
                    <TabsList className="mb-4">
                      <TabsTrigger value="apercu">{t("tabApercu")}</TabsTrigger>
                      <TabsTrigger value="phases">{t("tabPhases")}</TabsTrigger>
                      <TabsTrigger value="mainoeuvre">{t("tabMainoeuvre")}</TabsTrigger>
                      <TabsTrigger value="interventions">{t("tabInterventions")}</TabsTrigger>
                      <TabsTrigger value="documents">{t("tabDocuments")}</TabsTrigger>
                      <TabsTrigger value="suivi">{t("tabSuivi")}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="apercu" className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card><CardContent className="pt-4"><div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">{t("debut")}</span></div><p className="text-lg font-semibold mt-1">{chantierDetails.dateDebut ? new Date(chantierDetails.dateDebut).toLocaleDateString() : "-"}</p></CardContent></Card>
                        <Card><CardContent className="pt-4"><div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">{t("finPrevue")}</span></div><p className="text-lg font-semibold mt-1">{chantierDetails.dateFinPrevue ? new Date(chantierDetails.dateFinPrevue).toLocaleDateString() : "-"}</p></CardContent></Card>
                        <Card><CardContent className="pt-4"><div className="flex items-center gap-2"><Euro className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">{t("budgetCourt")}</span></div><p className="text-lg font-semibold mt-1">{parseFloat(chantierDetails.budgetPrevisionnel || "0").toLocaleString()} €</p></CardContent></Card>
                        <Card><CardContent className="pt-4"><div className="flex items-center gap-2"><Euro className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">{t("coutReel")}</span></div><p className="text-lg font-semibold mt-1">{(statistiques?.coutReel || 0).toLocaleString()} €</p></CardContent></Card>
                        {statistiques?.marge !== null && statistiques?.marge !== undefined && (
                          <Card><CardContent className="pt-4"><div className="flex items-center gap-2"><Euro className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">{t("marge")}</span></div><p className={`text-lg font-semibold mt-1 ${statistiques.marge >= 0 ? "text-green-600" : "text-red-600"}`}>{statistiques.marge.toLocaleString()} €{statistiques.margePct !== null && statistiques.margePct !== undefined && (<span className="text-sm font-normal"> ({statistiques.margePct}%)</span>)}</p></CardContent></Card>
                        )}
                        <Card><CardContent className="pt-4"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">{t("interventionsLabel")}</span></div><p className="text-lg font-semibold mt-1">{statistiques?.nombreInterventions || 0}</p></CardContent></Card>
                      </div>
                      {chantierDetails.description && (<div><h3 className="font-semibold mb-2">{t("description")}</h3><p className="text-muted-foreground">{chantierDetails.description}</p></div>)}
                      {(chantierDetails.adresse || chantierDetails.ville) && (<div><h3 className="font-semibold mb-2">{t("adresseLabel")}</h3><p className="text-muted-foreground">{chantierDetails.adresse}{chantierDetails.codePostal && `, ${chantierDetails.codePostal}`}{chantierDetails.ville && ` ${chantierDetails.ville}`}</p></div>)}
                      <div>
                        <h3 className="font-semibold mb-2">{t("avancementGlobal")}</h3>
                        <div className="space-y-2"><div className="flex justify-between text-sm"><span>{t("progression")}</span><span>{chantierDetails.avancement || 0}%</span></div><Progress value={chantierDetails.avancement || 0} className="h-3" /></div>
                      </div>
                      <div className="flex gap-2">
                        <Select value={chantierDetails.statut || "planifie"} onValueChange={(v) => c.update.mutate({ id: selectedChantier, statut: v as StatutChantier }, { onSuccess: () => toast.success(t("toastMaj")), onError: (e) => toast.error(e.message) })}>
                          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUTS.map((s) => (<SelectItem key={s} value={s}>{t(STATUT_KEY[s])}</SelectItem>))}</SelectContent>
                        </Select>
                      </div>
                    </TabsContent>

                    <TabsContent value="phases">
                      <div className="space-y-4">
                        {phases.length === 0 ? (
                          <p className="text-muted-foreground text-center py-8">{t("aucunePhase")}</p>
                        ) : (
                          phases.map((phase, index) => (
                            <Card key={phase.id}>
                              <CardContent className="pt-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-semibold">{index + 1}</div>
                                    <div><h4 className="font-semibold">{phase.nom}</h4>{phase.description && (<p className="text-sm text-muted-foreground">{phase.description}</p>)}</div>
                                  </div>
                                  <StatutBadge statut={phase.statut || "a_faire"} />
                                </div>
                                <div className="mt-3"><Progress value={phase.avancement || 0} className="h-2" /></div>
                              </CardContent>
                            </Card>
                          ))
                        )}
                        <Button variant="outline" className="w-full"><Plus className="h-4 w-4 mr-2" />{t("ajouterPhase")}</Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="mainoeuvre">
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <Card><CardContent className="pt-4 text-center"><p className="text-sm text-muted-foreground">{t("heuresPrevues")}</p><p className="text-2xl font-bold">{t("heuresUnit", { n: synth.totalPrevues.toFixed(1) })}</p></CardContent></Card>
                          <Card><CardContent className="pt-4 text-center"><p className="text-sm text-muted-foreground">{t("heuresPointees")}</p><p className="text-2xl font-bold">{t("heuresUnit", { n: synth.totalPointees.toFixed(1) })}</p></CardContent></Card>
                          <Card><CardContent className="pt-4 text-center"><p className="text-sm text-muted-foreground">{t("ecart")}</p><p className={`text-2xl font-bold ${synth.ecart > 0 ? "text-red-600" : "text-green-600"}`}>{t("heuresUnit", { n: `${synth.ecart > 0 ? "+" : ""}${synth.ecart.toFixed(1)}` })}</p></CardContent></Card>
                        </div>
                        <form className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end border rounded-lg p-3" onSubmit={(e) => {
                          e.preventDefault();
                          const heures = parseFloat(pointageForm.heures);
                          if (!pointageForm.date) { toast.error(t("dateRequise")); return; }
                          if (!(heures > 0)) { toast.error(t("heuresInvalides")); return; }
                          c.addPointage.mutate({ chantierId: selectedChantier, date: pointageForm.date, heures, technicienId: pointageForm.technicienId ? parseInt(pointageForm.technicienId) : undefined, description: pointageForm.description || undefined }, { onSuccess: () => { toast.success(t("toastPointageAjoute")); setPointageForm({ date: new Date().toISOString().slice(0, 10), heures: "", technicienId: "", description: "" }); }, onError: (e2) => toast.error(e2.message) });
                        }}>
                          <div><Label className="text-xs">{t("dateDebut")}</Label><Input type="date" value={pointageForm.date} onChange={(e) => setPointageForm({ ...pointageForm, date: e.target.value })} /></div>
                          <div><Label className="text-xs">{t("heures")}</Label><Input type="number" step="0.25" min="0" max="24" placeholder="7.5" value={pointageForm.heures} onChange={(e) => setPointageForm({ ...pointageForm, heures: e.target.value })} /></div>
                          <div>
                            <Label className="text-xs">{t("technicien")}</Label>
                            <Select value={pointageForm.technicienId || "none"} onValueChange={(v) => setPointageForm({ ...pointageForm, technicienId: v === "none" ? "" : v })}>
                              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                {techniciens.map((tech) => (<SelectItem key={tech.id} value={String(tech.id)}>{`${tech.prenom || ""} ${tech.nom}`.trim()}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div><Label className="text-xs">{t("description")}</Label><Input value={pointageForm.description} onChange={(e) => setPointageForm({ ...pointageForm, description: e.target.value })} /></div>
                          <Button type="submit" disabled={c.addPointage.isPending}><Plus className="h-4 w-4 mr-1" /> {t("pointer")}</Button>
                        </form>
                        {pointages.length > 0 ? (
                          <div className="space-y-1.5">
                            {pointages.map((p) => (
                              <div key={p.id} className="flex items-center justify-between gap-2 border rounded-lg p-2.5 text-sm">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="font-semibold w-16">{t("heuresUnit", { n: Number(p.heures).toFixed(2) })}</span>
                                  <span className="text-muted-foreground">{new Date(p.date).toLocaleDateString("fr-FR")}</span>
                                  <span>{techNom(techniciens, p.technicienId)}</span>
                                  {p.description && <span className="text-muted-foreground truncate">— {p.description}</span>}
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => { if (confirm(t("confirmPointage"))) c.deletePointage.mutate({ chantierId: selectedChantier, id: p.id }, { onSuccess: () => toast.success(t("toastPointageSupprime")), onError: (e) => toast.error(e.message) }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </div>
                            ))}
                          </div>
                        ) : (<p className="text-sm text-muted-foreground text-center py-4">{t("aucunPointage")}</p>)}
                      </div>
                    </TabsContent>

                    <TabsContent value="interventions">
                      <div className="space-y-4">
                        {interventions.length === 0 ? (
                          <p className="text-muted-foreground text-center py-8">{t("aucuneIntervention")}</p>
                        ) : (
                          interventions.map((lien) => (
                            <Card key={lien.id}>
                              <CardContent className="pt-4">
                                <div className="flex items-center justify-between">
                                  <div><h4 className="font-semibold">{t("interventionNum", { id: lien.interventionId })}</h4><p className="text-sm text-muted-foreground">{lien.createdAt ? new Date(lien.createdAt).toLocaleDateString() : t("dateNonDefinie")}</p></div>
                                </div>
                              </CardContent>
                            </Card>
                          ))
                        )}
                        <Button variant="outline" className="w-full"><Plus className="h-4 w-4 mr-2" />{t("associerIntervention")}</Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="documents">
                      <div className="space-y-4">
                        <p className="text-muted-foreground text-center py-8">{t("aucunDocument")}</p>
                        <Button variant="outline" className="w-full"><FileText className="h-4 w-4 mr-2" />{t("ajouterDocument")}</Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="suivi">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold flex items-center gap-2"><ListChecks className="h-4 w-4" />{t("etapesSuivi")}</h3>
                          <Dialog open={isSuiviDialogOpen} onOpenChange={setIsSuiviDialogOpen}>
                            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />{t("ajouter")}</Button></DialogTrigger>
                            <DialogContent>
                              <DialogHeader><DialogTitle>{t("nouvelleEtape")}</DialogTitle><DialogDescription>{t("nouvelleEtapeDesc")}</DialogDescription></DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2"><Label>{t("titreEtape")}</Label><Input value={suiviForm.titre} onChange={(e) => setSuiviForm({ ...suiviForm, titre: e.target.value })} placeholder={t("titreEtapePlaceholder")} /></div>
                                <div className="space-y-2"><Label>{t("description")}</Label><Textarea value={suiviForm.description} onChange={(e) => setSuiviForm({ ...suiviForm, description: e.target.value })} placeholder={t("detailsEtape")} /></div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2"><Label>{t("ordre")}</Label><Input type="number" value={suiviForm.ordre} onChange={(e) => setSuiviForm({ ...suiviForm, ordre: parseInt(e.target.value) || 1 })} /></div>
                                  <div className="flex items-center gap-2 pt-6"><Switch checked={suiviForm.visibleClient} onCheckedChange={(v) => setSuiviForm({ ...suiviForm, visibleClient: v })} /><Label>{t("visibleClient")}</Label></div>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button onClick={() => { if (!suiviForm.titre) { toast.error(t("titreRequis")); return; } c.createSuivi.mutate({ chantierId: selectedChantier, ...suiviForm }, { onSuccess: () => { toast.success(t("etapeAjoutee")); setIsSuiviDialogOpen(false); setSuiviForm({ titre: "", description: "", ordre: 1, visibleClient: true }); }, onError: (e) => toast.error(e.message) }); }}>{t("ajouter")}</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                        {suiviEtapes.length === 0 ? (
                          <p className="text-muted-foreground text-center py-8">{t("aucuneEtape")}</p>
                        ) : (
                          <div className="space-y-3">
                            {suiviEtapes.map((etape) => (
                              <Card key={etape.id} className={etape.statut === "termine" ? "border-green-200 bg-green-50/30" : etape.statut === "en_cours" ? "border-blue-200 bg-blue-50/30" : ""}>
                                <CardContent className="pt-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                      <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${etape.statut === "termine" ? "bg-green-500 text-white" : etape.statut === "en_cours" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-600"}`}>{etape.ordre}</div>
                                      <div><h4 className="font-semibold">{etape.titre}</h4>{etape.description && <p className="text-sm text-muted-foreground">{etape.description}</p>}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {etape.visibleClient ? <Eye className="h-4 w-4 text-green-500" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
                                      <Select value={etape.statut || "a_faire"} onValueChange={(v) => c.updateSuivi.mutate({ id: etape.id, statut: v as SuiviStatut, pourcentage: suiviPourcentage(v) }, { onSuccess: () => toast.success(t("toastSuiviMaj")), onError: (e) => toast.error(e.message) })}>
                                        <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="a_faire">{t("statutAFaire")}</SelectItem>
                                          <SelectItem value="en_cours">{t("statutEnCoursCourt")}</SelectItem>
                                          <SelectItem value="termine">{t("statutTermineCourt")}</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Button variant="ghost" size="sm" onClick={() => c.deleteSuivi.mutate({ id: etape.id }, { onSuccess: () => toast.success(t("toastSuiviSupprime")), onError: (e) => toast.error(e.message) })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                                    </div>
                                  </div>
                                  <Progress value={etape.pourcentage || 0} className="h-2" />
                                  <p className="text-xs text-muted-foreground mt-1">{etape.pourcentage || 0}%</p>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              {/* Rappels CRM */}
              <Card className="mt-4">
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-5 w-5" />{t("rappels", { n: rappelsActifs(activitesChantier) })}</CardTitle></CardHeader>
                <CardContent>
                  <form className="flex flex-col sm:flex-row gap-2 mb-4" onSubmit={(e) => {
                    e.preventDefault();
                    if (!rappelTitre.trim()) { toast.error(t("rappelTitreRequis")); return; }
                    if (!rappelEcheance) { toast.error(t("rappelEcheanceRequise")); return; }
                    c.createRappel.mutate({ titre: rappelTitre.trim(), echeance: rappelEcheance, type: rappelType, entiteType: "chantier", entiteId: selectedChantier }, { onSuccess: () => { toast.success(t("toastRappelAjoute")); setRappelTitre(""); setRappelEcheance(""); setRappelType("autre"); }, onError: (e2) => toast.error(e2.message) });
                  }}>
                    <Input placeholder={t("rappelPlaceholder")} value={rappelTitre} onChange={(e) => setRappelTitre(e.target.value)} className="flex-1" />
                    <Input type="date" value={rappelEcheance} onChange={(e) => setRappelEcheance(e.target.value)} className="sm:w-40" />
                    <Select value={rappelType} onValueChange={(v) => setRappelType(v as ActiviteType)}>
                      <SelectTrigger className="sm:w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>{RAPPEL_TYPES.map((rt) => (<SelectItem key={rt} value={rt}>{t(`rappelType.${rt}`)}</SelectItem>))}</SelectContent>
                    </Select>
                    <Button type="submit" disabled={c.createRappel.isPending}><Plus className="h-4 w-4 mr-1" /> {t("ajouter")}</Button>
                  </form>
                  {activitesChantier.length > 0 ? (
                    <div className="space-y-2">
                      {activitesParEcheance(activitesChantier).map((a) => (
                        <div key={a.id} className="flex items-start gap-2 p-3 rounded-lg border">
                          <button type="button" title={a.fait ? t("marquerAFaire") : t("marquerFait")} onClick={() => c.toggleRappel.mutate({ id: a.id, fait: !a.fait })} className="mt-0.5 shrink-0">
                            {a.fait ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${a.fait ? "line-through text-muted-foreground" : ""}`}>{a.titre}</p>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1"><AlarmClock className="h-3 w-3" />{new Date(a.echeance).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</span>
                              <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">{t(`rappelType.${a.type}`, a.type)}</span>
                            </div>
                          </div>
                          <button type="button" title={t("supprimer")} onClick={() => c.deleteRappel.mutate({ id: a.id })} className="mt-0.5 shrink-0 text-muted-foreground hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  ) : (<p className="text-center py-6 text-sm text-muted-foreground">{t("aucunRappel")}</p>)}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t("selectionnezChantier")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
