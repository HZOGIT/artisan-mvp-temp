import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Search, Loader2, Send, Save } from "lucide-react";
import { toast } from "sonner";

interface LigneCommande {
  id: string;
  articleId?: number | null;
  stockId?: number;
  designation: string;
  reference?: string;
  quantite: number;
  unite: string;
  prixUnitaire?: number;
  tauxTVA: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

export default function CommandeFournisseurForm() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const isEdit = !!params.id;
  const commandeId = params.id ? parseInt(params.id) : 0;

  // Form state
  const [fournisseurId, setFournisseurId] = useState<number>(0);
  const [dateCommande, setDateCommande] = useState(new Date().toISOString().split("T")[0]);
  const [delaiLivraison, setDelaiLivraison] = useState("");
  const [adresseLivraison, setAdresseLivraison] = useState("");
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<LigneCommande[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Article search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSearchLigneId, setActiveSearchLigneId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Data
  const { data: fournisseurs } = trpc.fournisseurs.list.useQuery();
  const { data: artisanArticles } = trpc.articles.getArtisanArticles.useQuery();
  const utils = trpc.useUtils();

  // Load existing commande in edit mode
  const { data: existingCommande } = trpc.commandesFournisseurs.getById.useQuery(
    { id: commandeId },
    { enabled: isEdit && commandeId > 0 }
  );

  useEffect(() => {
    if (existingCommande && isEdit) {
      setFournisseurId(existingCommande.fournisseurId);
      if (existingCommande.dateCommande) {
        setDateCommande(new Date(existingCommande.dateCommande).toISOString().split("T")[0]);
      }
      setDelaiLivraison(existingCommande.delaiLivraison || "");
      setAdresseLivraison(existingCommande.adresseLivraison || "");
      setNotes(existingCommande.notes || "");
      if (existingCommande.lignes) {
        setLignes(
          existingCommande.lignes.map((l: any) => ({
            id: l.id.toString(),
            articleId: l.articleId,
            stockId: l.stockId,
            designation: l.designation,
            reference: l.reference || "",
            quantite: Number(l.quantite) || 1,
            unite: l.unite || "unité",
            prixUnitaire: l.prixUnitaire ? Number(l.prixUnitaire) : undefined,
            tauxTVA: Number(l.tauxTVA) || 20,
          }))
        );
      }
    }
  }, [existingCommande, isEdit]);

  // Mutations
  const createMutation = trpc.commandesFournisseurs.create.useMutation();
  const updateMutation = trpc.commandesFournisseurs.update.useMutation();
  const sendEmailMutation = trpc.commandesFournisseurs.sendEmail.useMutation();

  // Totals
  const totaux = useMemo(() => {
    const totalHT = lignes.reduce((sum, l) => sum + l.quantite * (l.prixUnitaire || 0), 0);
    const totalTVA = lignes.reduce((sum, l) => {
      const ht = l.quantite * (l.prixUnitaire || 0);
      return sum + ht * (l.tauxTVA / 100);
    }, 0);
    return { totalHT, totalTVA, totalTTC: totalHT + totalTVA };
  }, [lignes]);

  // Article search (from artisan articles + bibliotheque)
  const searchArticles = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        // Search artisan's own articles locally
        const q = query.toLowerCase();
        const localResults = (artisanArticles || [])
          .filter((a: any) => a.designation?.toLowerCase().includes(q) || a.reference?.toLowerCase().includes(q))
          .slice(0, 5)
          .map((a: any) => ({
            id: a.id,
            type: "artisan",
            nom: a.designation,
            reference: a.reference,
            unite: a.unite || "unité",
            prixAchat: a.prixAchat ? parseFloat(a.prixAchat) : undefined,
            prixVente: a.prixUnitaireHT ? parseFloat(a.prixUnitaireHT) : undefined,
          }));

        // Also search bibliotheque
        const res = await fetch(`/api/articles/search?q=${encodeURIComponent(query)}`);
        let biblioResults: any[] = [];
        if (res.ok) {
          const data = await res.json();
          biblioResults = data.slice(0, 5).map((a: any) => ({
            id: `biblio-${a.id}`,
            type: "bibliotheque",
            nom: a.nom,
            reference: "",
            unite: a.unite || "unité",
            prixAchat: undefined,
            prixVente: a.prix_base ? parseFloat(a.prix_base) : undefined,
          }));
        }

        setSearchResults([...localResults, ...biblioResults]);
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [artisanArticles]);

