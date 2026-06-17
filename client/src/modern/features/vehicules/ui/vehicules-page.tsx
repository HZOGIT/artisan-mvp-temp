import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Car, Wrench, Shield, Gauge, AlertTriangle, Edit, Trash2 } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/modern/shared/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modern/shared/ui/tabs";
import { Badge } from "@/modern/shared/ui/badge";
import { useVehicules } from "../application/use-vehicules";
import { CARBURANTS, statutClass, statutVariant, technicienPrenom, vehiculeImmat, type TypeCarburant } from "../domain/vehicules";

// Page `vehicules` (gestion de flotte) — migration clean-archi de `pages/Vehicules.tsx`. Markup/classes
// conservés (parité). tRPC encapsulé dans `use-vehicules`. NB : la valeur "none" du sélecteur technicien
// remplace la chaîne vide legacy (Radix Select interdit `value=""`).
type FormState = {
  immatriculation: string; marque: string; modele: string; annee: number;
  typeCarburant: TypeCarburant; puissanceFiscale: number | undefined;
  kilometrageActuel: number; technicienId: number | undefined;
};
const EMPTY_FORM: FormState = {
  immatriculation: "", marque: "", modele: "", annee: new Date().getFullYear(),
  typeCarburant: "diesel", puissanceFiscale: undefined, kilometrageActuel: 0, technicienId: undefined,
};

