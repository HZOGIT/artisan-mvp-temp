import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAvis } from "../application/use-avis";
import { avisStatutKind, canReply, distributionPercent, nextModerationStatut, type Avis } from "../domain/avis";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Star, MessageSquare, Eye, EyeOff, Send, TrendingUp } from "lucide-react";
import { toast } from "sonner";

/*
 * Page Avis clients du FRONT NEUF (`/avis`) — MIGRATION clean-archi de `pages/Avis.tsx` (legacy chaînes
 * EN DUR → i18n namespace `avis`). Données & mutations via `useAvis` (couche application, seule à importer
 * tRPC) ; catégorie de statut, % distribution, toggle modération via le domaine (pur & testé). 0 `any`.
 */

function renderStars(note: number, size: "sm" | "lg" = "sm") {
  const sizeClass = size === "lg" ? "h-6 w-6" : "h-4 w-4";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={`${sizeClass} ${star <= note ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
      ))}
    </div>
  );
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Notes affichées (5→1) en tuple littéral : `distribution` est typé par clés littérales 1..5. */
const NOTES = [5, 4, 3, 2, 1] as const;

export default function AvisPage() {
  const { t } = useTranslation("avis");
  const { avis, stats, repondre: repondreMutation, moderer: modererMutation } = useAvis();
  const [repondreAvisId, setRepondreAvisId] = useState<number | null>(null);
  const [reponse, setReponse] = useState("");

  const statutBadge = (statut: string | null) => {
    switch (avisStatutKind(statut)) {
      case "publie":
        return <Badge className="bg-green-500">{t("badgePublie")}</Badge>;
      case "masque":
        return <Badge variant="secondary">{t("badgeMasque")}</Badge>;
      case "en_attente":
        return <Badge className="bg-orange-500">{t("badgeEnAttente")}</Badge>;
      default:
        return <Badge variant="outline">{t("badgeInconnu")}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Star className="h-6 w-6" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("statMoyenne")}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-3xl font-bold">{stats?.moyenne.toFixed(1) || "0.0"}</span>
                  {renderStars(Math.round(stats?.moyenne || 0), "lg")}
                </div>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("statTotal")}</p>
            <p className="text-3xl font-bold">{stats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-2">{t("statDistribution")}</p>
            <div className="space-y-2">
              {NOTES.map((note) => {
                const count = stats?.distribution[note] || 0;
                const percentage = distributionPercent(count, stats?.total || 0);
                return (
                  <div key={note} className="flex items-center gap-2">
                    <span className="w-4 text-sm">{note}</span>
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${percentage}%` }} />
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
          <CardTitle>{t("allAvis", { n: avis.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {avis.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("empty")}</div>
          ) : (
            <div className="space-y-4">
              {avis.map((a: Avis) => (
                <div key={a.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {renderStars(a.note)}
                        {statutBadge(a.statut)}
                      </div>
                      <p className="font-medium">{a.client?.nom || t("clientFallback")}</p>
                      {a.intervention && (
                        <p className="text-sm text-muted-foreground">
                          {t("intervention", { titre: a.intervention.titre, date: formatDate(a.intervention.dateDebut) })}
                        </p>
                      )}
                      {a.commentaire && <p className="mt-2 text-sm">{a.commentaire}</p>}
                      <p className="text-xs text-muted-foreground mt-2">{formatDate(a.createdAt)}</p>

                      {/* Réponse de l'artisan */}
                      {a.reponseArtisan && (
                        <div className="mt-3 p-3 bg-muted rounded-lg">
                          <p className="text-sm font-medium">{t("yourReply")}</p>
                          <p className="text-sm mt-1">{a.reponseArtisan}</p>
                          {a.reponseAt && <p className="text-xs text-muted-foreground mt-1">{formatDate(a.reponseAt)}</p>}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {canReply(a) && (
                        <Button variant="outline" size="sm" onClick={() => setRepondreAvisId(a.id)}>
                          <MessageSquare className="h-4 w-4 mr-1" />
                          {t("repondre")}
                        </Button>
                      )}
                      {a.statut === "publie" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            modererMutation.mutate(
                              { avisId: a.id, statut: nextModerationStatut(a.statut) },
                              { onSuccess: () => toast.success(t("toastModerated")), onError: (e) => toast.error(e.message) },
                            )
                          }
                        >
                          <EyeOff className="h-4 w-4 mr-1" />
                          {t("masquer")}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            modererMutation.mutate(
                              { avisId: a.id, statut: nextModerationStatut(a.statut) },
                              { onSuccess: () => toast.success(t("toastModerated")), onError: (e) => toast.error(e.message) },
                            )
                          }
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          {t("publier")}
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
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={reponse}
              onChange={(e) => setReponse(e.target.value)}
              placeholder={t("replyPlaceholder")}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRepondreAvisId(null)}>
                {t("cancel")}
              </Button>
              <Button
                onClick={() => {
                  if (repondreAvisId && reponse.trim()) {
                    repondreMutation.mutate(
                      { avisId: repondreAvisId, reponse: reponse.trim() },
                      {
                        onSuccess: () => {
                          toast.success(t("toastReplied"));
                          setRepondreAvisId(null);
                          setReponse("");
                        },
                        onError: (error) => toast.error(error.message),
                      },
                    );
                  }
                }}
                disabled={!reponse.trim() || repondreMutation.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                {t("envoyer")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
