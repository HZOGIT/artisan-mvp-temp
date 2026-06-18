import { useMemo } from "react";
import { Link } from "@/modern/shared/router/navigation";
import { useTranslation } from "react-i18next";
import { useFlotte } from "../application/use-flotte";
import {
  assurances30j,
  daysUntil,
  entretiensEnRetard,
  indexByVehiculeId,
  indexVehiculesById,
  type AssuranceExpirant,
  type EntretienAVenir,
  type Vehicule,
} from "../domain/flotte";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Badge } from "@/modern/shared/ui/badge";
import { Car, Gauge, Wrench, Shield, AlertTriangle, Calendar, TrendingUp, PlusCircle, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// Page Flotte du FRONT NEUF (`/v2/flotte`) — MIGRATION clean-archi de `pages/Flotte.tsx` (vue d'ensemble
// du parc, lecture seule ; legacy chaînes EN DUR → i18n namespace `flotte`). Données via `useFlotte`
// (couche application, seule à importer tRPC) ; jours-restants, alertes et index par véhicule via le
// domaine (fonctions pures testées). Présentation pure, 0 `any`.

function eur(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function fmtKm(n: number | null | undefined) {
  return `${Number(n || 0).toLocaleString("fr-FR")} km`;
}

function fmtDate(value: string | Date) {
  return format(new Date(value), "dd MMM yyyy", { locale: fr });
}

export default function FlottePage() {
  const { t } = useTranslation("flotte");
  const { stats, vehicules, entretiens, assurances } = useFlotte();

  const alertesEntretiensEnRetard = useMemo(() => entretiensEnRetard(entretiens), [entretiens]);
  const alertesAssurances30j = useMemo(() => assurances30j(assurances), [assurances]);
  const entretienByVehicule = useMemo(() => indexByVehiculeId(entretiens), [entretiens]);
  const assuranceByVehicule = useMemo(() => indexByVehiculeId(assurances), [assurances]);
  // marque/modèle/immatriculation absents des DTO entretien/assurance → résolus via la liste véhicules.
  const vehiculeById = useMemo(() => indexVehiculesById(vehicules), [vehicules]);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Car className="h-7 w-7 text-blue-600" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link to="/vehicules">
            <PlusCircle className="h-4 w-4 mr-2" /> {t("manageBtn")}
          </Link>
        </Button>
      </div>

      {/* SECTION 1 — Stats flotte */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Car className="h-3 w-3" /> {t("statVehicules")}
            </CardDescription>
            <CardTitle className="text-3xl">{stats?.nbVehicules ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {t("statVehiculesSub", { actifs: stats?.nbActifs ?? 0, maintenance: stats?.nbEnMaintenance ?? 0 })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Gauge className="h-3 w-3" /> {t("statKmTotal")}
            </CardDescription>
            <CardTitle className="text-3xl">{fmtKm(stats?.kmTotalFlotte)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3 inline mr-1" /> {t("statKmSub")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Wrench className="h-3 w-3" /> {t("statCoutEntretien")}
            </CardDescription>
            <CardTitle className="text-3xl">{eur(stats?.coutEntretienAnneeEnCours)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {t("statCoutSub", { annee: new Date().getFullYear() })}
          </CardContent>
        </Card>

        <Card className={alertesAssurances30j.length > 0 ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Shield className="h-3 w-3" /> {t("statAssurances")}
            </CardDescription>
            <CardTitle className="text-3xl">{alertesAssurances30j.length}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{t("statAssurancesSub")}</CardContent>
        </Card>
      </div>

      {/* SECTION 3 — Alertes (avant la liste, prioritaires) */}
      {(alertesEntretiensEnRetard.length > 0 || alertesAssurances30j.length > 0) && (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900 dark:text-orange-100">
              <AlertTriangle className="h-5 w-5" /> {t("alertesTitle")}
            </CardTitle>
            <CardDescription>{t("alertesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {alertesEntretiensEnRetard.map((e: EntretienAVenir) => {
              const veh = vehiculeById.get(e.vehiculeId);
              return (
                <div key={`ent-${e.id}`} className="flex items-center gap-3 p-2 rounded border bg-background">
                  <Wrench className="h-4 w-4 text-rose-600 shrink-0" />
                  <span className="text-sm flex-1">
                    {t("entretienEnRetard", {
                      marque: veh?.marque ?? "",
                      modele: veh?.modele ?? "",
                      immatriculation: veh?.immatriculation ?? "",
                      type: e.type,
                      date: e.prochainEntretienDate ? fmtDate(e.prochainEntretienDate) : t("dash"),
                    })}
                  </span>
                  <Badge variant="destructive">{t("badgeEnRetard")}</Badge>
                </div>
              );
            })}
            {alertesAssurances30j.map((a: AssuranceExpirant) => {
              const d = daysUntil(a.dateFin);
              const veh = vehiculeById.get(a.vehiculeId);
              return (
                <div key={`ass-${a.id}`} className="flex items-center gap-3 p-2 rounded border bg-background">
                  <Shield className="h-4 w-4 text-orange-600 shrink-0" />
                  <span className="text-sm flex-1">
                    {t("assuranceExpire", {
                      marque: veh?.marque ?? "",
                      modele: veh?.modele ?? "",
                      immatriculation: veh?.immatriculation ?? "",
                      compagnie: a.compagnie,
                      date: a.dateFin ? fmtDate(a.dateFin) : t("dash"),
                    })}
                  </span>
                  <Badge variant={(d ?? 0) <= 7 ? "destructive" : "default"}>
                    {t("badgeJMoins", { n: d ?? "?" })}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* SECTION 2 — Liste véhicules */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">{t("vehiculesTitle")}</h2>
          <span className="text-sm text-muted-foreground">{t("vehiculesCount", { n: vehicules.length })}</span>
        </div>

        {vehicules.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Car className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground mb-3">{t("empty")}</p>
              <Button asChild>
                <Link to="/vehicules">{t("addBtn")}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {vehicules.map((v: Vehicule) => {
              const entretien = entretienByVehicule.get(v.id);
              const assurance = assuranceByVehicule.get(v.id);
              return (
                <Card key={v.id} className="hover:border-blue-300 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          {v.marque || t("dash")} {v.modele || ""}
                        </CardTitle>
                        <CardDescription className="font-mono">{v.immatriculation}</CardDescription>
                      </div>
                      <Badge variant={v.statut === "actif" ? "default" : "secondary"}>{v.statut}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{fmtKm(v.kilometrageActuel)}</span>
                    </div>
                    {entretien?.prochainEntretienDate && (
                      <div className="flex items-center gap-2">
                        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{t("prochainEntretien", { date: fmtDate(entretien.prochainEntretienDate) })}</span>
                      </div>
                    )}
                    {assurance?.dateFin && (
                      <div className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{t("assuranceJusqu", { date: fmtDate(assurance.dateFin) })}</span>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <Link to={`/vehicules`}>
                          {t("detail")} <ArrowRight className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <Link to={`/vehicules`}>
                          <Calendar className="h-3 w-3 mr-1" /> {t("addKm")}
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
