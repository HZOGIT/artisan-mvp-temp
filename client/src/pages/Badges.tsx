import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Plus, Trophy, Star, Target, Medal, Crown, Award, TrendingUp } from "lucide-react";

export default function Badges() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("badges");
  const [periode, setPeriode] = useState<"semaine" | "mois" | "trimestre" | "annee">("mois");

  const { data: badges, refetch } = trpc.badges.list.useQuery();
  const { data: techniciens } = trpc.techniciens.getAll.useQuery();
  const { data: classement } = trpc.badges.getClassement.useQuery({ periode });

  const createMutation = trpc.badges.create.useMutation({
    onSuccess: () => {
      toast.success("Badge créé");
      refetch();
      setIsDialogOpen(false);
    },
  });

  const calculerClassementMutation = trpc.badges.calculerClassement.useMutation({
    onSuccess: () => {
      toast.success("Classement mis à jour");
    },
  });

  const [formData, setFormData] = useState({
    code: "",
    nom: "",
    description: "",
    icone: "trophy",
    couleur: "#FFD700",
    categorie: "interventions" as const,
    seuil: 10,
    points: 100,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const getIcone = (icone: string) => {
    switch (icone) {
      case "trophy":
        return <Trophy className="h-6 w-6" />;
      case "star":
        return <Star className="h-6 w-6" />;
      case "medal":
        return <Medal className="h-6 w-6" />;
      case "crown":
        return <Crown className="h-6 w-6" />;
      case "award":
        return <Award className="h-6 w-6" />;
      default:
        return <Trophy className="h-6 w-6" />;
    }
  };

  const getCategorieBadge = (categorie: string) => {
    switch (categorie) {
      case "interventions":
        return <Badge className="bg-blue-500">Interventions</Badge>;
      case "avis":
        return <Badge className="bg-green-500">Avis</Badge>;
      case "ca":
        return <Badge className="bg-purple-500">CA</Badge>;
      case "anciennete":
        return <Badge className="bg-orange-500">Ancienneté</Badge>;
      case "special":
        return <Badge className="bg-pink-500">Spécial</Badge>;
      default:
        return <Badge>{categorie}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Badges & Gamification</h1>
          <p className="text-muted-foreground">Motivez vos techniciens avec des objectifs et récompenses</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Créer un badge
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau badge</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Code</Label>
                  <Input
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="EXPERT_100"
                    required
                  />
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input
                    value={formData.nom}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                    placeholder="Expert 100"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Label>Description</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Réaliser 100 interventions"
                  />
                </div>
                <div>
                  <Label>Catégorie</Label>
                  <Select
                    value={formData.categorie}
                    onValueChange={(v) => setFormData({ ...formData, categorie: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interventions">Interventions</SelectItem>
                      <SelectItem value="avis">Avis clients</SelectItem>
                      <SelectItem value="ca">Chiffre d'affaires</SelectItem>
                      <SelectItem value="anciennete">Ancienneté</SelectItem>
                      <SelectItem value="special">Spécial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Icône</Label>
                  <Select
                    value={formData.icone}
                    onValueChange={(v) => setFormData({ ...formData, icone: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trophy">🏆 Trophée</SelectItem>
                      <SelectItem value="star">⭐ Étoile</SelectItem>
                      <SelectItem value="medal">🏅 Médaille</SelectItem>
                      <SelectItem value="crown">👑 Couronne</SelectItem>
                      <SelectItem value="award">🎖️ Récompense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Seuil</Label>
                  <Input
                    type="number"
                    value={formData.seuil}
                    onChange={(e) => setFormData({ ...formData, seuil: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Points</Label>
                  <Input
                    type="number"
                    value={formData.points}
                    onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Couleur</Label>
                  <Input
                    type="color"
                    value={formData.couleur}
                    onChange={(e) => setFormData({ ...formData, couleur: e.target.value })}
                    className="h-10"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                Créer
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="badges">Badges</TabsTrigger>
          <TabsTrigger value="classement">Classement</TabsTrigger>
          <TabsTrigger value="objectifs">Objectifs</TabsTrigger>
        </TabsList>

        <TabsContent value="badges" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {badges?.map((badge) => (
              <Card key={badge.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div
                      className="p-3 rounded-lg"
                      style={{ backgroundColor: `${badge.couleur}20`, color: badge.couleur || "#FFD700" }}
                    >
                      {getIcone(badge.icone || "trophy")}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{badge.nom}</h3>
                        {getCategorieBadge(badge.categorie || "interventions")}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{badge.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="flex items-center gap-1">
                          <Target className="h-4 w-4" />
                          Seuil: {badge.seuil}
                        </span>
                        <span className="flex items-center gap-1">
                          <Star className="h-4 w-4" />
                          {badge.points} pts
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {(!badges || badges.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucun badge créé</p>
              <p className="text-sm">Créez des badges pour motiver vos techniciens</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="classement" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Classement des techniciens
                </CardTitle>
                <div className="flex gap-2">
                  <Select value={periode} onValueChange={(v) => setPeriode(v as any)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semaine">Cette semaine</SelectItem>
                      <SelectItem value="mois">Ce mois</SelectItem>
                      <SelectItem value="trimestre">Ce trimestre</SelectItem>
                      <SelectItem value="annee">Cette année</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={() => calculerClassementMutation.mutate({ periode })}
                  >
                    Actualiser
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {classement?.map((entry: any, index: number) => {
                  const technicien = techniciens?.find((t: any) => t.id === entry.technicienId);
                  const maxPoints = classement[0]?.pointsTotal || 1;
                  return (
                    <div key={entry.id} className="flex items-center gap-4">
                      <div className="w-8 h-8 flex items-center justify-center font-bold">
                        {index === 0 && <span className="text-2xl">🥇</span>}
                        {index === 1 && <span className="text-2xl">🥈</span>}
                        {index === 2 && <span className="text-2xl">🥉</span>}
                        {index > 2 && <span className="text-lg text-muted-foreground">{index + 1}</span>}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium">
                            {technicien ? `${technicien.prenom} ${technicien.nom}` : "Technicien"}
                          </span>
                          <span className="text-sm font-bold">{entry.pointsTotal} pts</span>
                        </div>
                        <Progress value={((entry.pointsTotal || 0) / maxPoints) * 100} className="h-2" />
                        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                          <span>{entry.interventions} interventions</span>
                          <span>Rang: {entry.rang}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!classement || classement.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    Aucun classement disponible pour cette période
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="objectifs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Objectifs mensuels</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {techniciens?.map((tech: any) => (
                  <div key={tech.id} className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-4">{tech.prenom} {tech.nom}</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Interventions</Label>
                        <div className="flex items-center gap-2">
                          <Progress value={60} className="flex-1" />
                          <span className="text-sm font-medium">6/10</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">CA généré</Label>
                        <div className="flex items-center gap-2">
                          <Progress value={75} className="flex-1" />
                          <span className="text-sm font-medium">7 500€/10 000€</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Avis positifs</Label>
                        <div className="flex items-center gap-2">
                          <Progress value={100} className="flex-1" />
                          <span className="text-sm font-medium">5/5</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {(!techniciens || techniciens.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    Aucun technicien enregistré
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
