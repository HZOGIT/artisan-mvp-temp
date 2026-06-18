import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { CheckCircle2, Circle, Plus, Trash2, AlarmClock } from "lucide-react";
import { useActivitesAFaire, type Activite } from "../../application/use-activites-a-faire";
import { WidgetSkeleton } from "./widget-skeleton";

// Widget « À faire » (CRM next-action) — re-port de widgets/ActivitesAFaire (clean-archi, i18n, typé).
type ActiviteType = "appel" | "email" | "rdv" | "relance" | "autre";
const TYPE_LABEL_KEY: Record<string, string> = { appel: "aaf_typeAppel", email: "aaf_typeEmail", rdv: "aaf_typeRdv", relance: "aaf_typeRelance", autre: "aaf_typeAutre" };
const startOfDay = (d: Date): number => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

export function ActivitesAFaireWidget() {
  const { t } = useTranslation("dashboard");
  const { activites, isLoading, createMut, toggleMut, deleteMut } = useActivitesAFaire();
  const [showForm, setShowForm] = useState(false);
  const [titre, setTitre] = useState("");
  const [echeance, setEcheance] = useState("");
  const [type, setType] = useState<ActiviteType>("autre");

  if (isLoading) return <WidgetSkeleton height={240} lines={4} />;

  const today = startOfDay(new Date());
  const aFaire = activites.filter((a) => !a.fait);
  const enRetard = aFaire.filter((a) => startOfDay(new Date(a.echeance)) < today);
  const aujourdhui = aFaire.filter((a) => startOfDay(new Date(a.echeance)) === today);
  const aVenir = aFaire.filter((a) => startOfDay(new Date(a.echeance)) > today);

  const renderItem = (a: Activite, tone: "retard" | "today" | "venir") => {
    const dotCls = tone === "retard" ? "text-rose-500" : tone === "today" ? "text-amber-500" : "text-muted-foreground";
    return (
      <div key={a.id} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-2.5">
        <button type="button" onClick={() => toggleMut.mutate({ id: a.id, fait: true })} title={t("aaf_marquerFait")} className="group/check mt-0.5 shrink-0">
          <Circle className={`h-4 w-4 ${dotCls} group-hover/check:hidden`} />
          <CheckCircle2 className="h-4 w-4 text-emerald-500 hidden group-hover/check:block" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{a.titre}</p>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><AlarmClock className="h-3 w-3" />{new Date(a.echeance).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">{TYPE_LABEL_KEY[a.type] ? t(TYPE_LABEL_KEY[a.type]) : a.type}</span>
          </div>
        </div>
        <button type="button" onClick={() => deleteMut.mutate({ id: a.id })} title={t("aaf_supprimer")} className="mt-0.5 shrink-0 text-muted-foreground hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre.trim()) { toast.error(t("aaf_titreRequis")); return; }
    if (!echeance) { toast.error(t("aaf_echeanceRequise")); return; }
    createMut.mutate({ titre: titre.trim(), echeance, type }, {
      onSuccess: () => { toast.success(t("aaf_ajoutee")); setTitre(""); setEcheance(""); setType("autre"); setShowForm(false); },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-3">
      {aFaire.length === 0 && <div className="flex flex-col items-center justify-center text-muted-foreground py-8 gap-2"><CheckCircle2 className="h-8 w-8 opacity-30" /><p className="text-sm">{t("aaf_rien")}</p></div>}
      {enRetard.length > 0 && <div className="space-y-1.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-rose-500">{t("aaf_enRetard", { n: enRetard.length })}</p>{enRetard.map((a) => renderItem(a, "retard"))}</div>}
      {aujourdhui.length > 0 && <div className="space-y-1.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">{t("aaf_aujourdhui", { n: aujourdhui.length })}</p>{aujourdhui.map((a) => renderItem(a, "today"))}</div>}
      {aVenir.length > 0 && <div className="space-y-1.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("aaf_aVenir", { n: aVenir.length })}</p>{aVenir.slice(0, 5).map((a) => renderItem(a, "venir"))}</div>}
      {showForm ? (
        <form className="space-y-2 border-t pt-3" onSubmit={submit}>
          <Input placeholder={t("aaf_placeholder")} value={titre} onChange={(e) => setTitre(e.target.value)} />
          <div className="flex gap-2">
            <Input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} className="flex-1" />
            <Select value={type} onValueChange={(v) => setType(v as ActiviteType)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="appel">{t("aaf_typeAppel")}</SelectItem>
                <SelectItem value="email">{t("aaf_typeEmail")}</SelectItem>
                <SelectItem value="rdv">{t("aaf_typeRdv")}</SelectItem>
                <SelectItem value="relance">{t("aaf_typeRelance")}</SelectItem>
                <SelectItem value="autre">{t("aaf_typeAutre")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createMut.isPending} className="flex-1">{t("aaf_ajouter")}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>{t("aaf_annuler")}</Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowForm(true)}><Plus className="h-3 w-3 mr-1" /> {t("aaf_ajouterActivite")}</Button>
      )}
    </div>
  );
}
