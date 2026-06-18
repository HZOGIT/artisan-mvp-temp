import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRegles } from "../application/use-regles";
import { indexCategoriesByNom, isRegleValid, normalizeMotif, type Regle } from "../domain/regle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Badge } from "@/modern/shared/ui/badge";
import { Wand2, Plus, Trash2, ArrowRight, Info } from "lucide-react";
import { toast } from "sonner";

// Page Règles de catégorisation auto du FRONT NEUF (`/regles-depenses`) — MIGRATION clean-archi de
// `pages/ReglesDepenses.tsx` (legacy en chaînes EN DUR → i18n namespace `reglesDepenses`). Données &
// mutations via `useRegles` (couche application, seule à importer tRPC) ; normalisation/validation/index
// catégories via le domaine (fonctions pures testées). Présentation pure, 0 `any`.

export default function ReglesDepensesPage() {
  const { t } = useTranslation("reglesDepenses");
  const [motif, setMotif] = useState("");
  const [categorie, setCategorie] = useState("");

  const { regles, categories, createRegle: createMut, deleteRegle: deleteMut } = useRegles();
  const categoriesByNom = indexCategoriesByNom(categories);

  const handleCreate = () => {
    if (!isRegleValid(motif, categorie)) {
      toast.error(t("toastRequired"));
      return;
    }
    createMut.mutate(
      { motifLibelle: normalizeMotif(motif), categorie },
      {
        onSuccess: () => {
          toast.success(t("toastAdded"));
          setMotif("");
          setCategorie("");
        },
        onError: (e) => toast.error(e.message || t("toastError")),
      },
    );
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Wand2 className="h-7 w-7 text-violet-600" /> {t("title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <Card className="border-violet-200 bg-violet-50/30">
        <CardContent className="pt-4 flex items-start gap-2">
          <Info className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">{t("howTitle")}</p>
            <p className="text-muted-foreground mt-1">{t("howDesc")}</p>
          </div>
        </CardContent>
      </Card>

      {/* Formulaire ajout */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("newTitle")}</CardTitle>
          <CardDescription>{t("newDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
            <div className="md:col-span-5">
              <Label>{t("ifContains")}</Label>
              <Input
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder={t("ifContainsPlaceholder")}
              />
            </div>
            <div className="md:col-span-1 hidden md:flex justify-center pb-2 text-muted-foreground">
              <ArrowRight className="h-4 w-4" />
            </div>
            <div className="md:col-span-4">
              <Label>{t("categorieLabel")}</Label>
              <Select value={categorie} onValueChange={setCategorie}>
                <SelectTrigger>
                  <SelectValue placeholder={t("categoriePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.nom}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.couleur }} />
                        {c.nom}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Button className="w-full min-h-[44px] md:min-h-0" onClick={handleCreate} disabled={createMut.isPending}>
                <Plus className="h-4 w-4 mr-2" /> {t("addBtn")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste des règles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("activeRules", { n: regles.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {regles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("empty")}</p>
          ) : (
            <div className="space-y-2">
              {regles.map((r: Regle) => {
                const cat = categoriesByNom.get(r.categorie);
                return (
                  <div key={r.id} className="flex items-center gap-3 p-2 rounded border">
                    <div className="flex-1 flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-xs text-muted-foreground">{t("siContient")}</span>
                      <Badge variant="secondary" className="font-mono">{r.motifLibelle}</Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <Badge
                        style={{
                          backgroundColor: (cat?.couleur || "#94a3b8") + "20",
                          color: cat?.couleur || "#64748b",
                          borderColor: cat?.couleur || "#94a3b8",
                        }}
                        className="border"
                      >
                        <span
                          className="h-2 w-2 rounded-full mr-1"
                          style={{ backgroundColor: cat?.couleur || "#94a3b8" }}
                        />
                        {r.categorie}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() =>
                        deleteMut.mutate({ id: r.id }, { onSuccess: () => toast.success(t("toastDeleted")) })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
