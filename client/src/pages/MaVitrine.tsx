import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  ExternalLink,
  Copy,
  Save,
  Star,
  MessageSquare,
  Eye,
  EyeOff,
  Send,
  Link2,
} from "lucide-react";
import { toast } from "sonner";

export default function MaVitrine() {
  const [formData, setFormData] = useState({
    vitrineActive: false,
    vitrineDescription: "",
    vitrineZone: "",
    vitrineServices: "",
    vitrineExperience: "",
    slug: "",
  });
  const [repondreAvisId, setRepondreAvisId] = useState<number | null>(null);
  const [reponse, setReponse] = useState("");
  const [demandeClientId, setDemandeClientId] = useState<string>("");
  const [showDemandeDialog, setShowDemandeDialog] = useState(false);

  const { data: parametres } = trpc.parametres.get.useQuery();
  const { data: artisan } = trpc.artisan.getProfile.useQuery();
  const { data: avis, refetch: refetchAvis } = trpc.avis.getAll.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();

  const updateMutation = trpc.parametres.update.useMutation({
    onSuccess: () => toast.success("Vitrine mise à jour"),
    onError: () => toast.error("Erreur lors de la sauvegarde"),
  });

  const updateProfileMutation = trpc.artisan.updateProfile.useMutation({
    onSuccess: () => toast.success("Slug mis à jour"),
    onError: (err) => toast.error(err.message),
  });

  const repondreMutation = trpc.avis.repondre.useMutation({
    onSuccess: () => {
      toast.success("Réponse envoyée");
      setRepondreAvisId(null);
      setReponse("");
      refetchAvis();
    },
    onError: (error) => toast.error(error.message),
  });

  const modererMutation = trpc.avis.moderer.useMutation({
    onSuccess: () => {
      toast.success("Avis modéré");
      refetchAvis();
    },
    onError: (error) => toast.error(error.message),
  });

  const envoyerDemandeMutation = trpc.avis.envoyerDemandeParClient.useMutation({
    onSuccess: () => {
      toast.success("Demande d'avis envoyée par email");
      setShowDemandeDialog(false);
      setDemandeClientId("");
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (parametres) {
      let services = "";
      if (parametres.vitrineServices) {
        try {
          services = JSON.parse(parametres.vitrineServices).join("\n");
        } catch {
          services = parametres.vitrineServices;
        }
      }
      setFormData((prev) => ({
        ...prev,
        vitrineActive: parametres.vitrineActive ?? false,
        vitrineDescription: parametres.vitrineDescription || "",
        vitrineZone: parametres.vitrineZone || "",
        vitrineServices: services,
        vitrineExperience: String(parametres.vitrineExperience || ""),
      }));
    }
  }, [parametres]);

  useEffect(() => {
    if (artisan?.slug) {
      setFormData((prev) => ({ ...prev, slug: artisan.slug || "" }));
    }
  }, [artisan]);

  const vitrineUrl = formData.slug
    ? `${window.location.origin}/vitrine/${formData.slug}`
    : "";

  const handleCopy = () => {
    if (vitrineUrl) {
      navigator.clipboard.writeText(vitrineUrl);
      toast.success("Lien copié !");
    }
  };

  const handleSave = () => {
    updateMutation.mutate({
      vitrineActive: formData.vitrineActive,
      vitrineDescription: formData.vitrineDescription,
      vitrineZone: formData.vitrineZone,
      vitrineServices: formData.vitrineServices,
      vitrineExperience: formData.vitrineExperience
        ? parseInt(formData.vitrineExperience)
        : undefined,
    });
    if (formData.slug && formData.slug !== (artisan?.slug || "")) {
      updateProfileMutation.mutate({ slug: formData.slug });
    }
  };

  const renderStars = (note: number) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= note
              ? "fill-yellow-400 text-yellow-400"
              : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );

  const formatDate = (date: Date | string) =>
    new Date(date).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe className="h-6 w-6" />
          Ma Vitrine
        </h1>
        <p className="text-muted-foreground">
          Gérez votre page publique et vos avis clients
        </p>
      </div>

      {/* Lien public + toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Lien public
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {vitrineUrl ? (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <a
                href={vitrineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-sm text-primary hover:underline truncate"
              >
                {vitrineUrl}
              </a>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={vitrineUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Voir ma vitrine
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Configurez un slug ci-dessous pour générer votre lien public.
            </p>
          )}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Vitrine active</Label>
              <p className="text-sm text-muted-foreground">
                Rendre votre page vitrine accessible au public
              </p>
            </div>
            <Switch
              checked={formData.vitrineActive}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, vitrineActive: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Formulaire personnalisation */}
      <Card>
        <CardHeader>
          <CardTitle>Personnalisation</CardTitle>
          <CardDescription>
            Personnalisez le contenu de votre page vitrine
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slug">URL de votre vitrine</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                /vitrine/
              </span>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) =>
                  setFormData({ ...formData, slug: e.target.value })
                }
                placeholder="mon-entreprise"
                className="max-w-xs"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vitrineDescription">
              Description de l'entreprise
            </Label>
            <Textarea
              id="vitrineDescription"
              value={formData.vitrineDescription}
              onChange={(e) =>
                setFormData({ ...formData, vitrineDescription: e.target.value })
              }
              placeholder="Décrivez votre entreprise, votre savoir-faire..."
              rows={4}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vitrineZone">Zone d'intervention</Label>
              <Input
                id="vitrineZone"
                value={formData.vitrineZone}
                onChange={(e) =>
                  setFormData({ ...formData, vitrineZone: e.target.value })
                }
                placeholder="Paris et Île-de-France"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vitrineExperience">Années d'expérience</Label>
              <Input
                id="vitrineExperience"
                type="number"
                value={formData.vitrineExperience}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    vitrineExperience: e.target.value,
                  })
                }
                placeholder="15"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vitrineServices">
              Services proposés (un par ligne)
            </Label>
            <Textarea
              id="vitrineServices"
              value={formData.vitrineServices}
              onChange={(e) =>
                setFormData({ ...formData, vitrineServices: e.target.value })
              }
              placeholder={
                "Installation plomberie\nDépannage urgent\nRénovation salle de bain"
              }
              rows={4}
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateMutation.isPending
                ? "Enregistrement..."
                : "Enregistrer"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Avis clients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Avis clients ({avis?.length || 0})
            </CardTitle>
            <CardDescription>
              Gérez les avis affichés sur votre vitrine
            </CardDescription>
          </div>
          <Button onClick={() => setShowDemandeDialog(true)}>
            <Send className="h-4 w-4 mr-2" />
            Demander un avis
          </Button>
        </CardHeader>
        <CardContent>
          {!avis?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucun avis pour le moment. Envoyez des demandes d'avis à vos
              clients.
            </div>
          ) : (
            <div className="space-y-4">
              {avis.map((a) => (
                <div key={a.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        {renderStars(a.note)}
                        {a.statut === "publie" ? (
                          <Badge className="bg-green-500">Publié</Badge>
                        ) : a.statut === "masque" ? (
                          <Badge variant="secondary">Masqué</Badge>
                        ) : (
                          <Badge className="bg-orange-500">En attente</Badge>
                        )}
                      </div>
                      <p className="font-medium">
                        {a.client?.nom || "Client"}
                      </p>
                      {a.commentaire && (
                        <p className="mt-1 text-sm">{a.commentaire}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(a.createdAt)}
                      </p>
                      {a.reponseArtisan && (
                        <div className="mt-3 p-3 bg-muted rounded-lg">
                          <p className="text-sm font-medium">
                            Votre réponse :
                          </p>
                          <p className="text-sm mt-1">{a.reponseArtisan}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4 shrink-0">
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
                            modererMutation.mutate({
                              avisId: a.id,
                              statut: "masque",
                            })
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
                            modererMutation.mutate({
                              avisId: a.id,
                              statut: "publie",
                            })
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

      {/* Dialog répondre */}
      <Dialog
        open={!!repondreAvisId}
        onOpenChange={() => setRepondreAvisId(null)}
      >
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
              <Button
                variant="outline"
                onClick={() => setRepondreAvisId(null)}
              >
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

      {/* Dialog demande d'avis */}
      <Dialog open={showDemandeDialog} onOpenChange={setShowDemandeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Envoyer une demande d'avis</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Choisir un client</Label>
              <Select
                value={demandeClientId}
                onValueChange={setDemandeClientId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un client" />
                </SelectTrigger>
                <SelectContent>
                  {clients
                    ?.filter((c) => c.email)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nom} ({c.email})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Un email avec un lien pour laisser un avis sera envoyé au
                client.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDemandeDialog(false)}
              >
                Annuler
              </Button>
              <Button
                onClick={() => {
                  if (demandeClientId) {
                    envoyerDemandeMutation.mutate({
                      clientId: parseInt(demandeClientId),
                    });
                  }
                }}
                disabled={
                  !demandeClientId || envoyerDemandeMutation.isPending
                }
              >
                <Send className="h-4 w-4 mr-2" />
                {envoyerDemandeMutation.isPending
                  ? "Envoi..."
                  : "Envoyer la demande"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
