import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStatistiquesDevis } from "../application/use-statistiques";
import { computeDevisStats } from "../domain/statistiques";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, FileText, CheckCircle, XCircle, Clock, Euro, BarChart3, AlertCircle, type LucideIcon } from "lucide-react";

/*
 * Page Statistiques Devis du FRONT NEUF (`/statistiques`) — MIGRATION clean-archi de
 * `pages/StatistiquesDevis.tsx` (lecture seule ; legacy chaînes EN DUR + calcul stats inline → i18n
 * namespace `statistiquesDevis` + `computeDevisStats` PUR dans le domaine, testé). Données via
 * `useStatistiquesDevis` (couche application, seule à importer tRPC). Présentation pure, 0 `any`.
 */

function toneClasses(tone: string) {
  switch (tone) {
    case "emerald":
      return "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300";
    case "blue":
      return "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-300";
    case "red":
      return "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300";
    case "purple":
      return "bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/30 dark:border-purple-900 dark:text-purple-300";
    default:
      return "bg-muted border-border text-foreground";
  }
}

export default function StatistiquesDevisPage() {
  const { t } = useTranslation("statistiquesDevis");
  const [periode, setPeriode] = useState<string>("30");
  const { devis, isLoading } = useStatistiquesDevis();

  /** Calcul délégué au domaine (pur, testé) — recalculé quand la liste ou la période change. */
  const stats = useMemo(() => computeDevisStats(devis, periode), [devis, periode]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);

  const repartition = [
    { key: "accepte", label: t("repAcceptes"), count: stats.acceptes, dot: "bg-emerald-500", bar: "bg-emerald-500" },
    { key: "envoye", label: t("repEnvoyes"), count: stats.envoyes, dot: "bg-blue-500", bar: "bg-blue-500" },
    { key: "refuse", label: t("repRefuses"), count: stats.refuses, dot: "bg-red-500", bar: "bg-red-500" },
    { key: "brouillon", label: t("repBrouillons"), count: stats.brouillons, dot: "bg-gray-400", bar: "bg-gray-400" },
    { key: "expire", label: t("repExpires"), count: stats.expires, dot: "bg-orange-500", bar: "bg-orange-500" },
  ];

  const cartesFin: { label: string; value: number; icon: LucideIcon; tone: string }[] = [
    { label: t("finCaSecurise"), value: stats.montantAccepte, icon: CheckCircle, tone: "emerald" },
    { label: t("finPotentiel"), value: stats.montantEnAttente, icon: Clock, tone: "blue" },
    { label: t("finPerdu"), value: stats.montantPerdu, icon: XCircle, tone: "red" },
    { label: t("finMoyen"), value: stats.montantMoyen, icon: BarChart3, tone: "purple" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Select value={periode} onValueChange={setPeriode}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t("periode7")}</SelectItem>
            <SelectItem value="30">{t("periode30")}</SelectItem>
            <SelectItem value="90">{t("periode90")}</SelectItem>
            <SelectItem value="365">{t("periode365")}</SelectItem>
            <SelectItem value="all">{t("periodeAll")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="py-6">
                <div className="h-4 w-32 bg-muted animate-pulse rounded mb-3" />
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats.total === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-base font-medium">{t("emptyTitle")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("emptyDesc")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs principaux */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: t("kpiTauxTitle"),
                icon: CheckCircle,
                iconClass: "text-emerald-500",
                value: `${stats.tauxConversion.toFixed(1)}%`,
                valueClass: "text-emerald-600 dark:text-emerald-400",
                trailing: (
                  <div className="flex items-center gap-1 mt-1">
                    {stats.evolutionTaux > 0 ? (
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                    ) : stats.evolutionTaux < 0 ? (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    ) : null}
                    <span
                      className={`text-sm ${
                        stats.evolutionTaux > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : stats.evolutionTaux < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {t("kpiTauxVs", { evolution: `${stats.evolutionTaux > 0 ? "+" : ""}${stats.evolutionTaux.toFixed(1)}` })}
                    </span>
                  </div>
                ),
              },
              {
                title: t("kpiMontantAccepteTitle"),
                icon: Euro,
                iconClass: "text-emerald-500",
                value: formatCurrency(stats.montantAccepte),
                valueClass: "",
                trailing: (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("kpiMontantAccepteSub", { total: formatCurrency(stats.montantTotal) })}
                  </p>
                ),
              },
              {
                title: t("kpiEnAttenteTitle"),
                icon: Clock,
                iconClass: "text-blue-500",
                value: String(stats.envoyes),
                valueClass: "text-blue-600 dark:text-blue-400",
                trailing: (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("kpiEnAttenteSub", { montant: formatCurrency(stats.montantEnAttente) })}
                  </p>
                ),
              },
              {
                title: t("kpiDelaiTitle"),
                icon: BarChart3,
                iconClass: "text-purple-500",
                value: t("kpiDelaiValue", { n: stats.delaiMoyen }),
                valueClass: "",
                trailing: (
                  <p className="text-sm text-muted-foreground mt-1">{t("kpiDelaiSub", { n: stats.avecReponseCount })}</p>
                ),
              },
            ].map((kpi, idx) => {
              const Icon = kpi.icon;
              return (
                <motion.div
                  key={kpi.title}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.05 }}
                >
                  <Card className="transition-shadow hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
                      <Icon className={`h-4 w-4 ${kpi.iconClass}`} />
                    </CardHeader>
                    <CardContent>
                      <div className={`text-3xl font-bold ${kpi.valueClass}`}>{kpi.value}</div>
                      {kpi.trailing}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Repartition par statut + analyse financiere */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("repartitionTitle")}</CardTitle>
                <CardDescription>{t("repartitionDesc", { total: stats.total })}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  {repartition.map((row, idx) => {
                    const pct = stats.total > 0 ? (row.count / stats.total) * 100 : 0;
                    return (
                      <div key={row.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${row.dot}`} />
                            <span className="text-sm">{row.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium tabular-nums">{row.count}</span>
                            <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${row.bar}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, delay: idx * 0.06, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("financeTitle")}</CardTitle>
                <CardDescription>{t("financeDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {cartesFin.map((c, idx) => {
                    const Icon = c.icon;
                    return (
                      <motion.div
                        key={c.label}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.07 }}
                        className={`p-4 rounded-lg border flex items-center justify-between ${toneClasses(c.tone)}`}
                      >
                        <div>
                          <p className="text-sm font-medium opacity-80">{c.label}</p>
                          <p className="text-2xl font-bold tabular-nums">{formatCurrency(c.value)}</p>
                        </div>
                        <Icon className="h-8 w-8 opacity-70" />
                      </motion.div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resume rapide */}
          <Card>
            <CardHeader>
              <CardTitle>{t("resumeTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                {[
                  { icon: FileText, value: stats.total, label: t("resumeDevisCrees"), iconClass: "text-muted-foreground", valueClass: "" },
                  { icon: CheckCircle, value: stats.acceptes, label: t("resumeAcceptes"), iconClass: "text-emerald-500", valueClass: "text-emerald-600 dark:text-emerald-400" },
                  { icon: XCircle, value: stats.refuses, label: t("resumeRefuses"), iconClass: "text-red-500", valueClass: "text-red-600 dark:text-red-400" },
                  { icon: Clock, value: stats.envoyes, label: t("resumeEnAttente"), iconClass: "text-blue-500", valueClass: "text-blue-600 dark:text-blue-400" },
                ].map((cell, idx) => {
                  const Icon = cell.icon;
                  return (
                    <motion.div
                      key={cell.label}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, delay: idx * 0.04 }}
                      className="p-4 bg-muted/50 rounded-lg"
                    >
                      <Icon className={`h-6 w-6 mx-auto mb-2 ${cell.iconClass}`} />
                      <p className={`text-2xl font-bold tabular-nums ${cell.valueClass}`}>{cell.value}</p>
                      <p className="text-sm text-muted-foreground">{cell.label}</p>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
