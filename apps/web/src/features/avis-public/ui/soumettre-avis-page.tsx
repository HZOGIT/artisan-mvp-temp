import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Star, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { useAvisPublic } from "../application/use-avis-public";
import { noteLabelKey, formatDate } from "../domain/avis-public";

/** Page `/avis/:token` — migration clean-archi de `pages/SoumettreAvis.tsx` (publique). Markup à l'identique. */
function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}

export default function SoumettreAvisPage() {
  const { t } = useTranslation("avisPublic");
  const { token: tokenParam } = useParams({ strict: false }) as { token?: string };
  const token = tokenParam || "";
  const [note, setNote] = useState(0);
  const [hoverNote, setHoverNote] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { info, isLoading, error, submit } = useAvisPublic(token);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || note === 0) return;
    submit.mutate({ token, note, commentaire: commentaire.trim() || undefined }, {
      onSuccess: () => { setSubmitted(true); toast.success(t("toastMerci")); },
      onError: (err) => toast.error(err.message),
    });
  };

  if (isLoading) {
    return <CenteredCard><CardContent className="pt-6 text-center"><Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-pulse" /><p>{t("chargement")}</p></CardContent></CenteredCard>;
  }
  if (error || !info) {
    return <CenteredCard><CardContent className="pt-6 text-center"><XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" /><h2 className="text-xl font-bold mb-2">{t("lienInvalide")}</h2><p className="text-muted-foreground">{t("lienInvalideDesc")}</p></CardContent></CenteredCard>;
  }
  if (info.isExpired) {
    return <CenteredCard><CardContent className="pt-6 text-center"><Clock className="h-12 w-12 mx-auto mb-4 text-orange-500" /><h2 className="text-xl font-bold mb-2">{t("lienExpire")}</h2><p className="text-muted-foreground">{t("lienExpireDesc")}</p></CardContent></CenteredCard>;
  }
  if (info.isCompleted || submitted) {
    return <CenteredCard><CardContent className="pt-6 text-center"><CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" /><h2 className="text-xl font-bold mb-2">{t("merciTitre")}</h2><p className="text-muted-foreground">{t("merciDesc")}</p></CardContent></CenteredCard>;
  }

  const labelKey = noteLabelKey(note);
  return (
    <CenteredCard>
      <CardHeader className="text-center">
        <CardTitle>{t("donnezAvis")}</CardTitle>
        <CardDescription>{t("souhaiteSatisfaction", { artisan: info.artisan?.nomEntreprise || t("votreArtisan") })}</CardDescription>
      </CardHeader>
      <CardContent>
        {info.intervention && (
          <div className="mb-6 p-4 bg-muted rounded-lg">
            <p className="font-medium">{info.intervention.titre}</p>
            <p className="text-sm text-muted-foreground">{formatDate(info.intervention.dateDebut)}</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-3">{t("commentEvaluez")}</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" onClick={() => setNote(star)} onMouseEnter={() => setHoverNote(star)} onMouseLeave={() => setHoverNote(0)} className="p-1 transition-transform hover:scale-110">
                  <Star className={`h-10 w-10 ${star <= (hoverNote || note) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                </button>
              ))}
            </div>
            {labelKey && <p className="text-sm mt-2">{t(labelKey)}</p>}
          </div>
          <div>
            <Textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder={t("commentairePlaceholder")} rows={4} />
          </div>
          <Button type="submit" className="w-full" disabled={note === 0 || submit.isPending}>{submit.isPending ? t("envoiEnCours") : t("envoyerAvis")}</Button>
        </form>
      </CardContent>
    </CenteredCard>
  );
}