  // Line management
  const addManualLine = () => {
    setLignes([
      ...lignes,
      {
        id: Date.now().toString(),
        designation: "",
        quantite: 1,
        unite: "unité",
        tauxTVA: 20,
      },
    ]);
  };

  const addArticleLine = () => {
    const newLine: LigneCommande = {
      id: Date.now().toString(),
      designation: "",
      quantite: 1,
      unite: "unité",
      tauxTVA: 20,
    };
    setLignes([...lignes, newLine]);
    setActiveSearchLigneId(newLine.id);
  };

  const removeLine = (id: string) => {
    setLignes(lignes.filter((l) => l.id !== id));
    if (activeSearchLigneId === id) setActiveSearchLigneId(null);
  };

  const updateLine = (id: string, field: keyof LigneCommande, value: any) => {
    setLignes(lignes.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const handleSelectArticle = (ligneId: string, article: any) => {
    setLignes(
      lignes.map((l) =>
        l.id === ligneId
          ? {
              ...l,
              articleId: article.type === "artisan" ? article.id : null,
              designation: article.nom,
              reference: article.reference || "",
              unite: article.unite || "unité",
              // Use prixAchat if available, otherwise leave empty (never use prixVente)
              prixUnitaire: article.prixAchat || undefined,
            }
          : l
      )
    );
    setActiveSearchLigneId(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  // Submit
  const handleSubmit = async (sendEmail: boolean) => {
    if (!fournisseurId) {
      toast.error("Sélectionnez un fournisseur");
      return;
    }
    if (lignes.length === 0) {
      toast.error("Ajoutez au moins une ligne");
      return;
    }
    if (lignes.some((l) => !l.designation.trim())) {
      toast.error("Toutes les lignes doivent avoir une désignation");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        fournisseurId,
        delaiLivraison: delaiLivraison || undefined,
        adresseLivraison: adresseLivraison || undefined,
        notes: notes || undefined,
        lignes: lignes.map((l) => ({
          articleId: l.articleId ?? null,
          stockId: l.stockId,
          designation: l.designation,
          reference: l.reference,
          quantite: l.quantite,
          unite: l.unite,
          prixUnitaire: l.prixUnitaire,
          tauxTVA: l.tauxTVA,
        })),
      };

      let resultId: number;

      if (isEdit) {
        await updateMutation.mutateAsync({ id: commandeId, ...payload });
        resultId = commandeId;
        toast.success("Commande mise à jour");
      } else {
        const result = await createMutation.mutateAsync(payload);
        resultId = result.id;
        toast.success("Commande créée");
      }

      if (sendEmail) {
        try {
          await sendEmailMutation.mutateAsync({ id: resultId });
          toast.success("Bon de commande envoyé par email");
        } catch (err: any) {
          toast.error(err.message || "Erreur lors de l'envoi email");
        }
      }

      utils.commandesFournisseurs.list.invalidate();
      setLocation("/commandes");
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de la sauvegarde");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/commandes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {isEdit ? `Modifier la commande${existingCommande?.numero ? ` ${existingCommande.numero}` : ""}` : "Nouveau bon de commande"}
          </h1>
          <p className="text-muted-foreground">
            {isEdit ? "Modifiez les détails de la commande" : "Créez un bon de commande fournisseur"}
          </p>
        </div>
      </div>

      {/* Form header section */}
      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fournisseur">Fournisseur *</Label>
              <Select value={fournisseurId ? fournisseurId.toString() : ""} onValueChange={(v) => setFournisseurId(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un fournisseur..." />
                </SelectTrigger>
                <SelectContent>
                  {(fournisseurs || []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id.toString()}>
                      {f.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateCommande">Date de commande</Label>
              <Input
                id="dateCommande"
                type="date"
                value={dateCommande}
                onChange={(e) => setDateCommande(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delaiLivraison">Délai de livraison</Label>
              <Input
                id="delaiLivraison"
                placeholder="Ex: 2 semaines, 10 jours ouvrés..."
                value={delaiLivraison}
                onChange={(e) => setDelaiLivraison(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adresseLivraison">Adresse de livraison</Label>
              <Input
                id="adresseLivraison"
                placeholder="Adresse de livraison..."
                value={adresseLivraison}
                onChange={(e) => setAdresseLivraison(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Notes ou instructions particulières..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Lines section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Lignes de commande</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addArticleLine}>
              <Search className="h-4 w-4 mr-1" />
              Article bibliothèque
            </Button>
            <Button variant="outline" size="sm" onClick={addManualLine}>
              <Plus className="h-4 w-4 mr-1" />
              Ligne manuelle
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {lignes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Aucune ligne. Ajoutez un article ou une ligne manuelle.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Table header */}
              <div className="hidden md:grid grid-cols-[1fr_80px_80px_100px_70px_100px_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>Désignation</span>
                <span className="text-center">Qté</span>
                <span className="text-center">Unité</span>
                <span className="text-right">P.U. HT</span>
                <span className="text-center">TVA %</span>
                <span className="text-right">Total HT</span>
                <span></span>
              </div>

              {lignes.map((ligne) => (
                <div key={ligne.id} className="relative">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_80px_80px_100px_70px_100px_40px] gap-2 items-start p-2 rounded-lg border bg-card">
                    {/* Designation with search */}
                    <div className="relative">
                      <Input
                        placeholder="Désignation..."
                        value={ligne.designation}
                        onChange={(e) => {
                          updateLine(ligne.id, "designation", e.target.value);
                          if (activeSearchLigneId === ligne.id) {
                            setSearchQuery(e.target.value);
                            searchArticles(e.target.value);
                          }
                        }}
                        onFocus={() => {
                          if (activeSearchLigneId === ligne.id && ligne.designation.length >= 2) {
                            searchArticles(ligne.designation);
                          }
                        }}
                      />
                      {/* Search dropdown */}
                      {activeSearchLigneId === ligne.id && (searchResults.length > 0 || isSearching) && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {isSearching && (
                            <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" /> Recherche...
                            </div>
                          )}
                          {searchResults.map((article) => (
                            <button
                              key={article.id}
                              type="button"
                              onClick={() => handleSelectArticle(ligne.id, article)}
                              className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b last:border-b-0 transition-colors"
                            >
                              <div className="font-medium text-sm">{article.nom}</div>
                              <div className="text-xs text-muted-foreground">
                                {article.prixAchat ? `Achat: ${formatCurrency(article.prixAchat)}` : "Pas de prix d'achat"}
                                {article.reference && <span className="ml-2">Réf: {article.reference}</span>}
                                <span className="ml-2 text-gray-400">
                                  {article.type === "artisan" ? "Stock" : "Bibliothèque"}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quantite */}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Qté"
                      value={ligne.quantite}
                      onChange={(e) => updateLine(ligne.id, "quantite", parseFloat(e.target.value) || 0)}
                      className="text-center"
                    />

                    {/* Unite */}
                    <Input
                      placeholder="Unité"
                      value={ligne.unite}
                      onChange={(e) => updateLine(ligne.id, "unite", e.target.value)}
                      className="text-center"
                    />

                    {/* Prix unitaire HT */}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Prix HT"
                      value={ligne.prixUnitaire ?? ""}
                      onChange={(e) => updateLine(ligne.id, "prixUnitaire", e.target.value ? parseFloat(e.target.value) : undefined)}
                      className="text-right"
                    />

                    {/* TVA */}
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={ligne.tauxTVA}
                      onChange={(e) => updateLine(ligne.id, "tauxTVA", parseFloat(e.target.value) || 0)}
                      className="text-center"
                    />

                    {/* Total HT */}
                    <div className="flex items-center justify-end text-sm font-medium h-9 px-2">
                      {formatCurrency(ligne.quantite * (ligne.prixUnitaire || 0))}
                    </div>

                    {/* Delete */}
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeLine(ligne.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          {lignes.length > 0 && (
            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total HT</span>
                  <span className="font-medium">{formatCurrency(totaux.totalHT)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total TVA</span>
                  <span className="font-medium">{formatCurrency(totaux.totalTVA)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-base">
                  <span className="font-bold">Total TTC</span>
                  <span className="font-bold text-green-600">{formatCurrency(totaux.totalTTC)}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => setLocation("/commandes")} disabled={isSubmitting}>
          Annuler
        </Button>
        <Button variant="secondary" onClick={() => handleSubmit(false)} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Enregistrer en brouillon
        </Button>
        <Button onClick={() => handleSubmit(true)} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Enregistrer et envoyer
        </Button>
      </div>
    </div>
  );
}
