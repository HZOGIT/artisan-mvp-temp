import { useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Car,
  Gauge,
  Wrench,
  Shield,
  AlertTriangle,
  Calendar,
  TrendingUp,
  PlusCircle,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

function eur(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function fmtKm(n: number | null | undefined) {
  return `${Number(n || 0).toLocaleString("fr-FR")} km`;
}

function daysUntil(dateStr: string | Date | null | undefined): number | null {
  if (!dateStr) return null;
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export default function Flotte() {
  const { data: stats } = trpc.vehicules.getStatistiquesFlotte.useQuery();
  const { data: vehicules } = trpc.vehicules.list.useQuery();
  const { data: entretiensAVenir } = trpc.vehicules.getEntretiensAVenir.useQuery();
  const { data: assurancesExpirant } = trpc.vehicules.getAssurancesExpirant.useQuery();

  const alertesEntretiensEnRetard = useMemo(() => {
    if (!entretiensAVenir) return [];
    return entretiensAVenir.filter((e: any) => {
      const d = daysUntil(e.prochainEntretienDate);
      return d !== null && d < 0;
    });
  }, [entretiensAVenir]);

  const alertesAssurances30j = useMemo(() => {
    if (!assurancesExpirant) return [];
    return assurancesExpirant.filter((a: any) => {
      const d = daysUntil(a.dateFin);
      return d !== null && d <= 30;
    });
  }, [assurancesExpirant]);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Car className="h-7 w-7 text-blue-600" />
            Flotte
          </h1>
          <p className="text-muted-foreground mt-1">Vue d'ensemble de vos véhicules et alertes</p>
        </div>
        <Button asChild>
          <Link to="/vehicules">
            <PlusCircle className="h-4 w-4 mr-2" /> Gérer les véhicules
          </Link>
        </Button>
      </div>

      {/* SECTION 1 — Stats flotte */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Car className="h-3 w-3" /> Véhicules
            </CardDescription>
            <CardTitle className="text-3xl">{stats?.nbVehicules ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {stats?.nbActifs ?? 0} actif{(stats?.nbActifs ?? 0) > 1 ? "s" : ""} · {stats?.nbEnMaintenance ?? 0} en maintenance
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Gauge className="h-3 w-3" /> Km total flotte
            </CardDescription>
            <CardTitle className="text-3xl">{fmtKm(stats?.kmTotalFlotte)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3 inline mr-1" /> Cumul sur tous véhicules
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Wrench className="h-3 w-3" /> Coût entretiens
            </CardDescription>
            <CardTitle className="text-3xl">{eur(stats?.coutEntretienAnneeEnCours)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Année {new Date().getFullYear()}
          </CardContent>
        </Card>

        <Card className={alertesAssurances30j.length > 0 ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Shield className="h-3 w-3" /> Assurances à expirer
            </CardDescription>
            <CardTitle className="text-3xl">{alertesAssurances30j.length}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Sous 30 jours
          </CardContent>
        </Card>
      </div>

      {/* SECTION 3 — Alertes (avant la liste, prioritaires) */}
      {(alertesEntretiensEnRetard.length > 0 || alertesAssurances30j.length > 0) && (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900 dark:text-orange-100">
              <AlertTriangle className="h-5 w-5" /> Alertes
            </CardTitle>
            <CardDescription>Points à traiter rapidement</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {alertesEntretiensEnRetard.map((e: any) => (
              <div key={`ent-${e.id}`} className="flex items-center gap-3 p-2 rounded border bg-background">
                <Wrench className="h-4 w-4 text-rose-600 shrink-0" />
                <span className="text-sm flex-1">
                  <strong>{e.marque} {e.modele}</strong> ({e.immatriculation}) — entretien {e.type} en retard depuis le{" "}
                  {e.prochainEntretienDate ? format(new Date(e.prochainEntretienDate), "dd MMM yyyy", { locale: fr }) : "—"}
                </span>
                <Badge variant="destructive">En retard</Badge>
              </div>
            ))}
            {alertesAssurances30j.map((a: any) => {
              const d = daysUntil(a.dateFin);
              return (
                <div key={`ass-${a.id}`} className="flex items-center gap-3 p-2 rounded border bg-background">
                  <Shield className="h-4 w-4 text-orange-600 shrink-0" />
                  <span className="text-sm flex-1">
                    <strong>{a.marque} {a.modele}</strong> ({a.immatriculation}) — assurance {a.compagnie} expire le{" "}
                    {a.dateFin ? format(new Date(a.dateFin), "dd MMM yyyy", { locale: fr }) : "—"}
                  </span>
                  <Badge variant={(d ?? 0) <= 7 ? "destructive" : "default"}>
                    J-{d ?? "?"}
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
          <h2 className="text-xl font-semibold">Véhicules</h2>
          <span className="text-sm text-muted-foreground">
            {vehicules?.length ?? 0} véhicule{(vehicules?.length ?? 0) > 1 ? "s" : ""}
          </span>
        </div>

        {!vehicules || vehicules.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Car className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground mb-3">Aucun véhicule dans votre flotte</p>
              <Button asChild>
                <Link to="/vehicules">Ajouter un véhicule</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {vehicules.map((v: any) => {
              const entretien = entretiensAVenir?.find((e: any) => e.vehiculeId === v.id);
              const assurance = assurancesExpirant?.find((a: any) => a.vehiculeId === v.id);
              return (
                <Card key={v.id} className="hover:border-blue-300 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          {v.marque || "—"} {v.modele || ""}
                        </CardTitle>
                        <CardDescription className="font-mono">
                          {v.immatriculation}
                        </CardDescription>
                      </div>
                      <Badge variant={v.statut === "actif" ? "default" : "secondary"}>
                        {v.statut}
                      </Badge>
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
                        <span>
                          Prochain entretien :{" "}
                          {format(new Date(entretien.prochainEntretienDate), "dd MMM yyyy", { locale: fr })}
                        </span>
                      </div>
                    )}
                    {assurance?.dateFin && (
                      <div className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>
                          Assurance jusqu'au {format(new Date(assurance.dateFin), "dd MMM yyyy", { locale: fr })}
                        </span>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <Link to={`/vehicules`}>
                          Détail <ArrowRight className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <Link to={`/vehicules`}>
                          <Calendar className="h-3 w-3 mr-1" /> + km
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
