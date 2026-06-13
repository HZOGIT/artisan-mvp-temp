import { useState, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, FileText, Bell, Save, Globe, ExternalLink, Palette, Upload, Trash2, Image, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { AbonnementSection } from "@/components/AbonnementSection";

export default function Parametres() {
  const [formData, setFormData] = useState({
    prefixeDevis: "DEV-",
    prefixeFacture: "FAC-",
    mentionsLegalesDevis: "",
    mentionsLegalesFacture: "",
    conditionsPaiementDefaut: "Paiement à 30 jours",
    delaiPaiementJours: "",
    delaiPaiementType: "net",
    delaiValiditeDevis: "30",
    notificationsEmail: true,
    vitrineActive: false,
    vitrineDescription: "",
    vitrineZone: "",
    vitrineServices: "",
    vitrineExperience: "",
    slug: "",
    couleurPrincipale: "#4F46E5",
    couleurSecondaire: "#6366F1",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: parametres, isLoading } = trpc.parametres.get.useQuery();
  const { data: artisan, refetch: refetchArtisan } = trpc.artisan.getProfile.useQuery();

  // OPE-156 — flux iCal (abonnement agenda externe aux interventions).
  const { data: icalFeed, refetch: refetchIcal } = trpc.calendrier.getIcalFeed.useQuery();
  const icalUrl = icalFeed?.path ? `${window.location.origin}${icalFeed.path}` : "";
  const regenIcal = trpc.calendrier.regenerateIcalFeed.useMutation({
    onSuccess: () => { refetchIcal(); toast.success("Lien d'abonnement régénéré (l'ancien est révoqué)"); },
    onError: () => toast.error("Impossible de régénérer le lien"),
  });

  // OPE-172 — demandes de contact (leads) de la vitrine.
  const { data: demandesContact, refetch: refetchDemandes } = trpc.vitrine.getDemandesContact.useQuery();
  const updateDemandeStatut = trpc.vitrine.updateDemandeContactStatut.useMutation({
    onSuccess: () => { refetchDemandes(); },
    onError: (e) => toast.error(e.message),
  });
  const convertirDemande = trpc.vitrine.convertirDemandeEnClient.useMutation({
    onSuccess: () => { refetchDemandes(); toast.success("Lead converti en client"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.parametres.update.useMutation({
    onSuccess: () => {
      toast.success("Paramètres enregistrés avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de l'enregistrement des paramètres");
    },
  });

  const updateProfileMutation = trpc.artisan.updateProfile.useMutation({
    onError: (err) => {
      toast.error(err.message || "Erreur lors de la mise à jour du slug");
    },
  });

  useEffect(() => {
    if (parametres) {
      let services = "";
      if (parametres.vitrineServices) {
        try { services = JSON.parse(parametres.vitrineServices).join("\n"); } catch { services = parametres.vitrineServices; }
      }
      setFormData((prev) => ({
        ...prev,
        prefixeDevis: parametres.prefixeDevis || "DEV-",
        prefixeFacture: parametres.prefixeFacture || "FAC-",
        mentionsLegalesDevis: parametres.mentionsLegales || "",
        mentionsLegalesFacture: parametres.conditionsGenerales || "",
        conditionsPaiementDefaut: parametres.conditionsPaiementDefaut || "Paiement à 30 jours",
        delaiPaiementJours: parametres.delaiPaiementJours != null ? String(parametres.delaiPaiementJours) : "",
        delaiPaiementType: parametres.delaiPaiementType || "net",
        delaiValiditeDevis: String(parametres.rappelDevisJours || 30),
        notificationsEmail: parametres.notificationsEmail ?? true,
        vitrineActive: parametres.vitrineActive ?? false,
        vitrineDescription: parametres.vitrineDescription || "",
        vitrineZone: parametres.vitrineZone || "",
        vitrineServices: services,
        vitrineExperience: String(parametres.vitrineExperience || ""),
        couleurPrincipale: parametres.couleurPrincipale || "#4F46E5",
        couleurSecondaire: parametres.couleurSecondaire || "#6366F1",
      }));
    }
  }, [parametres]);

  useEffect(() => {
    if (artisan) {
      if (artisan.slug) setFormData((prev) => ({ ...prev, slug: artisan.slug || "" }));
      setLogoPreview(artisan.logo || null);
    }
  }, [artisan]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      prefixeDevis: formData.prefixeDevis,
      prefixeFacture: formData.prefixeFacture,
      mentionsLegales: formData.mentionsLegalesDevis,
      conditionsGenerales: formData.mentionsLegalesFacture,
      conditionsPaiementDefaut: formData.conditionsPaiementDefaut,
      delaiPaiementJours: formData.delaiPaiementJours.trim() === "" ? null : (parseInt(formData.delaiPaiementJours) || 0),
      delaiPaiementType: formData.delaiPaiementType as "net" | "fin_de_mois",
      notificationsEmail: formData.notificationsEmail,
      rappelDevisJours: parseInt(formData.delaiValiditeDevis) || 30,
      vitrineActive: formData.vitrineActive,
      vitrineDescription: formData.vitrineDescription,
      vitrineZone: formData.vitrineZone,
      vitrineServices: formData.vitrineServices,
      vitrineExperience: formData.vitrineExperience ? parseInt(formData.vitrineExperience) : undefined,
      couleurPrincipale: formData.couleurPrincipale,
      couleurSecondaire: formData.couleurSecondaire,
    });
    if (formData.slug && formData.slug !== (artisan?.slug || "")) {
      updateProfileMutation.mutate({ slug: formData.slug });
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 2 MB)");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const resp = await fetch("/api/upload-logo", { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) {
        const msg = data.detail ? `${data.error}: ${data.detail}` : (data.error || "Erreur upload");
        throw new Error(msg);
      }
      setLogoPreview(data.logoUrl);
      refetchArtisan();
      toast.success("Logo téléchargé");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteLogo = async () => {
    try {
      const resp = await fetch("/api/upload-logo", { method: "DELETE" });
      if (!resp.ok) throw new Error("Erreur suppression");
      setLogoPreview(null);
      refetchArtisan();
      toast.success("Logo supprimé");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Lecture du tab actif depuis l'URL (?tab=abonnement pour deep link
  // depuis le banner ou le webhook de checkout success).
  // IMPORTANT : ces hooks (useSearch/useLocation/useState/useEffect) doivent
  // rester AVANT tout `return` conditionnel (ex. isLoading) — sinon le nombre
  // de hooks varie entre les rendus → React error #310 (Rules of Hooks).
  const search = useSearch();
  const [, navigate] = useLocation();
  const initialTab = new URLSearchParams(search).get("tab") === "abonnement" ? "abonnement" : "general";
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Toast post-checkout : Stripe ramene sur ?success=1 ou ?canceled=1.
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("success") === "1") {
      toast.success("Abonnement actif. Bienvenue !");
      // On enleve le query param de l'URL pour ne pas re-afficher au refresh.
      navigate("/parametres?tab=abonnement", { replace: true });
    } else if (params.get("canceled") === "1") {
      toast("Paiement annule, vous pouvez reessayer quand vous voulez.");
      navigate("/parametres?tab=abonnement", { replace: true });
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Paramètres</h1>
        <p className="text-muted-foreground mt-1">
          Configurez les paramètres de votre application
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general" className="gap-2">
            <Settings className="h-4 w-4" />
            Général
          </TabsTrigger>
          <TabsTrigger value="abonnement" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Abonnement
          </TabsTrigger>
        </TabsList>

        <TabsContent value="abonnement" className="mt-6">
          <AbonnementSection />
        </TabsContent>

        <TabsContent value="general" className="mt-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personnalisation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Personnalisation
            </CardTitle>
            <CardDescription>
              Logo, couleurs et identité visuelle
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Logo upload */}
            <div className="space-y-2">
              <Label>Logo de l'entreprise</Label>
              <div className="flex items-start gap-4">
                <div
                  className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors overflow-hidden"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                  ) : (
                    <div className="text-center">
                      <Image className="h-8 w-8 mx-auto text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Cliquer</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Upload className="h-4 w-4 mr-1.5" />
                    {uploading ? "Envoi..." : "Changer le logo"}
                  </Button>
                  {logoPreview && (
                    <Button type="button" variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={handleDeleteLogo}>
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Supprimer
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">PNG, JPG, WebP ou SVG. Max 2 MB.</p>
                </div>
              </div>
            </div>

            {/* Colors */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="couleurPrincipale">Couleur principale</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="couleurPrincipale"
                    value={formData.couleurPrincipale}
                    onChange={(e) => setFormData({ ...formData, couleurPrincipale: e.target.value })}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={formData.couleurPrincipale}
                    onChange={(e) => setFormData({ ...formData, couleurPrincipale: e.target.value })}
                    className="max-w-[120px] font-mono text-sm"
                    placeholder="#4F46E5"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="couleurSecondaire">Couleur secondaire</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="couleurSecondaire"
                    value={formData.couleurSecondaire}
                    onChange={(e) => setFormData({ ...formData, couleurSecondaire: e.target.value })}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={formData.couleurSecondaire}
                    onChange={(e) => setFormData({ ...formData, couleurSecondaire: e.target.value })}
                    className="max-w-[120px] font-mono text-sm"
                    placeholder="#6366F1"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Numérotation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Numérotation des documents
            </CardTitle>
            <CardDescription>
              Définissez les préfixes pour vos devis et factures
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prefixeDevis">Préfixe des devis</Label>
                <Input
                  id="prefixeDevis"
                  value={formData.prefixeDevis}
                  onChange={(e) => setFormData({ ...formData, prefixeDevis: e.target.value })}
                  placeholder="DEV-"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prefixeFacture">Préfixe des factures</Label>
                <Input
                  id="prefixeFacture"
                  value={formData.prefixeFacture}
                  onChange={(e) => setFormData({ ...formData, prefixeFacture: e.target.value })}
                  placeholder="FAC-"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delaiValiditeDevis">Délai de validité des devis (jours)</Label>
              <Input
                id="delaiValiditeDevis"
                type="number"
                value={formData.delaiValiditeDevis}
                onChange={(e) => setFormData({ ...formData, delaiValiditeDevis: e.target.value })}
                className="max-w-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Mentions légales */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Mentions légales et CGV
            </CardTitle>
            <CardDescription>
              Textes qui apparaîtront sur vos documents PDF
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="conditionsPaiementDefaut">Conditions de paiement par défaut</Label>
              <Input
                id="conditionsPaiementDefaut"
                value={formData.conditionsPaiementDefaut}
                onChange={(e) => setFormData({ ...formData, conditionsPaiementDefaut: e.target.value })}
                placeholder="Paiement à 30 jours"
              />
            </div>
            {/* OPE-94 — délai de paiement structuré : calcule l'échéance des factures */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="delaiPaiementJours">Délai de paiement (jours)</Label>
                <Input
                  id="delaiPaiementJours"
                  type="number"
                  min={0}
                  max={365}
                  value={formData.delaiPaiementJours}
                  onChange={(e) => setFormData({ ...formData, delaiPaiementJours: e.target.value })}
                  placeholder="Ex : 30 (vide = pas d'échéance auto)"
                />
                <p className="text-xs text-muted-foreground">Calcule automatiquement la date d'échéance des nouvelles factures.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delaiPaiementType">Type de délai</Label>
                <select
                  id="delaiPaiementType"
                  value={formData.delaiPaiementType}
                  onChange={(e) => setFormData({ ...formData, delaiPaiementType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="net">Net (date + N jours)</option>
                  <option value="fin_de_mois">N jours fin de mois</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mentionsLegalesDevis">Mentions légales</Label>
              <Textarea
                id="mentionsLegalesDevis"
                value={formData.mentionsLegalesDevis}
                onChange={(e) => setFormData({ ...formData, mentionsLegalesDevis: e.target.value })}
                placeholder="Mentions légales à afficher en bas de page des PDF..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">Apparaissent en footer des PDF devis et factures.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mentionsLegalesFacture">Conditions Générales de Vente (CGV)</Label>
              <Textarea
                id="mentionsLegalesFacture"
                value={formData.mentionsLegalesFacture}
                onChange={(e) => setFormData({ ...formData, mentionsLegalesFacture: e.target.value })}
                placeholder="Conditions générales de vente..."
                rows={6}
              />
              <p className="text-xs text-muted-foreground">Si renseignées, ajoutées en page 2 des PDF devis.</p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notifications par email</Label>
                <p className="text-sm text-muted-foreground">
                  Recevoir des notifications par email pour les événements importants
                </p>
              </div>
              <Switch
                checked={formData.notificationsEmail}
                onCheckedChange={(checked) => setFormData({ ...formData, notificationsEmail: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Vitrine publique */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Ma page vitrine
            </CardTitle>
            <CardDescription>
              Configurez votre page publique partageable avec vos clients
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Vitrine active</Label>
                <p className="text-sm text-muted-foreground">
                  Rendre votre page vitrine accessible au public
                </p>
              </div>
              <Switch
                checked={formData.vitrineActive}
                onCheckedChange={(checked) => setFormData({ ...formData, vitrineActive: checked })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">URL de votre vitrine</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">/vitrine/</span>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="mon-entreprise"
                  className="max-w-xs"
                />
              </div>
              {formData.slug && (
                <a
                  href={`/vitrine/${formData.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Voir ma vitrine
                </a>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="vitrineDescription">Description de l'entreprise</Label>
              <Textarea
                id="vitrineDescription"
                value={formData.vitrineDescription}
                onChange={(e) => setFormData({ ...formData, vitrineDescription: e.target.value })}
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
                  onChange={(e) => setFormData({ ...formData, vitrineZone: e.target.value })}
                  placeholder="Paris et Île-de-France"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vitrineExperience">Années d'expérience</Label>
                <Input
                  id="vitrineExperience"
                  type="number"
                  value={formData.vitrineExperience}
                  onChange={(e) => setFormData({ ...formData, vitrineExperience: e.target.value })}
                  placeholder="15"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vitrineServices">Services proposés (un par ligne)</Label>
              <Textarea
                id="vitrineServices"
                value={formData.vitrineServices}
                onChange={(e) => setFormData({ ...formData, vitrineServices: e.target.value })}
                placeholder={"Installation plomberie\nDépannage urgent\nRénovation salle de bain"}
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Enregistrement..." : "Enregistrer les paramètres"}
          </Button>
        </div>
      </form>

      {/* OPE-156 — Synchronisation calendrier (iCal) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Synchroniser mon agenda</CardTitle>
          <CardDescription>
            Abonnez votre agenda (Google Agenda, Apple Calendrier, Outlook) à vos interventions
            Operioz. Le lien est secret — ne le partagez pas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input readOnly value={icalUrl} placeholder="Génération du lien…" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              disabled={!icalUrl}
              onClick={() => { if (icalUrl) { navigator.clipboard?.writeText(icalUrl); toast.success("Lien copié"); } }}
            >
              Copier
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Dans votre agenda : « Ajouter un calendrier » → « À partir d'une URL » → collez ce lien.
            Les interventions s'y mettent à jour automatiquement.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={regenIcal.isPending}
            onClick={() => regenIcal.mutate()}
          >
            Régénérer le lien (révoque l'ancien)
          </Button>
        </CardContent>
      </Card>

      {/* OPE-172 — Demandes de contact (leads vitrine) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Demandes de contact</CardTitle>
          <CardDescription>
            Les messages reçus via votre page vitrine. Suivez-les (nouveau → contacté → converti/perdu)
            pour ne perdre aucun prospect.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(!demandesContact || demandesContact.length === 0) ? (
            <p className="text-sm text-muted-foreground">Aucune demande pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {demandesContact.map((d: any) => (
                <div key={d.id} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-0.5">
                      <p className="font-medium">
                        {d.nom}
                        <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          d.statut === "converti" ? "bg-green-100 text-green-700"
                          : d.statut === "perdu" ? "bg-gray-200 text-gray-600"
                          : d.statut === "contacte" ? "bg-amber-100 text-amber-800"
                          : "bg-blue-100 text-blue-700"}`}>
                          {d.statut}
                        </span>
                      </p>
                      {d.email && <p className="text-xs text-muted-foreground">{d.email}</p>}
                      {d.telephone && <p className="text-xs text-muted-foreground">{d.telephone}</p>}
                      {d.message && <p className="text-sm mt-1 whitespace-pre-wrap">{d.message}</p>}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {d.statut !== "converti" && (
                        <Button type="button" size="sm" variant="outline" disabled={convertirDemande.isPending}
                          onClick={() => convertirDemande.mutate({ id: d.id })}>
                          Convertir en client
                        </Button>
                      )}
                      {d.statut === "nouveau" && (
                        <Button type="button" size="sm" variant="ghost"
                          onClick={() => updateDemandeStatut.mutate({ id: d.id, statut: "contacte" })}>
                          Marquer contacté
                        </Button>
                      )}
                      {d.statut !== "perdu" && d.statut !== "converti" && (
                        <Button type="button" size="sm" variant="ghost" className="text-muted-foreground"
                          onClick={() => updateDemandeStatut.mutate({ id: d.id, statut: "perdu" })}>
                          Marquer perdu
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
