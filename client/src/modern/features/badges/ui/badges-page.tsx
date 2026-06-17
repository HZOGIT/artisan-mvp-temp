import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trophy, Star, Target, Medal, Crown, Award, TrendingUp } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/modern/shared/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modern/shared/ui/tabs";
import { Badge } from "@/modern/shared/ui/badge";
import { Progress } from "@/modern/shared/ui/progress";
import { useBadges } from "../application/use-badges";
import { PERIODES, ICONES, CATEGORIES, categorieClass, rankMedal, progressPct, maxPoints, technicienLabel, type Periode, type BadgeForm } from "../domain/badges";

// Page `badges` (gamification techniciens) — migration clean-archi de `pages/Badges.tsx`. Markup/classes
// Tailwind conservés à l'identique (parité visuelle). tRPC encapsulé dans `use-badges`, règles en domain.
function iconeOf(icone: string) {
  switch (icone) {
    case "star": return <Star className="h-6 w-6" />;
    case "medal": return <Medal className="h-6 w-6" />;
    case "crown": return <Crown className="h-6 w-6" />;
    case "award": return <Award className="h-6 w-6" />;
    default: return <Trophy className="h-6 w-6" />;
  }
}

export default function BadgesPage() {
  const { t } = useTranslation("badges");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("badges");
  const [periode, setPeriode] = useState<Periode>("mois");
  const { badges, techniciens, classement, create, calculerClassement } = useBadges(periode);

  const [formData, setFormData] = useState<BadgeForm>({
    code: "", nom: "", description: "", icone: "trophy", couleur: "#FFD700",
    categorie: "interventions", seuil: 10, points: 100,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(formData, {
      onSuccess: () => { toast.success(t("toastCree")); setIsDialogOpen(false); },
    });
  };

  const max = maxPoints(classement);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t("titre")}</h1>
          <p className="text-muted-foreground">{t("sousTitre")}</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("creerBadge")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("nouveauBadge")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t("code")}</Label>
                  <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder={t("codePlaceholder")} required />
                </div>
                <div>
                  <Label>{t("nom")}</Label>
                  <Input value={formData.nom} onChange={(e) => setFormData({ ...formData, nom: e.target.value })} placeholder={t("nomPlaceholder")} required />
                </div>
                <div className="col-span-2">
                  <Label>{t("description")}</Label>
                  <Input value={formData.description ?? ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={t("descriptionPlaceholder")} />
                </div>
                <div>
                  <Label>{t("categorie")}</Label>
                  <Select value={formData.categorie} onValueChange={(v) => setFormData({ ...formData, categorie: v as BadgeForm["categorie"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{t(`categorieOption.${c}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("icone")}</Label>
                  <Select value={formData.icone ?? "trophy"} onValueChange={(v) => setFormData({ ...formData, icone: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ICONES.map((ic) => (
                        <SelectItem key={ic} value={ic}>{t(`iconeOption.${ic}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("seuil")}</Label>
                  <Input type="number" value={formData.seuil ?? 0} onChange={(e) => setFormData({ ...formData, seuil: parseInt(e.target.value) })} />
                </div>
                <div>
                  <Label>{t("points")}</Label>
                  <Input type="number" value={formData.points} onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) })} />
                </div>
                <div>
                  <Label>{t("couleur")}</Label>
                  <Input type="color" value={formData.couleur ?? "#FFD700"} onChange={(e) => setFormData({ ...formData, couleur: e.target.value })} className="h-10" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {t("creer")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="badges">{t("tabBadges")}</TabsTrigger>
          <TabsTrigger value="classement">{t("tabClassement")}</TabsTrigger>
          <TabsTrigger value="objectifs">{t("tabObjectifs")}</TabsTrigger>
        </TabsList>

        <TabsContent value="badges" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {badges.map((badge) => (
              <Card key={badge.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg" style={{ backgroundColor: `${badge.couleur}20`, color: badge.couleur || "#FFD700" }}>
                      {iconeOf(badge.icone || "trophy")}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{badge.nom}</h3>
                        <Badge className={categorieClass(badge.categorie || "interventions")}>{t(`categorieBadge.${badge.categorie || "interventions"}`)}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{badge.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="flex items-center gap-1">
                          <Target className="h-4 w-4" />
                          {t("seuilLabel", { seuil: badge.seuil })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Star className="h-4 w-4" />
                          {t("pts", { points: badge.points })}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {badges.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("aucunBadge")}</p>
              <p className="text-sm">{t("aucunBadgeAstuce")}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="classement" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  {t("classementTitre")}
                </CardTitle>
                <div className="flex gap-2">
                  <Select value={periode} onValueChange={(v) => setPeriode(v as Periode)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERIODES.map((p) => (
                        <SelectItem key={p} value={p}>{t(`periode.${p}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => calculerClassement.mutate({ periode }, { onSuccess: () => toast.success(t("toastClassement")) })}>
                    {t("actualiser")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {classement.map((entry, index) => {
                  const technicien = techniciens.find((tech) => tech.id === entry.technicienId);
                  const medal = rankMedal(index);
                  return (
                    <div key={entry.id} className="flex items-center gap-4">
                      <div className="w-8 h-8 flex items-center justify-center font-bold">
                        {medal ? <span className="text-2xl">{medal}</span> : <span className="text-lg text-muted-foreground">{index + 1}</span>}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium">{technicienLabel(technicien)}</span>
                          <span className="text-sm font-bold">{t("ptsTotal", { points: entry.pointsTotal })}</span>
                        </div>
                        <Progress value={progressPct(entry.pointsTotal || 0, max)} className="h-2" />
                        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                          <span>{t("nbInterventions", { count: entry.interventions })}</span>
                          <span>{t("rang", { rang: entry.rang })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {classement.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">{t("aucunClassement")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="objectifs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("objectifsMensuels")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {techniciens.map((tech) => (
                  <div key={tech.id} className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-4">{tech.prenom} {tech.nom}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("objInterventions")}</Label>
                        <div className="flex items-center gap-2">
                          <Progress value={60} className="flex-1" />
                          <span className="text-sm font-medium">6/10</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("objCa")}</Label>
                        <div className="flex items-center gap-2">
                          <Progress value={75} className="flex-1" />
                          <span className="text-sm font-medium">7 500€/10 000€</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("objAvis")}</Label>
                        <div className="flex items-center gap-2">
                          <Progress value={100} className="flex-1" />
                          <span className="text-sm font-medium">5/5</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {techniciens.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">{t("aucunTechnicien")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
