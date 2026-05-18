import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Medal,
  Trophy,
  Sparkles,
  Wrench,
  Star,
  TrendingUp,
  RefreshCw,
  Target,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

type Periode = "semaine" | "mois" | "trimestre" | "annee";

const PERIODE_LABELS: Record<Periode, string> = {
  semaine: "Cette semaine",
  mois: "Ce mois",
  trimestre: "Ce trimestre",
  annee: "Cette année",
};

function eur(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function initials(t: any): string {
  const p = (t?.prenom || "").trim();
  const n = (t?.nom || "").trim();
  return ((p[0] || "") + (n[0] || "")).toUpperCase() || "?";
}

export default function Classement() {
  const [periode, setPeriode] = useState<Periode>("mois");
  const [selectedTechId, setSelectedTechId] = useState<number | null>(null);

  const { data: techniciens } = trpc.techniciens.getAll.useQuery();
  const { data: classement, refetch: refetchClassement, isLoading: classLoading } =
    trpc.badges.getClassement.useQuery({ periode });

  const calculerMut = trpc.badges.calculerClassement.useMutation({
    onSuccess: () => {
      toast.success(`Classement ${PERIODE_LABELS[periode].toLowerCase()} recalculé`);
      refetchClassement();
    },
    onError: (e) => toast.error(e.message || "Erreur lors du recalcul"),
  });

  // Lookup map technicien id -> infos.
  const techMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const t of techniciens || []) m.set(t.id, t);
    return m;
  }, [techniciens]);

  // Enrichir le classement avec les infos techniciens.
  const ranking = useMemo(() => {
    if (!classement) return [];
    return classement.map((c: any) => ({
      ...c,
      technicien: techMap.get(c.technicienId),
    }));
  }, [classement, techMap]);

  // Sélection auto du premier technicien pour les sections badges/objectifs.
  const techIdForDetail = selectedTechId ?? ranking[0]?.technicienId ?? techniciens?.[0]?.id ?? null;

  const { data: badgesTechnicien } = trpc.badges.getBadgesTechnicien.useQuery(
    { technicienId: techIdForDetail || 0 },
    { enabled: !!techIdForDetail }
  );

  const { data: objectifs } = trpc.badges.getObjectifsTechnicien.useQuery(
    { technicienId: techIdForDetail || 0, annee: new Date().getFullYear() },
    { enabled: !!techIdForDetail }
  );

  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  return (
    <div className="space-y-6">
      {/* En-tête + filtre période */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-7 w-7 text-amber-500" />
            Classement
          </h1>
          <p className="text-muted-foreground mt-1">
            Gamification et performances des techniciens
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={periode} onValueChange={(v) => setPeriode(v as Periode)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semaine">Semaine</SelectItem>
              <SelectItem value="mois">Mois</SelectItem>
              <SelectItem value="trimestre">Trimestre</SelectItem>
              <SelectItem value="annee">Année</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => calculerMut.mutate({ periode })}
            disabled={calculerMut.isPending}
            className="min-h-[44px] sm:min-h-0"
          >
            {calculerMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Recalculer
          </Button>
        </div>
      </div>

      {/* SECTION 1 — Podium */}
      {classLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Chargement du classement…
          </CardContent>
        </Card>
      ) : top3.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground mb-3">
              Aucun classement pour {PERIODE_LABELS[periode].toLowerCase()}.
            </p>
            <Button onClick={() => calculerMut.mutate({ periode })}>
              <Sparkles className="h-4 w-4 mr-2" /> Lancer le calcul
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-gradient-to-br from-amber-50 via-white to-blue-50 dark:from-amber-950/20 dark:via-background dark:to-blue-950/20 border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" /> Podium — {PERIODE_LABELS[periode]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-center gap-4 sm:gap-8 pt-4">
              {/* 2e */}
              {top3[1] && (
                <PodiumStep
                  rank={2}
                  data={top3[1]}
                  heightClass="h-28"
                  bgClass="bg-slate-300 dark:bg-slate-700"
                  medal="🥈"
                  delay={0.1}
                />
              )}
              {/* 1er */}
              {top3[0] && (
                <PodiumStep
                  rank={1}
                  data={top3[0]}
                  heightClass="h-40"
                  bgClass="bg-amber-400 dark:bg-amber-600"
                  medal="🥇"
                  delay={0}
                  highlight
                />
              )}
              {/* 3e */}
              {top3[2] && (
                <PodiumStep
                  rank={3}
                  data={top3[2]}
                  heightClass="h-20"
                  bgClass="bg-orange-300 dark:bg-orange-700"
                  medal="🥉"
                  delay={0.2}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 2 — Classement complet */}
      {ranking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Classement complet</CardTitle>
            <CardDescription>Tous les techniciens classés pour {PERIODE_LABELS[periode].toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 px-2">Rang</th>
                  <th className="py-2 px-2">Technicien</th>
                  <th className="py-2 px-2 text-right whitespace-nowrap">Interventions</th>
                  <th className="py-2 px-2 text-right whitespace-nowrap">Note moy.</th>
                  <th className="py-2 px-2 text-right whitespace-nowrap">CA généré</th>
                  <th className="py-2 px-2 text-right whitespace-nowrap">Score</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((row: any) => {
                  const t = row.technicien;
                  const selected = techIdForDetail === row.technicienId;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedTechId(row.technicienId)}
                      className={
                        "border-b cursor-pointer hover:bg-muted/40 " +
                        (selected ? "bg-blue-50 dark:bg-blue-950/20" : "")
                      }
                    >
                      <td className="py-2 px-2 font-semibold">
                        {row.rang <= 3 ? ["🥇", "🥈", "🥉"][row.rang - 1] : `#${row.rang}`}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-bold flex items-center justify-center">
                            {initials(t)}
                          </div>
                          <div>
                            <div className="font-medium">
                              {t ? `${t.prenom || ""} ${t.nom || ""}`.trim() : `Tech #${row.technicienId}`}
                            </div>
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
                      <td className="py-2 px-2 text-right whitespace-nowrap font-semibold">
                        {row.pointsTotal || 0} pts
                      </td>
                    </tr>
                  );
                })}
                {rest.length === 0 && ranking.length === top3.length && top3.length > 0 && (
                  <tr>
                    <td colSpan={6} className="py-3 px-2 text-center text-xs text-muted-foreground">
                      C'est tout pour cette période.
                    </td>
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
              Badges gagnés
            </CardTitle>
            <CardDescription>
              {techIdForDetail
                ? `Technicien ${techMap.get(techIdForDetail) ? `${techMap.get(techIdForDetail).prenom || ""} ${techMap.get(techIdForDetail).nom || ""}`.trim() : `#${techIdForDetail}`}`
                : "Sélectionne un technicien dans le tableau"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!badgesTechnicien || badgesTechnicien.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Aucun badge encore obtenu.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {badgesTechnicien.map((b: any) => (
                  <div
                    key={b.id}
                    className="p-3 rounded-lg border flex items-start gap-2"
                    style={{ borderColor: b.badgeCouleur || undefined }}
                  >
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: b.badgeCouleur || "#3b82f6" }}
                    >
                      <Trophy className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{b.badgeNom}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.dateObtention
                          ? format(new Date(b.dateObtention), "dd MMM yyyy", { locale: fr })
                          : ""}
                      </div>
                      {b.badgePoints && (
                        <Badge variant="secondary" className="mt-1 text-[10px]">
                          +{b.badgePoints} pts
                        </Badge>
                      )}
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
              Objectifs {new Date().getFullYear()}
            </CardTitle>
            <CardDescription>Progression mensuelle vers les objectifs fixés</CardDescription>
          </CardHeader>
          <CardContent>
            {!objectifs || objectifs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Aucun objectif défini cette année.
              </p>
            ) : (
              <div className="space-y-3">
                {objectifs.map((o: any) => {
                  const pctInt = o.objectifInterventions
                    ? Math.min(100, Math.round(((o.interventionsRealisees || 0) / o.objectifInterventions) * 100))
                    : 0;
                  const pctCA = Number(o.objectifCA || 0) > 0
                    ? Math.min(100, Math.round((Number(o.caRealise || 0) / Number(o.objectifCA || 0)) * 100))
                    : 0;
                  return (
                    <div key={o.id} className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        {format(new Date(o.annee, o.mois - 1, 1), "MMMM yyyy", { locale: fr })}
                      </div>
                      {o.objectifInterventions > 0 && (
                        <ProgressRow
                          label={`Interventions : ${o.interventionsRealisees || 0} / ${o.objectifInterventions}`}
                          pct={pctInt}
                          color="bg-blue-500"
                        />
                      )}
                      {Number(o.objectifCA || 0) > 0 && (
                        <ProgressRow
                          label={`CA : ${eur(o.caRealise)} / ${eur(o.objectifCA)}`}
                          pct={pctCA}
                          color="bg-emerald-500"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sous-composants

function PodiumStep({
  rank,
  data,
  heightClass,
  bgClass,
  medal,
  delay,
  highlight,
}: {
  rank: number;
  data: any;
  heightClass: string;
  bgClass: string;
  medal: string;
  delay: number;
  highlight?: boolean;
}) {
  const t = data.technicien;
  const name = t ? `${t.prenom || ""} ${t.nom || ""}`.trim() : `Tech #${data.technicienId}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center w-24 sm:w-32"
    >
      <div
        className={
          "rounded-full mb-2 flex items-center justify-center text-white text-xl font-bold ring-4 " +
          (highlight
            ? "h-20 w-20 bg-gradient-to-br from-amber-400 to-orange-500 ring-amber-200"
            : "h-16 w-16 bg-gradient-to-br from-blue-400 to-indigo-500 ring-slate-100")
        }
      >
        {initials(t)}
      </div>
      <div className="text-2xl mb-1">{medal}</div>
      <div className="font-semibold text-sm text-center truncate w-full" title={name}>
        {name}
      </div>
      <div className="text-xs text-muted-foreground mb-2">{data.pointsTotal || 0} pts</div>
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
        <motion.div
          className={`h-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
