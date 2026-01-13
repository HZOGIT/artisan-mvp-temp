import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Star, MessageSquare, Eye, EyeOff, Send, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function Avis() {
  const [repondreAvisId, setRepondreAvisId] = useState<number | null>(null);
  const [reponse, setReponse] = useState("");

  const { data: avis, refetch } = trpc.avis.getAll.useQuery();
  const { data: stats } = trpc.avis.getStats.useQuery();

  const repondreMutation = trpc.avis.repondre.useMutation({
    onSuccess: () => {
      toast.success("Réponse envoyée");
      setRepondreAvisId(null);
      setReponse("");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const modererMutation = trpc.avis.moderer.useMutation({
    onSuccess: () => {
      toast.success("Avis modéré");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const renderStars = (note: number, size: "sm" | "lg" = "sm") => {
    const sizeClass = size === "lg" ? "h-6 w-6" : "h-4 w-4";
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${sizeClass} ${
              star <= note ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  const getStatutBadge = (statut: string | null) => {
    switch (statut) {
      case "publie":
        return <Badge className="bg-green-500">Publié</Badge>;
      case "masque":
        return <Badge variant="secondary">Masqué</Badge>;
      case "en_attente":
        return <Badge className="bg-orange-500">En attente</Badge>;
      default:
        return <Badge variant="outline">Inconnu</Badge>;
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Star className="h-6 w-6" />
          Avis clients
        </h1>
        <p className="text-muted-foreground">
          Consultez et gérez les avis laissés par vos clients
        </p>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Note moyenne</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-3xl font-bold">
                    {stats?.moyenne.toFixed(1) || "0.0"}
                  </span>
                  {renderStars(Math.round(stats?.moyenne || 0), "lg")}
                </div>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total avis</p>
            <p className="text-3xl font-bold">{stats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-2">Distribution</p>
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((note) => {
                const count = stats?.distribution[note] || 0;
                const percentage = stats?.total ? (count / stats.total) * 100 : 0;
                return (
                  <div key={note} className="flex items-center gap-2">
                    <span className="w-4 text-sm">{note}</span>
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="w-8 text-sm text-muted-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Liste des avis */}
      <Card>
        <CardHeader>
          <CardTitle>Tous les avis ({avis?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {avis?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucun avis pour le moment. Envoyez des demandes d'avis après vos interventions.
            </div>
          ) : (
            <div className="space-y-4">
              {avis?.map((a) => (
                <div key={a.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {renderStars(a.note)}
                        {getStatutBadge(a.statut)}
                      </div>
                      <p className="font-medium">{a.client?.nom || "Client"}</p>
                      {a.intervention && (
                        <p className="text-sm text-muted-foreground">
                          Intervention : {a.intervention.titre} -{" "}
                          {formatDate(a.intervention.dateDebut)}
                        </p>
                      )}
                      {a.commentaire && (
                        <p className="mt-2 text-sm">{a.commentaire}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDate(a.createdAt)}
                      </p>
                      
                      {/* Réponse de l'artisan */}
                      {a.reponseArtisan && (
                        <div className="mt-3 p-3 bg-muted rounded-lg">
                          <p className="text-sm font-medium">Votre réponse :</p>
                          <p className="text-sm mt-1">{a.reponseArtisan}</p>
                          {a.reponseAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(a.reponseAt)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!a.reponseArtisan && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRepondreAvisId(a.id)}
                        >
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Répondre
                        </Button>
                      )}
                      {a.statut === "publie" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            modererMutation.mutate({ avisId: a.id, statut: "masque" })
                          }
                        >
                          <EyeOff className="h-4 w-4 mr-1" />
                          Masquer
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            modererMutation.mutate({ avisId: a.id, statut: "publie" })
                          }
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Publier
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog pour répondre */}
      <Dialog open={!!repondreAvisId} onOpenChange={() => setRepondreAvisId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Répondre à l'avis</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={reponse}
              onChange={(e) => setReponse(e.target.value)}
              placeholder="Écrivez votre réponse..."
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRepondreAvisId(null)}>
                Annuler
              </Button>
              <Button
                onClick={() => {
                  if (repondreAvisId && reponse.trim()) {
                    repondreMutation.mutate({
                      avisId: repondreAvisId,
                      reponse: reponse.trim(),
                    });
                  }
                }}
                disabled={!reponse.trim() || repondreMutation.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                Envoyer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
