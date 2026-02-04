import { useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { 
  MapPin, 
  Play, 
  Square, 
  Camera, 
  Navigation, 
  Phone, 
  Clock, 
  CheckCircle2, 
  Loader2,
  PenTool
} from "lucide-react";

export default function InterventionsMobile() {
  const [selectedIntervention, setSelectedIntervention] = useState<any>(null);
  const [isSignatureDialogOpen, setIsSignatureDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const { data: interventions, isLoading, refetch } = trpc.interventionsMobile.getTodayInterventions.useQuery();

  const startMutation = trpc.interventionsMobile.startIntervention.useMutation({
    onSuccess: () => {
      toast.success("Intervention démarrée");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const endMutation = trpc.interventionsMobile.endIntervention.useMutation({
    onSuccess: () => {
      toast.success("Intervention terminée");
      setIsSignatureDialogOpen(false);
      setSelectedIntervention(null);
      setNotes("");
      setSignature(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleStart = async (intervention: any) => {
    // Essayer d'obtenir la géolocalisation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          startMutation.mutate({
            interventionId: intervention.id,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => {
          // En cas d'erreur de géolocalisation, démarrer sans
          startMutation.mutate({ interventionId: intervention.id });
        }
      );
    } else {
      startMutation.mutate({ interventionId: intervention.id });
    }
  };

  const handleEnd = () => {
    if (!selectedIntervention) return;
    endMutation.mutate({
      interventionId: selectedIntervention.id,
      notes: notes || undefined,
      signatureClient: signature || undefined,
    });
  };

  const openMaps = (adresse: string) => {
    const encodedAddress = encodeURIComponent(adresse);
    // Essayer d'ouvrir Google Maps sur mobile
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, "_blank");
  };

  const callClient = (telephone: string) => {
    window.location.href = `tel:${telephone}`;
  };

  // Fonctions de signature
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;
    if ("touches" in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;
    if ("touches" in e) {
      e.preventDefault();
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignature(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignature(null);
  };

  const getStatutBadge = (statut: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      planifiee: { variant: "secondary", label: "Planifiée" },
      en_cours: { variant: "default", label: "En cours" },
      terminee: { variant: "outline", label: "Terminée" },
      annulee: { variant: "destructive", label: "Annulée" },
    };
    const config = variants[statut] || { variant: "outline" as const, label: statut };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Interventions du jour</h1>
          <p className="text-muted-foreground">
            {format(new Date(), "EEEE dd MMMM yyyy", { locale: fr })}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : interventions?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Aucune intervention prévue aujourd'hui</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {interventions?.map((intervention) => (
              <Card key={intervention.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{intervention.titre}</CardTitle>
                    {getStatutBadge(intervention.statut || "planifiee")}
                  </div>
                  <CardDescription>
                    {intervention.client?.nom} {intervention.client?.prenom}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Horaire */}
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {format(new Date(intervention.dateDebut), "HH:mm", { locale: fr })}
                      {intervention.dateFin && ` - ${format(new Date(intervention.dateFin), "HH:mm", { locale: fr })}`}
                    </span>
                  </div>

                  {/* Adresse */}
                  {intervention.adresse && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <span>{intervention.adresse}</span>
                    </div>
                  )}

                  {/* Description */}
                  {intervention.description && (
                    <p className="text-sm text-muted-foreground">{intervention.description}</p>
                  )}

                  {/* Données mobiles */}
                  {intervention.mobileData && (
                    <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                      {intervention.mobileData.heureArrivee && (
                        <p>Arrivée: {format(new Date(intervention.mobileData.heureArrivee), "HH:mm")}</p>
                      )}
                      {intervention.mobileData.heureDepart && (
                        <p>Départ: {format(new Date(intervention.mobileData.heureDepart), "HH:mm")}</p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {/* Navigation */}
                    {intervention.adresse && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => intervention.adresse && openMaps(intervention.adresse)}
                      >
                        <Navigation className="h-4 w-4 mr-2" />
                        Itinéraire
                      </Button>
                    )}

                    {/* Appeler le client */}
                    {intervention.client?.telephone && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => intervention.client?.telephone && callClient(intervention.client.telephone)}
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        Appeler
                      </Button>
                    )}

                    {/* Démarrer l'intervention */}
                    {intervention.statut === "planifiee" && (
                      <Button
                        size="sm"
                        onClick={() => handleStart(intervention)}
                        disabled={startMutation.isPending}
                      >
                        {startMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Démarrer
                      </Button>
                    )}

                    {/* Terminer l'intervention */}
                    {intervention.statut === "en_cours" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedIntervention(intervention);
                          setIsSignatureDialogOpen(true);
                        }}
                      >
                        <Square className="h-4 w-4 mr-2" />
                        Terminer
                      </Button>
                    )}

                    {/* Intervention terminée */}
                    {intervention.statut === "terminee" && (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm">Terminée</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Dialog de fin d'intervention avec signature */}
        <Dialog open={isSignatureDialogOpen} onOpenChange={setIsSignatureDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Terminer l'intervention</DialogTitle>
              <DialogDescription>
                Ajoutez des notes et faites signer le client
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes d'intervention</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Travaux effectués, observations..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Signature du client</label>
                  <Button variant="ghost" size="sm" onClick={clearSignature}>
                    Effacer
                  </Button>
                </div>
                <div className="border rounded-lg bg-white">
                  <canvas
                    ref={canvasRef}
                    width={350}
                    height={150}
                    className="w-full touch-none"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  <PenTool className="h-3 w-3 inline mr-1" />
                  Signez dans le cadre ci-dessus
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSignatureDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleEnd} disabled={endMutation.isPending}>
                {endMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Valider
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
