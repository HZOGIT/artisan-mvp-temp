import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Calendar, Plus, Check, X, Clock, User, CalendarDays } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/shared/ui/dialog";
import { Badge } from "@/shared/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useConges } from "../application/use-conges";
import {
  calculerJours, technicienNom, filterByStatut, TYPES_CONGE, type Conge, type StatutConge, type TypeConge,
} from "../domain/conge";

/** Classes de couleur par statut (présentation pure — pas de libellé : ceux-ci passent par l'i18n). */
const STATUT_COLOR: Record<StatutConge, string> = {
  en_attente: "bg-yellow-100 text-yellow-800",
  approuve: "bg-green-100 text-green-800",
  refuse: "bg-red-100 text-red-800",
  annule: "bg-gray-100 text-gray-800",
};

export default function CongesPage() {
  const { t } = useTranslation("conges");
  const { conges, congesEnAttente, techniciens, isLoading, create, approuver, refuser } = useConges();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTechnicien, setSelectedTechnicien] = useState<string>("");
  const [typeConge, setTypeConge] = useState<TypeConge>("conge_paye");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [motif, setMotif] = useState("");
  const [commentaireRefus, setCommentaireRefus] = useState("");
  const [congeARefuser, setCongeARefuser] = useState<number | null>(null);

  const resetForm = () => {
    setSelectedTechnicien("");
    setTypeConge("conge_paye");
    setDateDebut("");
    setDateFin("");
    setMotif("");
  };

  const nomTechnicien = (technicienId: number) => technicienNom(techniciens, technicienId) || t("inconnu");
  const dateRange = (debut: string, fin: string) =>
    `${new Date(debut).toLocaleDateString("fr-FR")} ${t("auMilieu")} ${new Date(fin).toLocaleDateString("fr-FR")}`;

  const handleSubmit = () => {
    if (!selectedTechnicien || !dateDebut || !dateFin) {
      toast.error(t("champsObligatoires"));
      return;
    }
    create.mutate(
      { technicienId: parseInt(selectedTechnicien), type: typeConge, dateDebut, dateFin, motif: motif || undefined },
      {
        onSuccess: () => { toast.success(t("toastCree")); setIsDialogOpen(false); resetForm(); },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const handleApprouver = (id: number) =>
    approuver.mutate({ id }, { onSuccess: () => toast.success(t("toastApprouve")), onError: (e) => toast.error(e.message) });

  const handleRefuser = () => {
    if (congeARefuser === null) return;
    refuser.mutate(
      { id: congeARefuser, commentaire: commentaireRefus || undefined },
      {
        onSuccess: () => { toast.success(t("toastRefuse")); setCongeARefuser(null); setCommentaireRefus(""); },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const ligneConge = (conge: Conge, icon: React.ReactNode, iconBg: string, badge: React.ReactNode, raison?: string | null) => (
    <div key={conge.id} className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex items-center gap-4">
        <div className={`h-10 w-10 rounded-full ${iconBg} flex items-center justify-center`}>{icon}</div>
        <div>
          <p className="font-medium">{nomTechnicien(conge.technicienId)}</p>
          <p className="text-sm text-muted-foreground">
            {t(`type.${conge.type}`)} • {dateRange(conge.dateDebut, conge.dateFin)}
          </p>
          {raison && <p className="text-sm text-red-600 mt-1">{t("raisonPrefix", { commentaire: raison })}</p>}
        </div>
      </div>
      {badge}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("nouvelleDemande")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{t("dialogTitle")}</DialogTitle>
              <DialogDescription>{t("dialogDescription")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>{t("technicien")}</Label>
                <Select value={selectedTechnicien} onValueChange={setSelectedTechnicien}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("technicienPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {techniciens.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id.toString()}>
                        {tech.prenom} {tech.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{t("typeLabel")}</Label>
                <Select value={typeConge} onValueChange={(v) => setTypeConge(v as TypeConge)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES_CONGE.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`type.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>{t("dateDebut")}</Label>
                  <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>{t("dateFin")}</Label>
                  <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
                </div>
              </div>
              {dateDebut && dateFin && (
                <p className="text-sm text-muted-foreground">
                  {t("duree", { count: calculerJours(dateDebut, dateFin) })}
                </p>
              )}
              <div className="grid gap-2">
                <Label>{t("motif")}</Label>
                <Textarea value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={t("motifPlaceholder")} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t("annuler")}</Button>
              <Button onClick={handleSubmit} disabled={create.isPending}>
                {create.isPending ? t("creationEnCours") : t("creer")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {congesEnAttente.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <Clock className="h-5 w-5" />
              {t("enAttenteTitre", { count: congesEnAttente.length })}
            </CardTitle>
            <CardDescription>{t("enAttenteDescription")}</CardDescription>
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
                      <p className="font-medium">{nomTechnicien(conge.technicienId)}</p>
                      <p className="text-sm text-muted-foreground">
                        {t(`type.${conge.type}`)} • {dateRange(conge.dateDebut, conge.dateFin)}
                      </p>
                      {conge.motif && (
                        <p className="text-sm text-muted-foreground mt-1">{t("motifPrefix", { motif: conge.motif })}</p>
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
                      {t("refuser")}
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleApprouver(conge.id)}
                      disabled={approuver.isPending}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      {t("approuver")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={congeARefuser !== null} onOpenChange={() => setCongeARefuser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("refusDialogTitle")}</DialogTitle>
            <DialogDescription>{t("refusDialogDescription")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={commentaireRefus}
            onChange={(e) => setCommentaireRefus(e.target.value)}
            placeholder={t("refusPlaceholder")}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCongeARefuser(null)}>{t("annuler")}</Button>
            <Button variant="destructive" onClick={handleRefuser} disabled={refuser.isPending}>
              {t("confirmerRefus")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="tous">
        <TabsList>
          <TabsTrigger value="tous">{t("tabTous")}</TabsTrigger>
          <TabsTrigger value="approuve">{t("tabApprouve")}</TabsTrigger>
          <TabsTrigger value="refuse">{t("tabRefuse")}</TabsTrigger>
        </TabsList>

        <TabsContent value="tous" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("historiqueTitre")}</CardTitle>
            </CardHeader>
            <CardContent>
              {conges.length > 0 ? (
                <div className="space-y-4">
                  {conges.map((conge) =>
                    ligneConge(
                      conge,
                      <CalendarDays className="h-5 w-5 text-primary" />,
                      "bg-primary/10",
                      <Badge className={STATUT_COLOR[conge.statut]}>{t(`statut.${conge.statut}`)}</Badge>,
                    ),
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t("aucunConge")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approuve" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {filterByStatut(conges, "approuve").length ? (
                <div className="space-y-4">
                  {filterByStatut(conges, "approuve").map((conge) =>
                    ligneConge(
                      conge,
                      <Check className="h-5 w-5 text-green-600" />,
                      "bg-green-100",
                      <Badge className="bg-green-100 text-green-800">{t("statut.approuve")}</Badge>,
                    ),
                  )}
                </div>
              ) : (
                <p className="text-center py-8 text-muted-foreground">{t("aucunApprouve")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refuse" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {filterByStatut(conges, "refuse").length ? (
                <div className="space-y-4">
                  {filterByStatut(conges, "refuse").map((conge) =>
                    ligneConge(
                      conge,
                      <X className="h-5 w-5 text-red-600" />,
                      "bg-red-100",
                      <Badge className="bg-red-100 text-red-800">{t("statut.refuse")}</Badge>,
                      conge.commentaireValidation,
                    ),
                  )}
                </div>
              ) : (
                <p className="text-center py-8 text-muted-foreground">{t("aucunRefuse")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
