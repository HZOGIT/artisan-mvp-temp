import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Wand2, Plus, Trash2, ArrowRight, Info } from "lucide-react";
import { toast } from "sonner";

export default function ReglesDepenses() {
  const [motif, setMotif] = useState("");
  const [categorie, setCategorie] = useState("");

  const { data: regles, refetch } = trpc.depenses.getRegles.useQuery();
  const { data: categories } = trpc.depenses.getCategories.useQuery();

  const createMut = trpc.depenses.createRegle.useMutation({
    onSuccess: () => {
      toast.success("Règle ajoutée");
      setMotif("");
      setCategorie("");
      refetch();
    },
    onError: (e) => toast.error(e.message || "Erreur"),
  });

  const deleteMut = trpc.depenses.deleteRegle.useMutation({
    onSuccess: () => {
      toast.success("Règle supprimée");
      refetch();
    },
  });

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Wand2 className="h-7 w-7 text-violet-600" /> Règles de catégorisation auto
        </h1>
        <p className="text-muted-foreground mt-1">
          Ces règles s'appliquent automatiquement lors de l'import de relevé bancaire.
        </p>
      </div>

      <Card className="border-violet-200 bg-violet-50/30">
        <CardContent className="pt-4 flex items-start gap-2">
          <Info className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Comment ça marche</p>
            <p className="text-muted-foreground mt-1">
              Lors d'un import CSV bancaire, chaque transaction est confrontée à vos règles.
              Si le libellé contient l'un des mots-clés, la catégorie correspondante est
              suggérée automatiquement dans l'étape de tri.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Formulaire ajout */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nouvelle règle</CardTitle>
          <CardDescription>
            Exemple : « TOTAL » → Carburant, « BRICO DEPOT » → Matériaux
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
            <div className="md:col-span-5">
              <Label>Si le libellé contient</Label>
              <Input
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="TOTAL, BRICO, AUCHAN…"
              />
            </div>
            <div className="md:col-span-1 hidden md:flex justify-center pb-2 text-muted-foreground">
              <ArrowRight className="h-4 w-4" />
            </div>
            <div className="md:col-span-4">
              <Label>Catégorie</Label>
              <Select value={categorie} onValueChange={setCategorie}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {(categories || []).map((c: any) => (
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
              <Button
                className="w-full min-h-[44px] md:min-h-0"
                onClick={() => {
                  const m = motif.trim();
                  if (!m || !categorie) {
                    toast.error("Renseigne le libellé et la catégorie");
                    return;
                  }
                  createMut.mutate({ motifLibelle: m.toUpperCase(), categorie });
                }}
                disabled={createMut.isPending}
              >
                <Plus className="h-4 w-4 mr-2" /> Ajouter
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste des règles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Règles actives ({regles?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!regles || regles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Aucune règle. Ajoute ta première règle ci-dessus.
            </p>
          ) : (
            <div className="space-y-2">
              {regles.map((r: any) => {
                const cat = (categories || []).find((c: any) => c.nom === r.categorie);
                return (
                  <div key={r.id} className="flex items-center gap-3 p-2 rounded border">
                    <div className="flex-1 flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-xs text-muted-foreground">Si contient</span>
                      <Badge variant="secondary" className="font-mono">{r.motif_libelle}</Badge>
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
                      onClick={() => deleteMut.mutate({ id: r.id })}
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
