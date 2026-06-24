import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin, Play, Square, Navigation, Phone, Clock, CheckCircle2, Loader2, PenTool, Users } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Textarea } from "@/shared/ui/textarea";
import { Badge } from "@/shared/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { useInterventionsMobile } from "../application/use-interventions-mobile";
import { statutVariant, equipeParIntervention, membreName, dureeSurSite, mapsUrl, type MobileIntervention } from "../domain/interventions-mobile";

/*
 * Page `/mobile` — migration clean-archi de `pages/InterventionsMobile.tsx`. Markup à l'identique (le
 * DashboardLayout est fourni par le shell modern). Agrégats/format en domain ; canvas signature/géoloc en UI.
 */
export default function InterventionsMobilePage() {
  const { t } = useTranslation("interventionsMobile");
  const { interventions, equipes, isLoading, refetch, start, end } = useInterventionsMobile();
  const [selected, setSelected] = useState<MobileIntervention | null>(null);
  const [isSignatureDialogOpen, setIsSignatureDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const equipeMap = equipeParIntervention(equipes);

  const handleStart = (intervention: MobileIntervention) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => start.mutate({ interventionId: intervention.id, latitude: pos.coords.latitude, longitude: pos.coords.longitude }, { onSuccess: () => { toast.success(t("toastDemarree")); refetch(); }, onError: (e) => toast.error(e.message) }),
        () => start.mutate({ interventionId: intervention.id }, { onSuccess: () => { toast.success(t("toastDemarree")); refetch(); }, onError: (e) => toast.error(e.message) }),
      );
    } else {
      start.mutate({ interventionId: intervention.id }, { onSuccess: () => { toast.success(t("toastDemarree")); refetch(); }, onError: (e) => toast.error(e.message) });
    }
  };

  const handleEnd = () => {
    if (!selected) return;
    end.mutate({ interventionId: selected.id, notes: notes || undefined, signatureClient: signature || undefined }, {
      onSuccess: () => { toast.success(t("toastTerminee")); setIsSignatureDialogOpen(false); setSelected(null); setNotes(""); setSignature(null); refetch(); },
      onError: (e) => toast.error(e.message),
    });
  };

  const callClient = (telephone: string) => { window.location.href = `tel:${telephone}`; };

  const pointFromEvent = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    const { x, y } = pointFromEvent(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    if ("touches" in e) e.preventDefault();
    const { x, y } = pointFromEvent(e);
    ctx.lineTo(x, y); ctx.stroke();
  };
  const stopDrawing = () => { setIsDrawing(false); if (canvasRef.current) setSignature(canvasRef.current.toDataURL()); };
  const clearSignature = () => { const ctx = canvasRef.current?.getContext("2d"); if (!ctx || !canvasRef.current) return; ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); setSignature(null); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("titre")}</h1>
        <p className="text-muted-foreground">{format(new Date(), "EEEE dd MMMM yyyy", { locale: fr })}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : interventions.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">{t("aucuneIntervention")}</p></CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {interventions.map((intervention) => {
            const equipe = equipeMap.get(intervention.id) ?? [];
            return (
              <Card key={intervention.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{intervention.titre}</CardTitle>
                    <Badge variant={statutVariant(intervention.statut || "planifiee")}>{t(`statut.${intervention.statut || "planifiee"}`)}</Badge>
                  </div>
                  <CardDescription>{intervention.client?.nom} {intervention.client?.prenom}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{format(new Date(intervention.dateDebut), "HH:mm", { locale: fr })}{intervention.dateFin && ` - ${format(new Date(intervention.dateFin), "HH:mm", { locale: fr })}`}</span>
                  </div>
                  {intervention.adresse && (<div className="flex items-start gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5" /><span>{intervention.adresse}</span></div>)}
                  {equipe.length > 0 && (
                    <div className="flex items-start gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex flex-wrap gap-1">{equipe.map((m) => (<Badge key={m.technicienId} variant="secondary" className="text-[11px] font-normal">{membreName(m)}</Badge>))}</div>
                    </div>
                  )}
                  {intervention.description && (<p className="text-sm text-muted-foreground">{intervention.description}</p>)}
                  {intervention.mobileData && (
                    <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                      {intervention.mobileData.heureArrivee && (<p>{t("arrivee", { heure: format(new Date(intervention.mobileData.heureArrivee), "HH:mm") })}</p>)}
                      {intervention.mobileData.heureDepart && (<p>{t("depart", { heure: format(new Date(intervention.mobileData.heureDepart), "HH:mm") })}</p>)}
                      {intervention.mobileData.heureArrivee && intervention.mobileData.heureDepart && (
                        <p className="font-medium">{t("dureeSurSite", { duree: dureeSurSite(intervention.mobileData.heureArrivee, intervention.mobileData.heureDepart) })}</p>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {intervention.adresse && (<Button variant="outline" className="min-h-[44px] flex-1 sm:flex-none" onClick={() => intervention.adresse && window.open(mapsUrl(intervention.adresse), "_blank")}><Navigation className="h-4 w-4 mr-2" />{t("itineraire")}</Button>)}
                    {intervention.client?.telephone && (<Button variant="outline" className="min-h-[44px] flex-1 sm:flex-none" onClick={() => intervention.client?.telephone && callClient(intervention.client.telephone)}><Phone className="h-4 w-4 mr-2" />{t("appeler")}</Button>)}
                    {intervention.statut === "planifiee" && (
                      <Button className="min-h-[44px] flex-1 sm:flex-none" onClick={() => handleStart(intervention)} disabled={start.isPending}>
                        {start.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}{t("demarrer")}
                      </Button>
                    )}
                    {intervention.statut === "en_cours" && (
                      <Button className="min-h-[44px] flex-1 sm:flex-none" onClick={() => { setSelected(intervention); setIsSignatureDialogOpen(true); }}><Square className="h-4 w-4 mr-2" />{t("terminer")}</Button>
                    )}
                    {intervention.statut === "terminee" && (<div className="flex items-center gap-2 text-green-600"><CheckCircle2 className="h-4 w-4" /><span className="text-sm">{t("terminee")}</span></div>)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isSignatureDialogOpen} onOpenChange={setIsSignatureDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("terminerTitre")}</DialogTitle>
            <DialogDescription>{t("terminerDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("notesIntervention")}</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("notesPlaceholder")} rows={3} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{t("signatureClient")}</label>
                <Button variant="ghost" size="sm" onClick={clearSignature}>{t("effacer")}</Button>
              </div>
              <div className="border rounded-lg bg-white">
                <canvas ref={canvasRef} width={350} height={150} className="w-full touch-none" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
              </div>
              <p className="text-xs text-muted-foreground text-center"><PenTool className="h-3 w-3 inline mr-1" />{t("signezCadre")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setIsSignatureDialogOpen(false)}>{t("annuler")}</Button>
            <Button className="min-h-[44px]" onClick={handleEnd} disabled={end.isPending}>{end.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{t("valider")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