export default function VehiculesPage() {
  const { t } = useTranslation("vehicules");
  const { vehicules, techniciens, stats, assurancesExpirant, entretiensAVenir, create, remove } = useVehicules();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("liste");
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(formData, {
      onSuccess: () => { toast.success(t("toastAjoute")); setIsDialogOpen(false); setFormData(EMPTY_FORM); },
    });
  };

  const StatutBadge = ({ statut }: { statut: string }) => {
    const cls = statutClass(statut);
    return <Badge className={cls ?? undefined} variant={statutVariant(statut)}>{t(`statut.${statut}`, statut)}</Badge>;
  };

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
              {t("ajouter")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("nouveau")}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t("immatriculation")}</Label>
                  <Input value={formData.immatriculation} onChange={(e) => setFormData({ ...formData, immatriculation: e.target.value })} placeholder="AA-123-BB" required />
                </div>
                <div>
                  <Label>{t("marque")}</Label>
                  <Input value={formData.marque} onChange={(e) => setFormData({ ...formData, marque: e.target.value })} placeholder="Renault" />
                </div>
                <div>
                  <Label>{t("modele")}</Label>
                  <Input value={formData.modele} onChange={(e) => setFormData({ ...formData, modele: e.target.value })} placeholder="Kangoo" />
                </div>
                <div>
                  <Label>{t("annee")}</Label>
                  <Input type="number" value={formData.annee} onChange={(e) => setFormData({ ...formData, annee: parseInt(e.target.value) })} />
                </div>
                <div>
                  <Label>{t("puissanceFiscale")}</Label>
                  <Input type="number" min={1} max={99} value={formData.puissanceFiscale ?? ""} onChange={(e) => setFormData({ ...formData, puissanceFiscale: e.target.value ? parseInt(e.target.value) : undefined })} placeholder={t("puissancePlaceholder")} />
                </div>
                <div>
                  <Label>{t("carburant")}</Label>
                  <Select value={formData.typeCarburant} onValueChange={(v) => setFormData({ ...formData, typeCarburant: v as TypeCarburant })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CARBURANTS.map((c) => (
                        <SelectItem key={c} value={c}>{t(`carburantOption.${c}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("kilometrage")}</Label>
                  <Input type="number" value={formData.kilometrageActuel} onChange={(e) => setFormData({ ...formData, kilometrageActuel: parseInt(e.target.value) })} />
                </div>
                <div className="col-span-2">
                  <Label>{t("technicienAssigne")}</Label>
                  <Select value={formData.technicienId?.toString() ?? "none"} onValueChange={(v) => setFormData({ ...formData, technicienId: v === "none" ? undefined : parseInt(v) })}>
                    <SelectTrigger><SelectValue placeholder={t("aucun")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("aucun")}</SelectItem>
                      {techniciens.map((tech) => (
                        <SelectItem key={tech.id} value={tech.id.toString()}>{tech.prenom} {tech.nom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={create.isPending}>{t("ajouterBtn")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-lg"><Car className="h-6 w-6 text-blue-600" /></div>
          <div><p className="text-sm text-muted-foreground">{t("statTotal")}</p><p className="text-2xl font-bold">{stats?.nbVehicules || 0}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-lg"><Gauge className="h-6 w-6 text-green-600" /></div>
          <div><p className="text-sm text-muted-foreground">{t("statKmTotal")}</p><p className="text-2xl font-bold">{(stats?.kmTotalFlotte || 0).toLocaleString()}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4">
          <div className="p-3 bg-yellow-100 rounded-lg"><Wrench className="h-6 w-6 text-yellow-600" /></div>
          <div><p className="text-sm text-muted-foreground">{t("statEntretiens")}</p><p className="text-2xl font-bold">{entretiensAVenir.length}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4">
          <div className="p-3 bg-red-100 rounded-lg"><Shield className="h-6 w-6 text-red-600" /></div>
          <div><p className="text-sm text-muted-foreground">{t("statAssurances")}</p><p className="text-2xl font-bold">{stats?.assurancesAExpirer || 0}</p></div>
        </div></CardContent></Card>
      </div>

      {/* Alertes */}
      {(assurancesExpirant.length > 0 || entretiensAVenir.length > 0) && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600"><AlertTriangle className="h-5 w-5" />{t("alertes")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {assurancesExpirant.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-red-500" />
                <span>{t("assuranceExpire", { immat: vehiculeImmat(vehicules, a.vehiculeId), date: new Date(a.dateFin).toLocaleDateString("fr-FR") })}</span>
              </div>
            ))}
            {entretiensAVenir.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <Wrench className="h-4 w-4 text-yellow-500" />
                <span>{t("entretienPrevu", { type: e.type, immat: vehiculeImmat(vehicules, e.vehiculeId), date: e.prochainEntretienDate ? new Date(e.prochainEntretienDate).toLocaleDateString("fr-FR") : "" })}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Liste des véhicules */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="liste">{t("tabListe")}</TabsTrigger>
          <TabsTrigger value="entretiens">{t("tabEntretiens")}</TabsTrigger>
          <TabsTrigger value="assurances">{t("tabAssurances")}</TabsTrigger>
        </TabsList>

        <TabsContent value="liste" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicules.map((vehicule) => (
              <Card key={vehicule.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{vehicule.immatriculation}</CardTitle>
                      <p className="text-sm text-muted-foreground">{vehicule.marque} {vehicule.modele} ({vehicule.annee})</p>
                    </div>
                    <StatutBadge statut={vehicule.statut || "actif"} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("colKilometrage")}</span>
                      <span className="font-medium">{t("kmUnit", { km: (vehicule.kilometrageActuel || 0).toLocaleString() })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("colCarburant")}</span>
                      <span className="font-medium capitalize">{vehicule.typeCarburant}</span>
                    </div>
                    {vehicule.puissanceFiscale != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("colPuissance")}</span>
                        <span className="font-medium">{t("cv", { cv: vehicule.puissanceFiscale })}</span>
                      </div>
                    )}
                    {vehicule.technicienId && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("assigneA")}</span>
                        <span className="font-medium">{technicienPrenom(techniciens, vehicule.technicienId)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" className="flex-1"><Edit className="h-4 w-4 mr-1" />{t("modifier")}</Button>
                    <Button variant="outline" size="sm" className="text-red-500" onClick={() => remove.mutate({ id: vehicule.id }, { onSuccess: () => toast.success(t("toastSupprime")) })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {vehicules.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("aucunVehicule")}</p>
              <p className="text-sm">{t("aucunVehiculeAstuce")}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="entretiens" className="mt-4">
          <Card>
            <CardHeader><CardTitle>{t("historiqueEntretiens")}</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground text-center py-8">{t("selEntretien")}</p></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assurances" className="mt-4">
          <Card>
            <CardHeader><CardTitle>{t("contratsAssurance")}</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground text-center py-8">{t("selAssurance")}</p></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
