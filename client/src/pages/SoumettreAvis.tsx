import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Star, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export default function SoumettreAvis() {
  const { token } = useParams<{ token: string }>();
  const [note, setNote] = useState<number>(0);
  const [hoverNote, setHoverNote] = useState<number>(0);
  const [commentaire, setCommentaire] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: info, isLoading, error } = trpc.avis.getDemandeInfo.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );

  const submitMutation = trpc.avis.submitAvis.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Merci pour votre avis !");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || note === 0) return;
    submitMutation.mutate({
      token,
      note,
      commentaire: commentaire.trim() || undefined,
    });
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
            <p>Chargement...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-bold mb-2">Lien invalide</h2>
            <p className="text-muted-foreground">
              Ce lien de demande d'avis n'existe pas ou a expiré.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (info.isExpired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Clock className="h-12 w-12 mx-auto mb-4 text-orange-500" />
            <h2 className="text-xl font-bold mb-2">Lien expiré</h2>
            <p className="text-muted-foreground">
              Ce lien de demande d'avis a expiré. Contactez votre artisan pour en recevoir un nouveau.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (info.isCompleted || submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <h2 className="text-xl font-bold mb-2">Merci pour votre avis !</h2>
            <p className="text-muted-foreground">
              Votre retour a bien été enregistré. Il nous aide à améliorer nos services.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Donnez votre avis</CardTitle>
          <CardDescription>
            {info.artisan?.nomEntreprise || "Votre artisan"} souhaite connaître votre satisfaction
          </CardDescription>
        </CardHeader>
        <CardContent>
          {info.intervention && (
            <div className="mb-6 p-4 bg-muted rounded-lg">
              <p className="font-medium">{info.intervention.titre}</p>
              <p className="text-sm text-muted-foreground">
                {formatDate(info.intervention.dateDebut)}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Sélection de la note */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-3">
                Comment évaluez-vous notre prestation ?
              </p>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setNote(star)}
                    onMouseEnter={() => setHoverNote(star)}
                    onMouseLeave={() => setHoverNote(0)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-10 w-10 ${
                        star <= (hoverNote || note)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
              {note > 0 && (
                <p className="text-sm mt-2">
                  {note === 1 && "Très insatisfait"}
                  {note === 2 && "Insatisfait"}
                  {note === 3 && "Correct"}
                  {note === 4 && "Satisfait"}
                  {note === 5 && "Très satisfait"}
                </p>
              )}
            </div>

            {/* Commentaire */}
            <div>
              <Textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Partagez votre expérience (optionnel)..."
                rows={4}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={note === 0 || submitMutation.isPending}
            >
              {submitMutation.isPending ? "Envoi en cours..." : "Envoyer mon avis"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
