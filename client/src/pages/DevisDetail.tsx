import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Trash2, FileText, User, Receipt, Download, Mail, Copy, Pen, Layers, Star, Check, ArrowRight, Bell, Circle, AlarmClock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateDevisPDF } from "@/lib/pdfGenerator";
import { fr } from "date-fns/locale";

const statusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé",
  expire: "Expiré",
};

const statusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  envoye: "bg-blue-100 text-blue-700",
  accepte: "bg-green-100 text-green-700",
  refuse: "bg-red-100 text-red-700",
  expire: "bg-orange-100 text-orange-700",
};

export default function DevisDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [isAddLineDialogOpen, setIsAddLineDialogOpen] = useState(false);
  const [lineFormData, setLineFormData] = useState({
    reference: "",
    designation: "",
    description: "",
    quantite: "1",
    unite: "unité",
    prixUnitaireHT: "",
    tauxTVA: "20.00",
  });

  const utils = trpc.useUtils();
  const { data: devis, isLoading } = trpc.devis.getById.useQuery(
    { id: parseInt(id || "0") },
    { enabled: !!id }
  );
  const { data: articles } = trpc.articles.getBibliotheque.useQuery();
  const { data: artisan } = trpc.artisan.getProfile.useQuery();
  const { data: parametresData } = trpc.parametres.get.useQuery();

  // OPE-121 — rappels/activités CRM rattachés à CE devis (relance signature).
  const devisIdNum = parseInt(id || "0");
  const { data: allActivitesDv, refetch: refetchActivitesDv } = trpc.activites.list.useQuery();
  const activitesDevis = (allActivitesDv || []).filter(
    (a: any) => a.entiteType === "devis" && a.entiteId === devisIdNum,
  );
  const [rappelTitre, setRappelTitre] = useState("");
  const [rappelEcheance, setRappelEcheance] = useState("");
  const [rappelType, setRappelType] = useState("relance");
  const createRappel = trpc.activites.create.useMutation({
    onSuccess: () => {
      toast.success("Rappel ajouté");
      setRappelTitre(""); setRappelEcheance(""); setRappelType("relance");
      refetchActivitesDv();
    },
    onError: (e) => toast.error(e.message),
  });
  const toggleRappel = trpc.activites.toggleFait.useMutation({
    onSuccess: () => refetchActivitesDv(),
    onError: (e) => toast.error(e.message),
  });
  const deleteRappel = trpc.activites.delete.useMutation({
    onSuccess: () => refetchActivitesDv(),
    onError: (e) => toast.error(e.message),
  });
  const rappelTypeLabels: Record<string, string> = {
    appel: "Appel", email: "Email", rdv: "RDV", relance: "Relance", autre: "À faire",
  };
  const { data: signatureData } = trpc.signature.getSignatureByDevis.useQuery(
    { devisId: parseInt(id || "0") },
    { enabled: !!id }
  );

  const updateMutation = trpc.devis.update.useMutation({
    onSuccess: () => {
      utils.devis.getById.invalidate({ id: parseInt(id || "0") });
      toast.success("Devis mis à jour");
    },
  });

  const addLineMutation = trpc.devis.addLigne.useMutation({
    onSuccess: () => {
      utils.devis.getById.invalidate({ id: parseInt(id || "0") });
      setIsAddLineDialogOpen(false);
      resetLineForm();
      toast.success("Ligne ajoutée");
    },
  });

  const deleteLineMutation = trpc.devis.deleteLigne.useMutation({
    onSuccess: () => {
      utils.devis.getById.invalidate({ id: parseInt(id || "0") });
      toast.success("Ligne supprimée");
    },
  });

  const convertToFactureMutation = trpc.devis.convertToFacture.useMutation({
    onSuccess: (data) => {
      toast.success("Facture créée avec succès");
      setLocation(`/factures/${data.id}`);
    },
    onError: () => {
      toast.error("Erreur lors de la création de la facture");
    },
  });

  const sendByEmailMutation = trpc.devis.sendByEmail.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
        utils.devis.getById.invalidate({ id: parseInt(id || "0") });
        setIsEmailDialogOpen(false);
        setEmailMessage("");
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Erreur lors de l'envoi de l'email");
    },
  });

  const duplicateMutation = trpc.devis.duplicate.useMutation({
    onSuccess: (newDevis) => {
      toast.success("Devis dupliqué avec succès");
      setLocation(`/devis/${newDevis.id}`);
    },
    onError: () => {
      toast.error("Erreur lors de la duplication du devis");
    },
  });

  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [isSignatureDialogOpen, setIsSignatureDialogOpen] = useState(false);

  // === Variantes (devis_options) ===
  const [isNewVarianteOpen, setIsNewVarianteOpen] = useState(false);
  const [newVarianteForm, setNewVarianteForm] = useState({
    nom: "",
    description: "",
    recommandee: false,
  });

  const { data: variantes, refetch: refetchVariantes } = trpc.devisOptions.getByDevisId.useQuery(
    { devisId: parseInt(id || "0") },
    { enabled: !!id }
  );

  const createVarianteMutation = trpc.devisOptions.create.useMutation({
    onSuccess: () => {
      refetchVariantes();
      setIsNewVarianteOpen(false);
      setNewVarianteForm({ nom: "", description: "", recommandee: false });
      toast.success("Variante créée");
    },
    onError: (e) => toast.error(e.message || "Erreur création variante"),
  });

  const selectVarianteMutation = trpc.devisOptions.select.useMutation({
    onSuccess: () => {
      refetchVariantes();
      toast.success("Variante sélectionnée");
    },
  });

  const deleteVarianteMutation = trpc.devisOptions.delete.useMutation({
    onSuccess: () => {
      refetchVariantes();
      toast.success("Variante supprimée");
    },
  });

  const convertirVarianteMutation = trpc.devisOptions.convertirEnDevis.useMutation({
    onSuccess: () => {
      utils.devis.getById.invalidate({ id: parseInt(id || "0") });
      refetchVariantes();
      toast.success("Variante convertie en lignes officielles du devis");
    },
    onError: (e) => toast.error(e.message || "Erreur conversion"),
  });

  const requestSignatureMutation = trpc.signature.createSignatureLink.useMutation({
    onSuccess: () => {
      toast.success("Lien de signature créé et envoyé au client");
      setIsSignatureDialogOpen(false);
      utils.devis.getById.invalidate({ id: parseInt(id || "0") });
    },
    onError: (err) => {
      toast.error(err.message || "Erreur lors de la création du lien de signature");
    },
  });

  const resetLineForm = () => {
    setLineFormData({
      reference: "",
      designation: "",
      description: "",
      quantite: "1",
      unite: "unité",
      prixUnitaireHT: "",
      tauxTVA: "20.00",
    });
  };

  const handleAddLine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lineFormData.designation || !lineFormData.prixUnitaireHT) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }
    addLineMutation.mutate({
      devisId: parseInt(id || "0"),
      ...lineFormData,
    });
  };

  const handleDeleteLine = (lineId: number) => {
    if (confirm("Supprimer cette ligne ?")) {
      deleteLineMutation.mutate({ id: lineId, devisId: parseInt(id || "0") });
    }
  };

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate({ id: parseInt(id || "0"), statut: newStatus as any });
  };

  const handleConvertToFacture = () => {
    if (confirm("Convertir ce devis en facture ?")) {
      convertToFactureMutation.mutate({ devisId: parseInt(id || "0") });
    }
  };

  const handleSendByEmail = () => {
    if (!devis?.client?.email) {
      toast.error("Ce client n'a pas d'adresse email");
      return;
    }
    sendByEmailMutation.mutate({
      devisId: parseInt(id || "0"),
      customMessage: emailMessage || undefined,
      attachPdf,
    });
  };

  const handleDuplicate = () => {
    if (confirm("Dupliquer ce devis ?")) {
      duplicateMutation.mutate({ devisId: parseInt(id || "0") });
    }
  };

  const handleExportPDF = () => {
    if (!devis || !devis.client) {
      toast.error("Impossible de générer le PDF");
      return;
    }
    const artisanData = artisan || {};
    const lignes = (devis.lignes || []).map((l: any) => ({
      designation: l.designation,
      description: l.description,
      quantite: parseFloat(l.quantite) || 1,
      unite: l.unite,
      prixUnitaire: parseFloat(l.prixUnitaireHT) || 0,
      tauxTva: parseFloat(l.tauxTVA) || 20,
    }));
    generateDevisPDF(
      artisanData,
      devis.client,
      {
        numero: devis.numero,
        dateCreation: devis.createdAt,
        dateValidite: devis.dateValidite,
        statut: devis.statut || "brouillon",
        objet: devis.objet,
        referenceClient: (devis as any).referenceClient,
        lignes,
        totalHT: parseFloat(devis.totalHT as any) || 0,
        totalTVA: parseFloat(devis.totalTVA as any) || 0,
        totalTTC: parseFloat(devis.totalTTC as any) || 0,
        conditions: (devis as any).conditionsPaiement || null,
      },
      {
        mentionsLegales: parametresData?.mentionsLegales || null,
        cgv: parametresData?.conditionsGenerales || null,
      }
    );
    toast.success("PDF généré avec succès");
  };

  const handleSelectArticle = (articleId: string) => {
    const article = articles?.find((a: any) => a.id === parseInt(articleId));
    if (article) {
      setLineFormData({
        ...lineFormData,
        reference: article.reference || "",
        designation: article.designation,
        description: article.description || "",
        unite: article.unite || "unité",
        prixUnitaireHT: String(article.prixUnitaireHT),
        // OPE-142/167 : pré-remplir le taux de TVA porté par l'article (articles_artisan
        // ou bibliothèque). Fallback sur la valeur courante si l'article n'en porte pas.
        tauxTVA: article.tauxTVA != null && article.tauxTVA !== "" ? String(parseFloat(article.tauxTVA)) : lineFormData.tauxTVA,
      });
    }
  };

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!devis) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-foreground">Devis non trouvé</h2>
        <Button variant="link" onClick={() => setLocation("/devis")}>
          Retour à la liste
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/devis")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{devis.numero}</h1>
              <Badge className={statusColors[devis.statut || 'brouillon'] || "bg-gray-100"}>
                {statusLabels[devis.statut || 'brouillon'] || devis.statut}
              </Badge>
            </div>
            <p className="text-muted-foreground">{devis.objet || "Devis"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={devis.statut || 'brouillon'} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="brouillon">Brouillon</SelectItem>
              <SelectItem value="envoye">Envoyé</SelectItem>
              <SelectItem value="accepte">Accepté</SelectItem>
              <SelectItem value="refuse">Refusé</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!devis.client?.email}>
                <Mail className="h-4 w-4 mr-2" />
                Envoyer par email
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Envoyer le devis par email</DialogTitle>
                <DialogDescription>
                  Le devis sera envoyé à {devis.client?.email}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Message personnalisé (optionnel)</Label>
                  <Textarea
                    placeholder="Ajoutez un message personnalisé qui sera inclus dans l'email..."
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    rows={4}
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attachPdf}
                    onChange={(e) => setAttachPdf(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Joindre le devis en PDF</span>
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handleSendByEmail} disabled={sendByEmailMutation.isPending}>
                  {sendByEmailMutation.isPending ? "Envoi en cours..." : "Envoyer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={handleDuplicate} disabled={duplicateMutation.isPending}>
            <Copy className="h-4 w-4 mr-2" />
            Dupliquer
          </Button>
          {(devis.statut === "brouillon" || devis.statut === "envoye") && devis.client?.email && !signatureData && (
            <Dialog open={isSignatureDialogOpen} onOpenChange={setIsSignatureDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Pen className="h-4 w-4 mr-2" />
                  Envoyer au client
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Envoyer le devis pour signature</DialogTitle>
                  <DialogDescription>
                    Un email avec un lien de signature sera envoyé à {devis.client?.email}. Le client pourra consulter le devis et le signer (ou refuser) en ligne.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <p className="text-sm text-muted-foreground">
                    Le lien est valide 30 jours. Le statut du devis sera mis à jour automatiquement.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsSignatureDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button
                    onClick={() => requestSignatureMutation.mutate({ devisId: parseInt(id || "0") })}
                    disabled={requestSignatureMutation.isPending}
                  >
                    {requestSignatureMutation.isPending ? "Envoi en cours..." : "Envoyer au client"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {(devis.statut === "accepte" || devis.statut === "envoye") && (
            <Button onClick={handleConvertToFacture} disabled={convertToFactureMutation.isPending}>
              <Receipt className="h-4 w-4 mr-2" />
              Convertir en facture
            </Button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4" />
              Client
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{devis.client?.nom} {devis.client?.prenom}</p>
            {devis.client?.email && <p className="text-sm text-muted-foreground">{devis.client.email}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{format(new Date(devis.createdAt), "dd MMMM yyyy", { locale: fr })}</p>
            {devis.dateValidite && (
              <p className="text-sm text-muted-foreground">
                Valide jusqu'au {format(new Date(devis.dateValidite), "dd/MM/yyyy", { locale: fr })}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total TTC</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{formatCurrency(devis.totalTTC)}</p>
            <p className="text-sm text-muted-foreground">HT: {formatCurrency(devis.totalHT)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Signature Status */}
      {signatureData && (
        <Card className={
          signatureData.statut === 'accepte' ? 'border-green-300 bg-green-50' :
          signatureData.statut === 'refuse' ? 'border-red-300 bg-red-50' :
          'border-blue-300 bg-blue-50'
        }>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Pen className="h-5 w-5" />
                <div>
                  <p className="font-medium">
                    {signatureData.statut === 'accepte' && `Devis accepté et signé par ${signatureData.signataireName}`}
                    {signatureData.statut === 'refuse' && `Devis refusé${signatureData.motifRefus ? ` — ${signatureData.motifRefus}` : ''}`}
                    {signatureData.statut === 'en_attente' && 'Signature en attente du client'}
                  </p>
                  {signatureData.signedAt && (
                    <p className="text-sm text-muted-foreground">
                      Le {format(new Date(signatureData.signedAt), "dd/MM/yyyy 'à' HH:mm", { locale: fr })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = `${window.location.origin}/devis-public/${signatureData.token}`;
                    navigator.clipboard.writeText(url);
                    toast.success("Lien copié dans le presse-papier");
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copier le lien
                </Button>
                {signatureData.statut === 'accepte' && signatureData.signatureData && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Pen className="h-4 w-4 mr-1" />
                        Voir la signature
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Signature de {signatureData.signataireName}</DialogTitle>
                      </DialogHeader>
                      <div className="border rounded-lg p-4 bg-white">
                        <img src={signatureData.signatureData} alt="Signature" className="w-full" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        IP: {signatureData.ipAddress} | Signe le {signatureData.signedAt ? format(new Date(signatureData.signedAt), "dd/MM/yyyy HH:mm", { locale: fr }) : ''}
                      </p>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Onglets Lignes / Variantes */}
      <Tabs defaultValue="lignes" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="lignes" className="min-h-[44px] sm:min-h-0">
            <FileText className="h-4 w-4 mr-2" />
            Lignes ({devis.lignes?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="variantes" className="min-h-[44px] sm:min-h-0">
            <Layers className="h-4 w-4 mr-2" />
            Variantes ({variantes?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lignes" className="mt-4">

      {/* Lines */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lignes du devis</CardTitle>
            <Button size="sm" onClick={() => setLocation(`/devis/${id}/ligne/nouvelle`)}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter une ligne
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {devis.lignes && devis.lignes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Désignation</th>
                    <th className="text-right">Qté</th>
                    <th className="text-right">Prix HT</th>
                    <th className="text-right">TVA</th>
                    <th className="text-right">Total TTC</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {devis.lignes.map((ligne: any) => (
                    <tr key={ligne.id}>
                      <td>{ligne.reference || "-"}</td>
                      <td>{ligne.designation}</td>
                      <td className="text-right">{ligne.quantite} {ligne.unite}</td>
                      <td className="text-right">{formatCurrency(ligne.prixUnitaireHT)}</td>
                      <td className="text-right">{ligne.tauxTVA}%</td>
                      <td className="text-right font-medium">{formatCurrency(ligne.montantTTC)}</td>
                      <td>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDeleteLine(ligne.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2">
                    <td colSpan={5} className="text-right font-medium">Total HT</td>
                    <td className="text-right font-medium">{formatCurrency(devis.totalHT)}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="text-right font-medium">TVA</td>
                    <td className="text-right font-medium">{formatCurrency(devis.totalTVA)}</td>
                    <td></td>
                  </tr>
                  <tr className="bg-muted/50">
                    <td colSpan={5} className="text-right font-bold">Total TTC</td>
                    <td className="text-right font-bold text-primary">{formatCurrency(devis.totalTTC)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Aucune ligne dans ce devis</p>
              <Button variant="link" onClick={() => setLocation(`/devis/${id}/ligne/nouvelle`)}>
                Ajouter une ligne
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

        </TabsContent>

        {/* ============================== */}
        {/* Onglet VARIANTES               */}
        {/* ============================== */}
        <TabsContent value="variantes" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-blue-600" />
                    Variantes de ce devis
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Proposez plusieurs options tarifaires à votre client (Standard, Premium, Éco…)
                  </p>
                </div>
                <Button onClick={() => setIsNewVarianteOpen(true)} className="min-h-[44px] sm:min-h-0">
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter une variante
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!variantes || variantes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Layers className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p>Aucune variante pour ce devis.</p>
                  <p className="text-xs mt-1">
                    Créez 2 ou 3 options chiffrées différemment pour laisser le choix au client.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {variantes.map((v: any) => (
                    <Card
                      key={v.id}
                      className={
                        v.selectionnee
                          ? "border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/10"
                          : v.recommandee
                          ? "border-amber-300"
                          : ""
                      }
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">{v.nom}</CardTitle>
                          <div className="flex gap-1 flex-shrink-0">
                            {v.recommandee && (
                              <Badge className="bg-amber-100 text-amber-800 border border-amber-300">
                                <Star className="h-3 w-3 mr-0.5" /> Reco.
                              </Badge>
                            )}
                            {v.selectionnee && (
                              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <Check className="h-3 w-3 mr-0.5" /> Choisie
                              </Badge>
                            )}
                          </div>
                        </div>
                        {v.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {v.description}
                          </p>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-2xl font-bold text-primary">
                          {formatCurrency(v.totalTTC)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          HT&nbsp;: {formatCurrency(v.totalHT)} · TVA&nbsp;: {formatCurrency(v.totalTVA)}
                        </div>
                        <div className="flex flex-wrap gap-1 pt-2">
                          {!v.selectionnee && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => selectVarianteMutation.mutate({ optionId: v.id })}
                              disabled={selectVarianteMutation.isPending}
                            >
                              <Check className="h-3 w-3 mr-1" /> Sélectionner
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Convertir "${v.nom}" en lignes officielles du devis ? Les lignes actuelles seront remplacées.`)) {
                                convertirVarianteMutation.mutate({ optionId: v.id });
                              }
                            }}
                            disabled={convertirVarianteMutation.isPending}
                          >
                            <ArrowRight className="h-3 w-3 mr-1" /> Convertir
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              if (confirm(`Supprimer la variante "${v.nom}" ?`)) {
                                deleteVarianteMutation.mutate({ id: v.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dialog : nouvelle variante */}
          <Dialog open={isNewVarianteOpen} onOpenChange={setIsNewVarianteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouvelle variante</DialogTitle>
                <DialogDescription>
                  Donnez-lui un nom (ex&nbsp;: <em>Option Premium</em>) puis ajoutez ses lignes ensuite.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label htmlFor="variante-nom">Nom *</Label>
                  <Input
                    id="variante-nom"
                    value={newVarianteForm.nom}
                    onChange={(e) => setNewVarianteForm({ ...newVarianteForm, nom: e.target.value })}
                    placeholder="Option Standard / Premium / Éco"
                  />
                </div>
                <div>
                  <Label htmlFor="variante-description">Description (optionnel)</Label>
                  <Textarea
                    id="variante-description"
                    rows={2}
                    value={newVarianteForm.description}
                    onChange={(e) => setNewVarianteForm({ ...newVarianteForm, description: e.target.value })}
                    placeholder="Quels matériaux, quel niveau de finition…"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newVarianteForm.recommandee}
                    onChange={(e) => setNewVarianteForm({ ...newVarianteForm, recommandee: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Marquer comme recommandée
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewVarianteOpen(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={() => {
                    if (!newVarianteForm.nom.trim()) {
                      toast.error("Le nom est obligatoire");
                      return;
                    }
                    createVarianteMutation.mutate({
                      devisId: parseInt(id || "0"),
                      nom: newVarianteForm.nom,
                      description: newVarianteForm.description || undefined,
                      recommandee: newVarianteForm.recommandee,
                    });
                  }}
                  disabled={createVarianteMutation.isPending}
                >
                  {createVarianteMutation.isPending ? "Création…" : "Créer la variante"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      {/* Dialog pour ajouter une ligne */}
      <Dialog open={isAddLineDialogOpen} onOpenChange={setIsAddLineDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ajouter une ligne</DialogTitle>
            <DialogDescription>
              Sélectionnez un article ou saisissez manuellement
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddLine}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Article de la bibliothèque</Label>
                <Select onValueChange={(val) => {
                  const article = articles?.find((a: any) => a.id === parseInt(val));
                  if (article) {
                    setLineFormData({
                      reference: article.reference || "",
                      designation: article.designation || "",
                      description: article.description || "",
                      quantite: "1",
                      unite: article.unite || "unité",
                      prixUnitaireHT: String(article.prixUnitaireHT || ""),
                      // OPE-142/167 : taux de TVA par défaut de l'article (fallback 20).
                      tauxTVA: article.tauxTVA != null && article.tauxTVA !== "" ? String(parseFloat(article.tauxTVA)) : "20.00",
                    });
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un article..." />
                  </SelectTrigger>
                  <SelectContent>
                    {articles?.slice(0, 50).map((article: any) => (
                      <SelectItem key={article.id} value={String(article.id)}>
                        {article.designation} - {formatCurrency(article.prixUnitaireHT)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reference">Référence</Label>
                  <Input
                    id="reference"
                    value={lineFormData.reference}
                    onChange={(e) => setLineFormData({ ...lineFormData, reference: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="designation">Désignation *</Label>
                  <Input
                    id="designation"
                    value={lineFormData.designation}
                    onChange={(e) => setLineFormData({ ...lineFormData, designation: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={lineFormData.description}
                  onChange={(e) => setLineFormData({ ...lineFormData, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantite">Quantité</Label>
                  <Input
                    id="quantite"
                    type="number"
                    step="0.01"
                    value={lineFormData.quantite}
                    onChange={(e) => setLineFormData({ ...lineFormData, quantite: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unite">Unité</Label>
                  <Input
                    id="unite"
                    value={lineFormData.unite}
                    onChange={(e) => setLineFormData({ ...lineFormData, unite: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prixUnitaireHT">Prix HT *</Label>
                  <Input
                    id="prixUnitaireHT"
                    type="number"
                    step="0.01"
                    value={lineFormData.prixUnitaireHT}
                    onChange={(e) => setLineFormData({ ...lineFormData, prixUnitaireHT: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tauxTVA">TVA %</Label>
                  <Input
                    id="tauxTVA"
                    type="number"
                    step="0.01"
                    value={lineFormData.tauxTVA}
                    onChange={(e) => setLineFormData({ ...lineFormData, tauxTVA: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddLineDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={addLineMutation.isPending}>
                {addLineMutation.isPending ? "Ajout..." : "Ajouter"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* OPE-121 — Rappels / activités CRM rattachés à ce devis (relance signature) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Rappels ({activitesDevis.filter((a: any) => !a.fait).length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col sm:flex-row gap-2 mb-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!rappelTitre.trim()) { toast.error("Le titre est requis"); return; }
              if (!rappelEcheance) { toast.error("L'échéance est requise"); return; }
              createRappel.mutate({
                titre: rappelTitre.trim(),
                echeance: rappelEcheance,
                type: rappelType as any,
                entiteType: "devis",
                entiteId: devisIdNum,
              });
            }}
          >
            <Input
              placeholder={`Relancer ${devis?.numero || "le devis"} pour signature…`}
              value={rappelTitre}
              onChange={(e) => setRappelTitre(e.target.value)}
              className="flex-1"
            />
            <Input
              type="date"
              value={rappelEcheance}
              onChange={(e) => setRappelEcheance(e.target.value)}
              className="sm:w-40"
            />
            <Select value={rappelType} onValueChange={setRappelType}>
              <SelectTrigger className="sm:w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="relance">Relance</SelectItem>
                <SelectItem value="appel">Appel</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="rdv">RDV</SelectItem>
                <SelectItem value="autre">À faire</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={createRappel.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Ajouter
            </Button>
          </form>

          {activitesDevis.length > 0 ? (
            <div className="space-y-2">
              {activitesDevis
                .slice()
                .sort((a: any, b: any) => new Date(a.echeance).getTime() - new Date(b.echeance).getTime())
                .map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2 p-3 rounded-lg border">
                    <button
                      type="button"
                      title={a.fait ? "Marquer à faire" : "Marquer fait"}
                      onClick={() => toggleRappel.mutate({ id: a.id, fait: !a.fait })}
                      className="mt-0.5 shrink-0"
                    >
                      {a.fait
                        ? <Check className="h-4 w-4 text-emerald-500" />
                        : <Circle className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${a.fait ? "line-through text-muted-foreground" : ""}`}>
                        {a.titre}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <AlarmClock className="h-3 w-3" />
                          {format(new Date(a.echeance), "dd MMM yyyy", { locale: fr })}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">
                          {rappelTypeLabels[a.type] || a.type}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      title="Supprimer"
                      onClick={() => deleteRappel.mutate({ id: a.id })}
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-center py-6 text-sm text-muted-foreground">
              Aucun rappel pour ce devis.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
