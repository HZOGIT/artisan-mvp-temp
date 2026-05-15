import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { subDays, differenceInDays } from "date-fns";
import { TrendingUp, TrendingDown, FileText, CheckCircle, XCircle, Clock, Euro, BarChart3, AlertCircle, type LucideIcon } from "lucide-react";

type DevisLike = {
  statut?: string | null;
  dateDevis?: string | Date | null;
  updatedAt?: string | Date | null;
  totalTTC?: string | number | null;
};

export default function StatistiquesDevis() {
  const [periode, setPeriode] = useState<string>("30");

  const { data: devisList, isLoading } = trpc.devis.list.useQuery();

  // Filtrage et stats memoizes : on recalcule seulement quand la liste ou
  // la periode changent (et pas a chaque hover de carte).
  const stats = useMemo(() => {
    const list: DevisLike[] = (devisList as DevisLike[] | undefined) || [];
    const dateLimit = periode === "all" ? null : subDays(new Date(), parseInt(periode));

    const inPeriod = list.filter((d) => {
      if (!dateLimit) return true;
      const dd = d.dateDevis ? new Date(d.dateDevis) : null;
      return dd && dd >= dateLimit;
    });

    const countBy = (s: string) => inPeriod.filter((d) => d.statut === s).length;
    const sumBy = (filter: (d: DevisLike) => boolean) =>
      inPeriod.filter(filter).reduce((sum, d) => sum + parseFloat(String(d.totalTTC || "0")), 0);

    const total = inPeriod.length;
    const acceptes = countBy("accepte");
    const refuses = countBy("refuse");
    const envoyes = countBy("envoye");
    const brouillons = countBy("brouillon");
    const expires = countBy("expire");

    const traites = acceptes + refuses;
    const tauxConversion = traites > 0 ? (acceptes / traites) * 100 : 0;

    const montantTotal = sumBy(() => true);
    const montantAccepte = sumBy((d) => d.statut === "accepte");
    const montantEnAttente = sumBy((d) => d.statut === "envoye");
    const montantPerdu = sumBy((d) => d.statut === "refuse" || d.statut === "expire");
    const montantMoyen = total > 0 ? montantTotal / total : 0;

    const avecReponse = inPeriod.filter(
      (d) => (d.statut === "accepte" || d.statut === "refuse") && d.dateDevis && d.updatedAt,
    );
    const delaiMoyen =
      avecReponse.length > 0
        ? Math.round(
            avecReponse.reduce((sum, d) => {
              const dDevis = new Date(d.dateDevis as string | Date);
              const dRep = new Date(d.updatedAt as string | Date);
              return sum + differenceInDays(dRep, dDevis);
            }, 0) / avecReponse.length,
          )
        : 0;

    // Periode precedente pour comparaison.
    const previousDateLimit = dateLimit ? subDays(dateLimit, parseInt(periode)) : null;
    const previous = list.filter((d) => {
      if (!dateLimit || !previousDateLimit) return false;
      const dd = d.dateDevis ? new Date(d.dateDevis) : null;
      return dd && dd >= previousDateLimit && dd < dateLimit;
    });
    const prevAcceptes = previous.filter((d) => d.statut === "accepte").length;
    const prevTraites = previous.filter((d) => d.statut === "accepte" || d.statut === "refuse").length;
    const prevTaux = prevTraites > 0 ? (prevAcceptes / prevTraites) * 100 : 0;
    const evolutionTaux = tauxConversion - prevTaux;

    return {
      total,
      acceptes,
      refuses,
      envoyes,
      brouillons,
      expires,
      tauxConversion,
      montantTotal,
      montantAccepte,
      montantEnAttente,
      montantPerdu,
      montantMoyen,
      delaiMoyen,
      avecReponseCount: avecReponse.length,
      evolutionTaux,
    };
  }, [devisList, periode]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);

  // Definition data-driven des 5 lignes de repartition par statut.
  // Avant : 5 blocs JSX copies-colles de 18 lignes. Maintenant : 1 boucle.
  const repartition = [
    { key: "accepte", label: "Acceptés", count: stats.acceptes, dot: "bg-emerald-500", bar: "bg-emerald-500" },
    { key: "envoye", label: "Envoyés (en attente)", count: stats.envoyes, dot: "bg-blue-500", bar: "bg-blue-500" },
    { key: "refuse", label: "Refusés", count: stats.refuses, dot: "bg-red-500", bar: "bg-red-500" },
    { key: "brouillon", label: "Brouillons", count: stats.brouillons, dot: "bg-gray-400", bar: "bg-gray-400" },
    { key: "expire", label: "Expirés", count: stats.expires, dot: "bg-orange-500", bar: "bg-orange-500" },
  ];

  // Carte financiere data-driven (4 cartes au lieu de 4 blocs copies).
  const cartesFin: { label: string; value: number; icon: LucideIcon; tone: string }[] = [
    { label: "Chiffre d'affaires sécurisé", value: stats.montantAccepte, icon: CheckCircle, tone: "emerald" },
    { label: "Potentiel en attente", value: stats.montantEnAttente, icon: Clock, tone: "blue" },
    { label: "Montant perdu", value: stats.montantPerdu, icon: XCircle, tone: "red" },
    { label: "Montant moyen par devis", value: stats.montantMoyen, icon: BarChart3, tone: "purple" },
  ];

  const toneClasses = (tone: string) => {
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
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Statistiques Devis</h1>
          <p className="text-muted-foreground mt-1">Analysez les performances de vos devis</p>
        </div>
        <Select value={periode} onValueChange={setPeriode}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 derniers jours</SelectItem>
            <SelectItem value="30">30 derniers jours</SelectItem>
            <SelectItem value="90">3 derniers mois</SelectItem>
            <SelectItem value="365">12 derniers mois</SelectItem>
            <SelectItem value="all">Toute la période</SelectItem>
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
            <p className="text-base font-medium">Aucun devis sur la période sélectionnée</p>
            <p className="text-sm text-muted-foreground mt-1">
              Changez de période ou créez des devis pour voir vos statistiques apparaître ici.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs principaux */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: "Taux de conversion",
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
                      {stats.evolutionTaux > 0 ? "+" : ""}
                      {stats.evolutionTaux.toFixed(1)}% vs période précédente
                    </span>
                  </div>
                ),
              },
              {
                title: "Montant accepté",
                icon: Euro,
                iconClass: "text-emerald-500",
                value: formatCurrency(stats.montantAccepte),
                valueClass: "",
                trailing: (
                  <p className="text-sm text-muted-foreground mt-1">
                    sur {formatCurrency(stats.montantTotal)} total
                  </p>
                ),
              },
              {
                title: "En attente de réponse",
                icon: Clock,
                iconClass: "text-blue-500",
                value: String(stats.envoyes),
                valueClass: "text-blue-600 dark:text-blue-400",
                trailing: (
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(stats.montantEnAttente)} en jeu
                  </p>
                ),
              },
              {
                title: "Délai moyen de réponse",
                icon: BarChart3,
                iconClass: "text-purple-500",
                value: `${stats.delaiMoyen} j`,
                valueClass: "",
                trailing: (
                  <p className="text-sm text-muted-foreground mt-1">
                    pour {stats.avecReponseCount} devis traités
                  </p>
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
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {kpi.title}
                      </CardTitle>
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
                <CardTitle>Répartition par statut</CardTitle>
                <CardDescription>Distribution des {stats.total} devis sur la période</CardDescription>
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
                <CardTitle>Analyse financière</CardTitle>
                <CardDescription>Répartition des montants par statut</CardDescription>
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
              <CardTitle>Résumé de la période</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                {[
                  { icon: FileText, value: stats.total, label: "Devis créés", iconClass: "text-muted-foreground", valueClass: "" },
                  { icon: CheckCircle, value: stats.acceptes, label: "Acceptés", iconClass: "text-emerald-500", valueClass: "text-emerald-600 dark:text-emerald-400" },
                  { icon: XCircle, value: stats.refuses, label: "Refusés", iconClass: "text-red-500", valueClass: "text-red-600 dark:text-red-400" },
                  { icon: Clock, value: stats.envoyes, label: "En attente", iconClass: "text-blue-500", valueClass: "text-blue-600 dark:text-blue-400" },
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
