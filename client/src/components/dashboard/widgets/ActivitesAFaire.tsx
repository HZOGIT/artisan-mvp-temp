import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Circle, Plus, Trash2, AlarmClock } from "lucide-react";
import { toast } from "sonner";
import { WidgetSkeleton } from "./WidgetSkeleton";

// CRM next-action (OPE-121) : widget « À faire » regroupant les activités/rappels
// par échéance (en retard / aujourd'hui / à venir). Tout est scopé artisan côté serveur.

const TYPE_LABELS: Record<string, string> = {
  appel: "Appel",
  email: "Email",
  rdv: "RDV",
  relance: "Relance",
  autre: "À faire",
};

// Début de journée locale → comparaison de dates sans l'heure.
function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function ActivitesAFaireWidget() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.activites.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [titre, setTitre] = useState("");
  const [echeance, setEcheance] = useState("");
  const [type, setType] = useState("autre");

  const createMut = trpc.activites.create.useMutation({
    onSuccess: () => {
      toast.success("Activité ajoutée");
      setTitre("");
      setEcheance("");
      setType("autre");
      setShowForm(false);
      utils.activites.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const toggleMut = trpc.activites.toggleFait.useMutation({
    onSuccess: () => utils.activites.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.activites.delete.useMutation({
    onSuccess: () => utils.activites.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <WidgetSkeleton height={240} lines={4} />;

  const today = startOfDay(new Date());
  const all = data || [];
  const aFaire = all.filter((a: any) => !a.fait);
  const enRetard = aFaire.filter((a: any) => startOfDay(new Date(a.echeance)) < today);
  const aujourdhui = aFaire.filter((a: any) => startOfDay(new Date(a.echeance)) === today);
  const aVenir = aFaire.filter((a: any) => startOfDay(new Date(a.echeance)) > today);

  const renderItem = (a: any, tone: "retard" | "today" | "venir") => {
    const dotCls =
      tone === "retard" ? "text-rose-500" : tone === "today" ? "text-amber-500" : "text-muted-foreground";
    return (
      <div key={a.id} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-2.5">
        <button
          type="button"
          onClick={() => toggleMut.mutate({ id: a.id, fait: true })}
          title="Marquer comme fait"
          className="group/check mt-0.5 shrink-0"
        >
          <Circle className={`h-4 w-4 ${dotCls} group-hover/check:hidden`} />
          <CheckCircle2 className="h-4 w-4 text-emerald-500 hidden group-hover/check:block" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{a.titre}</p>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <AlarmClock className="h-3 w-3" />
              {new Date(a.echeance).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">
              {TYPE_LABELS[a.type] || a.type}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => deleteMut.mutate({ id: a.id })}
          title="Supprimer"
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-rose-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {aFaire.length === 0 && (
        <div className="flex flex-col items-center justify-center text-muted-foreground py-8 gap-2">
          <CheckCircle2 className="h-8 w-8 opacity-30" />
          <p className="text-sm">Rien à faire pour le moment.</p>
        </div>
      )}

      {enRetard.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-500">
            En retard ({enRetard.length})
          </p>
          {enRetard.map((a: any) => renderItem(a, "retard"))}
        </div>
      )}
      {aujourdhui.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">
            Aujourd'hui ({aujourdhui.length})
          </p>
          {aujourdhui.map((a: any) => renderItem(a, "today"))}
        </div>
      )}
      {aVenir.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            À venir ({aVenir.length})
          </p>
          {aVenir.slice(0, 5).map((a: any) => renderItem(a, "venir"))}
        </div>
      )}

      {showForm ? (
        <form
          className="space-y-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!titre.trim()) {
              toast.error("Le titre est requis");
              return;
            }
            if (!echeance) {
              toast.error("L'échéance est requise");
              return;
            }
            createMut.mutate({ titre: titre.trim(), echeance, type: type as any });
          }}
        >
          <Input
            placeholder="Rappeler M. Martin, relancer FA-012…"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
          />
          <div className="flex gap-2">
            <Input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} className="flex-1" />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="appel">Appel</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="rdv">RDV</SelectItem>
                <SelectItem value="relance">Relance</SelectItem>
                <SelectItem value="autre">À faire</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createMut.isPending} className="flex-1">
              Ajouter
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowForm(true)}>
          <Plus className="h-3 w-3 mr-1" /> Ajouter une activité
        </Button>
      )}
    </div>
  );
}
