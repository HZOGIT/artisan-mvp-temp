import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Receipt, User, CheckCircle, Download, Mail, Search, Loader2, Lock, FileText, History, AlertTriangle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateFacturePDF } from "@/lib/pdfGenerator";
import { fr } from "date-fns/locale";

interface ArticleBibliotheque {
  id: number;
  nom: string;
  description: string | null;
  prix_base: string;
  unite: string;
  metier: string;
  categorie: string;
  sous_categorie: string;
  duree_moyenne_minutes: number | null;
}

const statusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  validee: "Validée",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

const statusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  validee: "bg-amber-100 text-amber-800",
  envoyee: "bg-blue-100 text-blue-700",
  payee: "bg-green-100 text-green-700",
  en_retard: "bg-orange-100 text-orange-700",
  annulee: "bg-red-100 text-red-700",
};

export default function FactureDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [isAddLineDialogOpen, setIsAddLineDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isAvoirDialogOpen, setIsAvoirDialogOpen] = useState(false);
  const [avoirType, setAvoirType] = useState<"total" | "partiel">("total");
  const [avoirNotes, setAvoirNotes] = useState("");
  const [avoirLignes, setAvoirLignes] = useState<Array<{designation: string; quantite: string; prixUnitaireHT: string; tauxTVA: string; unite: string}>>([]);
  const [paymentData, setPaymentData] = useState({
    montantPaye: "",
    datePaiement: format(new Date(), "yyyy-MM-dd"),
  });
  const [lineFormData, setLineFormData] = useState({
    reference: "",
    designation: "",
    description: "",
    quantite: "1",
    unite: "unité",
    prixUnitaireHT: "",
    tauxTVA: "20.00",
  });

  // Autocomplete article search
  const [searchResults, setSearchResults] = useState<ArticleBibliotheque[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchArticles = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setShowDropdown(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/articles/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowDropdown(data.length > 0);
        }
      } catch (err) {
        console.error("[ArticleSearch]", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const utils = trpc.useUtils();
  const factureId = parseInt(id || "0");
  const { data: facture, isLoading } = trpc.factures.getById.useQuery(
    { id: factureId },
    { enabled: !!id }
  );
  const { data: articles } = trpc.articles.getBibliotheque.useQuery();
  const { data: artisan } = trpc.artisan.getProfile.useQuery();
  const { data: parametresData } = trpc.parametres.get.useQuery();
  const { data: avoirs } = trpc.factures.getAvoirsByFacture.useQuery(
    { factureId },
    { enabled: !!id && !!facture }
  );
  const { data: auditLogs } = trpc.factures.getAuditLog.useQuery(
    { factureId },
    { enabled: !!id && !!facture }
  );

  const updateMutation = trpc.factures.update.useMutation({
    onSuccess: () => {
      utils.factures.getById.invalidate({ id: factureId });
      utils.factures.getAuditLog.invalidate({ factureId });
      toast.success("Facture mise à jour");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const addLineMutation = trpc.factures.addLigne.useMutation({
    onSuccess: () => {
      utils.factures.getById.invalidate({ id: factureId });
      setIsAddLineDialogOpen(false);
      resetLineForm();
      toast.success("Ligne ajoutée");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const markAsPaidMutation = trpc.factures.markAsPaid.useMutation({
    onSuccess: () => {
      utils.factures.getById.invalidate({ id: factureId });
      utils.factures.getAuditLog.invalidate({ factureId });
      setIsPaymentDialogOpen(false);
      toast.success("Paiement enregistré");
    },
  });

  const createAvoirMutation = trpc.factures.createAvoir.useMutation({
    onSuccess: (data) => {
      utils.factures.getById.invalidate({ id: factureId });
      utils.factures.getAvoirsByFacture.invalidate({ factureId });
      utils.factures.getAuditLog.invalidate({ factureId });
      utils.factures.list.invalidate();
      setIsAvoirDialogOpen(false);
      toast.success(`Avoir ${data.numero} créé avec succès`);
      setLocation(`/factures/${data.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const sendByEmailMutation = trpc.factures.sendByEmail.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
        utils.factures.getById.invalidate({ id: factureId });
        utils.factures.getAuditLog.invalidate({ factureId });
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

  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);

  const handleSendByEmail = () => {
    if (!facture?.client?.email) {
      toast.error("Ce client n'a pas d'adresse email");
      return;
    }
    sendByEmailMutation.mutate({
      factureId,
      customMessage: emailMessage || undefined,
      attachPdf,
    });
  };

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
      factureId,
      ...lineFormData,
    });
  };

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate({ id: factureId, statut: newStatus as any });
  };

  const handleMarkAsPaid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentData.montantPaye) {
      toast.error("Veuillez saisir le montant payé");
      return;
    }
    markAsPaidMutation.mutate({
      id: factureId,
      ...paymentData,
    });
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
      });
    }
  };

  const handleCreateAvoir = () => {
    if (!facture) return;
    if (avoirType === "total") {
      // Avoir total : reprendre toutes les lignes de la facture
      const lignes = (facture.lignes || []).map((l: any) => ({
        designation: l.designation,
        quantite: l.quantite?.toString() || "1",
        prixUnitaireHT: l.prixUnitaireHT?.toString() || "0",
        tauxTVA: l.tauxTVA?.toString() || "20.00",
        unite: l.unite || "unité",
      }));
      createAvoirMutation.mutate({
        factureOrigineId: factureId,
        lignes,
        objet: `Avoir total sur facture ${facture.numero}`,
        notes: avoirNotes || undefined,
      });
    } else {
      // Avoir partiel : utiliser les lignes personnalisées
      if (avoirLignes.length === 0) {
        toast.error("Ajoutez au moins une ligne à l'avoir");
        return;
      }
      createAvoirMutation.mutate({
        factureOrigineId: factureId,
        lignes: avoirLignes,
        objet: `Avoir partiel sur facture ${facture.numero}`,
        notes: avoirNotes || undefined,
      });
    }
  };

  const handleExportPDF = () => {
    if (!facture || !facture.client) {
      toast.error("Impossible de générer le PDF");
      return;
    }
    const artisanData = artisan || {};
    const lignes = (facture.lignes || []).map((l: any) => ({
      designation: l.designation,
      description: l.description,
      quantite: parseFloat(l.quantite) || 1,
      unite: l.unite,
      prixUnitaire: parseFloat(l.prixUnitaireHT) || 0,
      tauxTva: parseFloat(l.tauxTVA) || 20,
    }));
    const isAvoir = (facture as any).typeDocument === "avoir";
    generateFacturePDF(
      artisanData,
      facture.client,
      {
        numero: facture.numero,
        dateCreation: facture.createdAt,
        dateEcheance: facture.dateEcheance,
        statut: facture.statut || "brouillon",
        objet: facture.objet,
        referenceClient: (facture as any).referenceClient,
        lignes,
        totalHT: parseFloat(facture.totalHT as any) || 0,
        totalTVA: parseFloat(facture.totalTVA as any) || 0,
        totalTTC: parseFloat(facture.totalTTC as any) || 0,
        montantPaye: parseFloat(facture.montantPaye as any) || 0,
        conditions: (facture as any).conditionsPaiement || null,
        isAvoir,
      },
      {
        mentionsLegales: parametresData?.mentionsLegales || null,
        // OPE-127 — CGV réutilisables (même source que le devis : conditionsGenerales).
        cgv: parametresData?.conditionsGenerales || null,
      }
    );
    toast.success("PDF généré avec succès");
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

  if (!facture) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-foreground">Facture non trouvée</h2>
        <Button variant="link" onClick={() => setLocation("/factures")}>
          Retour à la liste
        </Button>
      </div>
    );
  }

  const currentStatut = facture.statut || "brouillon";
  const isLocked = currentStatut !== "brouillon";
  const isAvoir = (facture as any).typeDocument === "avoir";
  const documentLabel = isAvoir ? "Avoir" : "Facture";

  // Calcul du solde restant pour les avoirs
  const factureTotalTTC = parseFloat(facture.totalTTC as any) || 0;
  const totalCouvertParAvoirs = (avoirs || []).reduce(
    (sum: number, a: any) => sum + Math.abs(parseFloat(a.totalTTC) || 0),
    0
  );
  const avoirTotalExistant = (avoirs || []).find(
    (a: any) => Math.abs(Math.abs(parseFloat(a.totalTTC) || 0) - factureTotalTTC) < 0.01
  );
  const soldeAvoirRestant = Math.max(0, factureTotalTTC - totalCouvertParAvoirs);
  const avoirBloque = !!avoirTotalExistant || soldeAvoirRestant <= 0.01;

  // Montant TTC du nouvel avoir partiel en cours de saisie
  const nouveauAvoirMontantTTC = avoirLignes.reduce((sum, l) => {
    const q = Math.abs(parseFloat(l.quantite) || 0);
    const pu = Math.abs(parseFloat(l.prixUnitaireHT) || 0);
    const tva = parseFloat(l.tauxTVA) || 0;
    return sum + q * pu * (1 + tva / 100);
  }, 0);
  const depasseSolde = avoirType === "partiel" && nouveauAvoirMontantTTC > soldeAvoirRestant + 0.01;

  // Transitions de statut autorisées
  const allowedTransitions: Record<string, string[]> = {
    brouillon: ["envoyee"],
    validee: ["envoyee", "payee", "annulee"],
    envoyee: ["payee", "en_retard"],
    en_retard: ["payee"],
    payee: [],
    annulee: [],
  };
  const allowedNextStatuses = allowedTransitions[currentStatut] || [];

  // Le bouton "Envoyer par email" doit rester actif pour permettre les renvois.
  // Le label change selon que le document a déjà été envoyé ou non.
  const dejaEnvoye = currentStatut === "envoyee" || currentStatut === "payee" || currentStatut === "en_retard";
  const sendButtonLabel = dejaEnvoye ? "Renvoyer par email" : "Envoyer par email";
  const sendDialogTitle = dejaEnvoye
    ? `Renvoyer ${isAvoir ? "l'avoir" : "la facture"} par email`
    : `Envoyer ${isAvoir ? "l'avoir" : "la facture"} par email`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/factures")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{facture.numero}</h1>
              {isAvoir && (
                <Badge className="bg-red-100 text-red-700 border-red-300">
                  AVOIR
                </Badge>
              )}
              <Badge className={statusColors[currentStatut] || "bg-gray-100"}>
                {statusLabels[currentStatut] || currentStatut}
              </Badge>
              {isLocked && (
                <Lock className="h-4 w-4 text-amber-500" />
              )}
            </div>
            <p className="text-muted-foreground">{facture.objet || documentLabel}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>

          {/* Envoyer / Renvoyer par email */}
          <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!facture.client?.email}>
                <Mail className="h-4 w-4 mr-2" />
                {sendButtonLabel}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{sendDialogTitle}</DialogTitle>
                <DialogDescription>
                  {isAvoir ? "L'avoir" : "La facture"} sera {dejaEnvoye ? "renvoyé" : "envoyé"}{isAvoir ? "" : "e"} à {facture.client?.email}
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
                  <span className="text-sm font-medium text-gray-700">Joindre la facture en PDF</span>
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handleSendByEmail} disabled={sendByEmailMutation.isPending}>
                  {sendByEmailMutation.isPending
                    ? (dejaEnvoye ? "Renvoi en cours..." : "Envoi en cours...")
                    : (dejaEnvoye ? "Renvoyer" : "Envoyer")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Changement de statut — uniquement les transitions autorisées */}
          {allowedNextStatuses.length > 0 && (
            <Select value="" onValueChange={handleStatusChange}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Changer le statut" />
              </SelectTrigger>
              <SelectContent>
                {allowedNextStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Marquer comme payée */}
          {(currentStatut === "envoyee" || currentStatut === "en_retard") && (
            <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setPaymentData({ ...paymentData, montantPaye: String(facture.totalTTC || 0) })}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Marquer comme payée
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Enregistrer le paiement</DialogTitle>
                  <DialogDescription>
                    Saisissez les informations du paiement
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleMarkAsPaid}>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="montantPaye">Montant payé</Label>
                      <Input
                        id="montantPaye"
                        type="number"
                        step="0.01"
                        value={paymentData.montantPaye}
                        onChange={(e) => setPaymentData({ ...paymentData, montantPaye: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="datePaiement">Date de paiement</Label>
                      <Input
                        id="datePaiement"
                        type="date"
                        value={paymentData.datePaiement}
                        onChange={(e) => setPaymentData({ ...paymentData, datePaiement: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit" disabled={markAsPaidMutation.isPending}>
                      {markAsPaidMutation.isPending ? "Enregistrement..." : "Enregistrer"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {/* Émettre un avoir — uniquement sur factures validées (pas sur les avoirs) */}
          {isLocked && !isAvoir && avoirBloque && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground border border-dashed border-gray-300 rounded-md px-3 py-2">
              <Lock className="h-4 w-4" />
              {avoirTotalExistant
                ? `Avoir total déjà émis (${avoirTotalExistant.numero})`
                : "Solde entièrement couvert par les avoirs"}
            </span>
          )}
          {isLocked && !isAvoir && !avoirBloque && (
            <Dialog open={isAvoirDialogOpen} onOpenChange={(open) => {
              setIsAvoirDialogOpen(open);
              if (open) {
                setAvoirType("total");
                setAvoirNotes("");
                setAvoirLignes([]);
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50">
                  <FileText className="h-4 w-4 mr-2" />
                  Émettre un avoir
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Émettre un avoir</DialogTitle>
                  <DialogDescription>
                    Créer un avoir sur la facture {facture.numero} ({formatCurrency(facture.totalTTC)})
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {totalCouvertParAvoirs > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                      Montant déjà couvert par avoirs : <strong>{formatCurrency(totalCouvertParAvoirs)}</strong>
                      {" "}/ Solde disponible : <strong>{formatCurrency(soldeAvoirRestant)}</strong>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Type d'avoir</Label>
                    <Select value={avoirType} onValueChange={(v) => setAvoirType(v as "total" | "partiel")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total" disabled={totalCouvertParAvoirs > 0}>
                          Avoir total (annulation complète)
                          {totalCouvertParAvoirs > 0 && " — indisponible (avoirs partiels existants)"}
                        </SelectItem>
                        <SelectItem value="partiel">Avoir partiel (montant personnalisé)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {avoirType === "total" && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4 inline mr-1" />
                      L'avoir total reprendra toutes les lignes de la facture avec des montants négatifs pour un total de {formatCurrency(-(parseFloat(facture.totalTTC as any) || 0))}.
                    </div>
                  )}

                  {avoirType === "partiel" && (
                    <div className="space-y-3">
                      <Label>Lignes de l'avoir</Label>
                      {avoirLignes.map((ligne, idx) => (
                        <div key={idx} className="grid grid-cols-5 gap-2 items-end">
                          <div className="col-span-2">
                            <Input
                              placeholder="Désignation"
                              value={ligne.designation}
                              onChange={(e) => {
                                const updated = [...avoirLignes];
                                updated[idx].designation = e.target.value;
                                setAvoirLignes(updated);
                              }}
                            />
                          </div>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Qté"
                            value={ligne.quantite}
                            onChange={(e) => {
                              const updated = [...avoirLignes];
                              updated[idx].quantite = e.target.value;
                              setAvoirLignes(updated);
                            }}
                          />
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Prix HT"
                            value={ligne.prixUnitaireHT}
                            onChange={(e) => {
                              const updated = [...avoirLignes];
                              updated[idx].prixUnitaireHT = e.target.value;
                              setAvoirLignes(updated);
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setAvoirLignes(avoirLignes.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAvoirLignes([...avoirLignes, { designation: "", quantite: "1", prixUnitaireHT: "", tauxTVA: "20.00", unite: "unité" }])}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Ajouter une ligne
                      </Button>
                    </div>
                  )}

                  {avoirType === "partiel" && avoirLignes.length > 0 && (
                    <div className={`rounded-lg p-3 text-sm border ${depasseSolde ? "bg-red-50 border-red-200 text-red-800" : "bg-gray-50 border-gray-200 text-gray-700"}`}>
                      Montant de cet avoir : <strong>{formatCurrency(nouveauAvoirMontantTTC)}</strong>
                      {depasseSolde && (
                        <div className="mt-1">
                          <AlertTriangle className="h-4 w-4 inline mr-1" />
                          Dépasse le solde disponible de {formatCurrency(soldeAvoirRestant)}.
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Notes (optionnel)</Label>
                    <Textarea
                      placeholder="Motif de l'avoir..."
                      value={avoirNotes}
                      onChange={(e) => setAvoirNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAvoirDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button
                    onClick={handleCreateAvoir}
                    disabled={createAvoirMutation.isPending || depasseSolde}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {createAvoirMutation.isPending ? "Création..." : "Créer l'avoir"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Verrouillage fiscal */}
      {isLocked && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <Lock className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800">Document fiscal verrouillé — Non modifiable</p>
            <p className="text-sm text-amber-600">
              Conformément à l'article 286 du CGI, ce document ne peut plus être modifié.
              {!isAvoir && " Pour corriger, émettez un avoir."}
            </p>
          </div>
        </div>
      )}

      {/* Référence facture d'origine (pour les avoirs) */}
      {isAvoir && (facture as any).factureOrigineId && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <FileText className="h-5 w-5 text-red-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-800">
              Avoir sur facture d'origine
            </p>
            <Button variant="link" className="p-0 h-auto text-red-700" onClick={() => setLocation(`/factures/${(facture as any).factureOrigineId}`)}>
              Voir la facture d'origine
            </Button>
          </div>
        </div>
      )}

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
            <p className="font-medium">{facture.client?.nom} {facture.client?.prenom}</p>
            {facture.client?.email && <p className="text-sm text-muted-foreground">{facture.client.email}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{format(new Date(facture.createdAt), "dd MMMM yyyy", { locale: fr })}</p>
            {facture.dateEcheance && (
              <p className="text-sm text-muted-foreground">
                Échéance: {format(new Date(facture.dateEcheance), "dd/MM/yyyy", { locale: fr })}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total TTC</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${isAvoir ? "text-red-600" : "text-primary"}`}>{formatCurrency(facture.totalTTC)}</p>
            <p className="text-sm text-muted-foreground">HT: {formatCurrency(facture.totalHT)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Lines */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lignes {isAvoir ? "de l'avoir" : "de la facture"}</CardTitle>
            {!isLocked && (
              <Dialog open={isAddLineDialogOpen} onOpenChange={setIsAddLineDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={resetLineForm}>
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter une ligne
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Ajouter une ligne</DialogTitle>
                    <DialogDescription>
                      Sélectionnez un article ou saisissez manuellement
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddLine}>
                    <div className="grid gap-4 py-4">
                      {/* Désignation avec autocomplete */}
                      <div className="relative" ref={dropdownRef}>
                        <Label htmlFor="designation">Désignation *</Label>
                        <div className="relative mt-1">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            id="designation"
                            value={lineFormData.designation}
                            onChange={(e) => {
                              setLineFormData({ ...lineFormData, designation: e.target.value });
                              searchArticles(e.target.value);
                            }}
                            onFocus={() => {
                              if (lineFormData.designation.length >= 2) searchArticles(lineFormData.designation);
                            }}
                            placeholder="Tapez pour rechercher un article ou saisir librement..."
                            className="pl-10"
                            required
                          />
                          {isSearching && (
                            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
                          )}
                        </div>
                        {showDropdown && searchResults.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {searchResults.map((article) => (
                              <button
                                key={article.id}
                                type="button"
                                onClick={() => {
                                  setLineFormData({
                                    ...lineFormData,
                                    designation: article.nom,
                                    description: article.description || "",
                                    prixUnitaireHT: article.prix_base,
                                    unite: article.unite || "unité",
                                  });
                                  setShowDropdown(false);
                                  toast.success(`${article.nom} sélectionné`);
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                              >
                                <div className="font-medium text-sm">{article.nom}</div>
                                <div className="text-xs text-gray-500">
                                  {formatCurrency(article.prix_base)} / {article.unite}
                                  <span className="ml-2 text-gray-400">{article.categorie}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reference">Référence</Label>
                        <Input
                          id="reference"
                          value={lineFormData.reference}
                          onChange={(e) => setLineFormData({ ...lineFormData, reference: e.target.value })}
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
            )}
          </div>
        </CardHeader>
        <CardContent>
          {facture.lignes && facture.lignes.length > 0 ? (
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
                  </tr>
                </thead>
                <tbody>
                  {facture.lignes.map((ligne: any) => (
                    <tr key={ligne.id}>
                      <td>{ligne.reference || "-"}</td>
                      <td>{ligne.designation}</td>
                      <td className="text-right">{ligne.quantite} {ligne.unite}</td>
                      <td className="text-right">{formatCurrency(ligne.prixUnitaireHT)}</td>
                      <td className="text-right">{ligne.tauxTVA}%</td>
                      <td className="text-right font-medium">{formatCurrency(ligne.montantTTC)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2">
                    <td colSpan={5} className="text-right font-medium">Total HT</td>
                    <td className="text-right font-medium">{formatCurrency(facture.totalHT)}</td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="text-right font-medium">TVA</td>
                    <td className="text-right font-medium">{formatCurrency(facture.totalTVA)}</td>
                  </tr>
                  <tr className="bg-muted/50">
                    <td colSpan={5} className="text-right font-bold">Total TTC</td>
                    <td className={`text-right font-bold ${isAvoir ? "text-red-600" : "text-primary"}`}>{formatCurrency(facture.totalTTC)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Aucune ligne dans cette facture</p>
              {!isLocked && (
                <Button variant="link" onClick={() => setIsAddLineDialogOpen(true)}>
                  Ajouter une ligne
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Avoirs liés (pour les factures) */}
      {!isAvoir && avoirs && avoirs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-red-500" />
              Avoirs émis sur cette facture
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {avoirs.map((avoir: any) => (
                <div
                  key={avoir.id}
                  className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg cursor-pointer hover:bg-red-100 transition-colors"
                  onClick={() => setLocation(`/factures/${avoir.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <Badge className="bg-red-100 text-red-700">AVOIR</Badge>
                    <span className="font-medium">{avoir.numero}</span>
                    <span className="text-sm text-muted-foreground">
                      {avoir.dateFacture ? format(new Date(avoir.dateFacture), "dd/MM/yyyy") : ""}
                    </span>
                  </div>
                  <span className="font-medium text-red-600">{formatCurrency(avoir.totalTTC)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Journal d'audit */}
      {auditLogs && auditLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Journal d'audit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 text-sm border-b last:border-0 pb-2 last:pb-0">
                  <span className="text-muted-foreground whitespace-nowrap">
                    {log.createdAt ? format(new Date(log.createdAt), "dd/MM/yyyy HH:mm", { locale: fr }) : ""}
                  </span>
                  <span className="text-foreground">{log.details || log.action}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
