import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Clock, Battery, RefreshCw, Car, User } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function Geolocalisation() {
  const [selectedTechnicien, setSelectedTechnicien] = useState<number | null>(null);
  
  const { data: positions, isLoading, refetch } = trpc.geolocalisation.getPositions.useQuery();
  const { data: techniciens } = trpc.techniciens.getAll.useQuery();
  
  // Auto-refresh toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetch]);

  const getStatutBadge = (enDeplacement: boolean | null) => {
    if (enDeplacement) {
      return <Badge className="bg-green-100 text-green-800">En déplacement</Badge>;
    }
    return <Badge variant="secondary">Stationnaire</Badge>;
  };

  const getBatterieColor = (niveau: number | null) => {
    if (!niveau) return "text-gray-400";
    if (niveau > 50) return "text-green-500";
    if (niveau > 20) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Géolocalisation</h1>
            <p className="text-muted-foreground">
              Suivez vos techniciens en temps réel
            </p>
          </div>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Liste des techniciens */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Techniciens</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  <p className="text-muted-foreground">Chargement...</p>
                ) : positions && positions.length > 0 ? (
                  positions.map((pos) => (
                    <div
                      key={pos.technicien.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedTechnicien === pos.technicien.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedTechnicien(pos.technicien.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: pos.technicien.couleur || "#3B82F6" }}
                          />
                          <span className="font-medium">{pos.technicien.nom}</span>
                        </div>
                        {getStatutBadge(pos.enDeplacement)}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          <span>
                            {format(new Date(pos.timestamp), "HH:mm", { locale: fr })}
                          </span>
                        </div>
                        {pos.batterie && (
                          <div className="flex items-center gap-2">
                            <Battery className={`h-3 w-3 ${getBatterieColor(pos.batterie)}`} />
                            <span>{pos.batterie}%</span>
                          </div>
                        )}
                        {pos.vitesse && parseFloat(pos.vitesse) > 0 && (
                          <div className="flex items-center gap-2">
                            <Car className="h-3 w-3" />
                            <span>{parseFloat(pos.vitesse).toFixed(0)} km/h</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : techniciens && techniciens.length > 0 ? (
                  <div className="text-center py-4">
                    <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Aucune position reçue
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Les techniciens doivent activer le mode mobile
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Aucun technicien configuré
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Statistiques */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Statistiques du jour</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-primary">
                      {positions?.filter(p => p.enDeplacement).length || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">En déplacement</p>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold">
                      {positions?.length || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Techniciens actifs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Carte */}
          <div className="lg:col-span-2">
            <Card className="h-[600px]">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Carte en temps réel
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-80px)]">
                <div className="w-full h-full bg-muted/30 rounded-lg flex items-center justify-center relative">
                  {/* Placeholder pour la carte - à intégrer avec Google Maps */}
                  <div className="text-center">
                    <MapPin className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-2">
                      Carte des positions
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {positions && positions.length > 0 ? (
                        <>
                          {positions.length} technicien(s) localisé(s)
                        </>
                      ) : (
                        "En attente de positions GPS"
                      )}
                    </p>
                  </div>

                  {/* Affichage des positions sous forme de liste */}
                  {positions && positions.length > 0 && (
                    <div className="absolute bottom-4 left-4 right-4 bg-background/95 backdrop-blur rounded-lg p-4 max-h-48 overflow-y-auto">
                      <p className="text-sm font-medium mb-2">Dernières positions :</p>
                      {positions.map((pos) => (
                        <div key={pos.technicien.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: pos.technicien.couleur || "#3B82F6" }}
                            />
                            <span className="text-sm">{pos.technicien.nom}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {parseFloat(pos.latitude).toFixed(4)}, {parseFloat(pos.longitude).toFixed(4)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
