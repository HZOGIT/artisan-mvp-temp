import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Medal, Trophy, Sparkles, Wrench, Star, RefreshCw, Target, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useClassement, useTechnicienDetail } from "../application/use-classement";
import { PERIODES, eur, initials, technicienName, buildRanking, splitPodium, objectifPct, type Periode, type ClassementRow } from "../domain/classement";

/*
 * Page `classement` (gamification) — migration clean-archi de `pages/Classement.tsx`. Markup/classes
 * Tailwind + animations framer-motion conservés à l'identique (parité). tRPC encapsulé dans `use-classement`.
 */
export default function ClassementPage() {
  const { t } = useTranslation("classement");
  const [periode, setPeriode] = useState<Periode>("mois");
  const [selectedTechId, setSelectedTechId] = useState<number | null>(null);
  const { techniciens, classement, isLoading, calculerClassement } = useClassement(periode);

  const periodeLabel = (p: Periode) => t(`periodeLabel.${p}`);
  const periodeLower = periodeLabel(periode).toLowerCase();

  const ranking = useMemo(() => buildRanking(classement, techniciens), [classement, techniciens]);
  const { top3, rest } = splitPodium(ranking);
  const techIdForDetail = selectedTechId ?? ranking[0]?.technicienId ?? techniciens[0]?.id ?? null;
  const { badgesObtenus, objectifs } = useTechnicienDetail(techIdForDetail);
  const techDetail = techniciens.find((tech) => tech.id === techIdForDetail);

  const recalculer = () => calculerClassement.mutate({ periode }, {
    onSuccess: () => toast.success(t("toastRecalcule", { periode: periodeLower })),
    onError: (e) => toast.error(e.message || t("errRecalcul")),
  });

  return (
    <div className="space-y-6">
      {/* En-tête + filtre période */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-7 w-7 text-amber-500" />
            {t("titre")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("sousTitre")}</p>
        </div>
        <div className="flex gap-2">
          <Select value={periode} onValueChange={(v) => setPeriode(v as Periode)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODES.map((p) => (
                <SelectItem key={p} value={p}>{t(`periode.${p}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={recalculer} disabled={calculerClassement.isPending} className="min-h-[44px] sm:min-h-0">
            {calculerClassement.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {t("recalculer")}
          </Button>
        </div>
      </div>

      {/* SECTION 1 — Podium */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> {t("chargement")}
          </CardContent>
        </Card>
      ) : top3.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground mb-3">{t("aucunClassement", { periode: periodeLower })}</p>
            <Button onClick={recalculer}>
              <Sparkles className="h-4 w-4 mr-2" /> {t("lancerCalcul")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-gradient-to-br from-amber-50 via-white to-blue-50 dark:from-amber-950/20 dark:via-background dark:to-blue-950/20 border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" /> {t("podium", { periode: periodeLabel(periode) })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-center gap-4 sm:gap-8 pt-4">
              {top3[1] && <PodiumStep rank={2} data={top3[1]} heightClass="h-28" bgClass="bg-slate-300 dark:bg-slate-700" medal="🥈" delay={0.1} />}
              {top3[0] && <PodiumStep rank={1} data={top3[0]} heightClass="h-40" bgClass="bg-amber-400 dark:bg-amber-600" medal="🥇" delay={0} highlight />}
              {top3[2] && <PodiumStep rank={3} data={top3[2]} heightClass="h-20" bgClass="bg-orange-300 dark:bg-orange-700" medal="🥉" delay={0.2} />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 2 — Classement complet */}
      {ranking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("classementComplet")}</CardTitle>
            <CardDescription>{t("classementCompletDesc", { periode: periodeLower })}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 px-2">{t("colRang")}</th>
                  <th className="py-2 px-2">{t("colTechnicien")}</th>
                  <th className="py-2 px-2 text-right whitespace-nowrap">{t("colInterventions")}</th>
                  <th className="py-2 px-2 text-right whitespace-nowrap">{t("colNote")}</th>
                  <th className="py-2 px-2 text-right whitespace-nowrap">{t("colCa")}</th>
                  <th className="py-2 px-2 text-right whitespace-nowrap">{t("colScore")}</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((row) => {
                  const selected = techIdForDetail === row.technicienId;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedTechId(row.technicienId)}
                      className={"border-b cursor-pointer hover:bg-muted/40 " + (selected ? "bg-blue-50 dark:bg-blue-950/20" : "")}
                    >
                      <td className="py-2 px-2 font-semibold">
                        {row.rang <= 3 ? ["🥇", "🥈", "🥉"][row.rang - 1] : `#${row.rang}`}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-bold flex items-center justify-center">
                            {initials(row.technicien)}
                          </div>
                          <div>
                            <div className="font-medium">{technicienName(row.technicien, row.technicienId)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        <Wrench className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                        {row.interventions || 0}
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        <Star className="h-3.5 w-3.5 inline mr-1 text-amber-500" />
                        {row.noteMoyenne ? Number(row.noteMoyenne).toFixed(1) : "—"}
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">{eur(row.ca)}</td>
                      <td className="py-2 px-2 text-right whitespace-nowrap font-semibold">{t("ptsSuffix", { points: row.pointsTotal || 0 })}</td>
                    </tr>
                  );
                })}
                {rest.length === 0 && ranking.length === top3.length && top3.length > 0 && (
                  <tr>
                    <td colSpan={6} className="py-3 px-2 text-center text-xs text-muted-foreground">{t("finPeriode")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* SECTIONS 3 + 4 côte à côte */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 3 — Badges du technicien */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Medal className="h-5 w-5 text-amber-500" />
              {t("badgesGagnes")}
            </CardTitle>
            <CardDescription>
              {techIdForDetail ? t("badgesTechnicien", { nom: technicienName(techDetail, techIdForDetail) }) : t("badgesSelectionne")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {badgesObtenus.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("aucunBadge")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {badgesObtenus.map((b) => (
                  <div key={b.id} className="p-3 rounded-lg border flex items-start gap-2" style={{ borderColor: b.couleur || undefined }}>
                    <div className="h-9 w-9 rounded-full flex items-center justify-center text-white shrink-0" style={{ backgroundColor: b.couleur || "#3b82f6" }}>
                      <Trophy className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{b.nom}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.dateObtention ? format(new Date(b.dateObtention), "dd MMM yyyy", { locale: fr }) : ""}
                      </div>
                      {b.points ? <Badge variant="secondary" className="mt-1 text-[10px]">{t("plusPts", { points: b.points })}</Badge> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECTION 4 — Objectifs du mois */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-600" />
              {t("objectifs", { annee: new Date().getFullYear() })}
            </CardTitle>
            <CardDescription>{t("objectifsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {objectifs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("aucunObjectif")}</p>
            ) : (
              <div className="space-y-3">
                {objectifs.map((o) => (
                  <div key={o.id} className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      {format(new Date(o.annee, o.mois - 1, 1), "MMMM yyyy", { locale: fr })}
                    </div>
                    {(o.objectifInterventions || 0) > 0 && (
                      <ProgressRow
                        label={t("objInterventions", { realise: o.interventionsRealisees || 0, objectif: o.objectifInterventions })}
                        pct={objectifPct(o.interventionsRealisees, o.objectifInterventions)}
                        color="bg-blue-500"
                      />
                    )}
                    {Number(o.objectifCA || 0) > 0 && (
                      <ProgressRow
                        label={t("objCa", { realise: eur(o.caRealise), objectif: eur(o.objectifCA) })}
                        pct={objectifPct(o.caRealise, o.objectifCA)}
                        color="bg-emerald-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/*
 * ----------------------------------------------------------------------------
 * Sous-composants
 */

function PodiumStep({ rank, data, heightClass, bgClass, medal, delay, highlight }: {
  rank: number; data: ClassementRow; heightClass: string; bgClass: string; medal: string; delay: number; highlight?: boolean;
}) {
  const { t } = useTranslation("classement");
  const name = technicienName(data.technicien, data.technicienId);
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center w-24 sm:w-32"
    >
      <div className={
        "rounded-full mb-2 flex items-center justify-center text-white text-xl font-bold ring-4 " +
        (highlight ? "h-20 w-20 bg-gradient-to-br from-amber-400 to-orange-500 ring-amber-200" : "h-16 w-16 bg-gradient-to-br from-blue-400 to-indigo-500 ring-slate-100")
      }>
        {initials(data.technicien)}
      </div>
      <div className="text-2xl mb-1">{medal}</div>
      <div className="font-semibold text-sm text-center truncate w-full" title={name}>{name}</div>
      <div className="text-xs text-muted-foreground mb-2">{t("ptsSuffix", { points: data.pointsTotal || 0 })}</div>
      <div className={`w-full rounded-t-md ${heightClass} ${bgClass} flex items-start justify-center pt-2 text-white font-bold text-2xl`}>
        {rank}
      </div>
    </motion.div>
  );
}

function ProgressRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="text-xs mb-1 flex justify-between">
        <span>{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <motion.div className={`h-full ${color}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
      </div>
    </div>
  );
}
