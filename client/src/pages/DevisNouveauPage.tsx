import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Search, X } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface LigneDevis {
  id: string;
  description: string;
  quantite: number;
  prixUnitaireHT: number;
  tauxTVA: number;
}

interface Article {
  id: number;
  nom?: string;
  designation?: string;
  categorie?: string;
  prix?: number;
  prixUnitaireHT?: number;
  unite?: string;
}

const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "0,00 €";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(num);
};

export default function DevisNouveauPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // États du formulaire
  const [clientId, setClientId] = useState<number>(0);
  const [dateDevis, setDateDevis] = useState(new Date().toISOString().split('T')[0]);
  const [dateExpiration, setDateExpiration] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<LigneDevis[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Etats de la recherche d'articles
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const [selectedModeleId, setSelectedModeleId] = useState<number | null>(null);

  // Requetes tRPC
  const { data: clients = [] } = trpc.clients.list.useQuery();
  const { data: articles = [] } = trpc.articles.getArtisanArticles.useQuery();
  const { data: modeles = [] } = trpc.devis.getModeles.useQuery();
  const createMutation = trpc.devis.create.useMutation();
  const addLigneMutation = trpc.devis.addLigne.useMutation();
  const getModeleQuery = trpc.devis.getModeleWithLignes.useQuery(
    { modeleId: selectedModeleId || 0 },
    { enabled: selectedModeleId !== null }
  );

  // Filtrer les articles
  const articlesFiltrés = useMemo(() => {
    if (searchQuery.length < 2) return [];
    return articles.filter((article: any) => {
      const nom = article.nom || article.designation || "";
      const categorie = article.categorie || "";
      return nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
             categorie.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [searchQuery, articles]);

  // Grouper par catégorie
  const articlesGroupes = useMemo(() => {
    const groups: Record<string, Article[]> = {};
    articlesFiltrés.forEach((article: any) => {
      const categorie = article.categorie || "Autres";
      if (!groups[categorie]) groups[categorie] = [];
      groups[categorie].push(article);
    });
    return groups;
  }, [articlesFiltrés]);

  // Ajouter une ligne vide
  const handleAjouterLigne = () => {
    const nouvelleLigne: LigneDevis = {
      id: Date.now().toString(),
      description: "",
      quantite: 1,
      prixUnitaireHT: 0,
      tauxTVA: 20,
    };
    setLignes([...lignes, nouvelleLigne]);
  };

  // Sélectionner un article
  const handleSelectArticle = (article: any) => {
    const nouvelleLigne: LigneDevis = {
      id: Date.now().toString(),
      description: article.nom || article.designation || "",
      quantite: 1,
      prixUnitaireHT: article.prix || article.prixUnitaireHT || 0,
      tauxTVA: 20,
    };
    setLignes([...lignes, nouvelleLigne]);
    setSearchQuery("");
    setIsSearchDialogOpen(false);
    toast.success(`${article.nom || article.designation} ajouté`);
  };

  // Modifier une ligne
  const handleModifierLigne = (id: string, field: keyof LigneDevis, value: any) => {
    setLignes(lignes.map(ligne =>
      ligne.id === id ? { ...ligne, [field]: value } : ligne
    ));
  };

  // Supprimer une ligne
  const handleSupprimerLigne = (id: string) => {
    setLignes(lignes.filter(ligne => ligne.id !== id));
  };

  // Déplacer une ligne
  const handleMoveUp = (index: number) => {
    if (index > 0) {
      const newLignes = [...lignes];
      [newLignes[index - 1], newLignes[index]] = [newLignes[index], newLignes[index - 1]];
      setLignes(newLignes);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < lignes.length - 1) {
      const newLignes = [...lignes];
      [newLignes[index], newLignes[index + 1]] = [newLignes[index + 1], newLignes[index]];
      setLignes(newLignes);
    }
  };

  const handleLoadModele = async (modeleId: number) => {
    try {
      const data = await getModeleQuery.refetch();
      if (data.data?.lignes) {
        const newLignes: LigneDevis[] = data.data.lignes.map((ligne: any) => ({
          id: Date.now().toString() + Math.random(),
          description: ligne.designation,
          quantite: parseFloat(ligne.quantite as any),
          prixUnitaireHT: parseFloat(ligne.prixUnitaireHT as any),
          tauxTVA: parseFloat(ligne.tauxTVA as any),
        }));
        setLignes([...lignes, ...newLignes]);
        setSelectedModeleId(null);
        toast.success("Modele charge");
      }
    } catch (error) {
      toast.error("Erreur lors du chargement du modele");
    }
  };

  // Calculs
  const totaux = useMemo(() => {
    const totalHT = lignes.reduce((sum, ligne) => sum + (ligne.quantite * ligne.prixUnitaireHT), 0);
    const tva = lignes.reduce((sum, ligne) => {
      const montantHT = ligne.quantite * ligne.prixUnitaireHT;
      return sum + (montantHT * (ligne.tauxTVA / 100));
    }, 0);
    const totalTTC = totalHT + tva;
    return { totalHT, tva, totalTTC };
  }, [lignes]);

  // Soumettre le formulaire
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clientId) {
      toast.error("Veuillez sélectionner un client");
      return;
    }

    if (lignes.length === 0) {
      toast.error("Veuillez ajouter au moins une ligne");
      return;
    }

    setIsSubmitting(true);
    try {
      // Créer le devis
      const devis = await createMutation.mutateAsync({
        clientId,
        dateValidite: dateExpiration,
        notes,
      });

      // Ajouter les lignes
      for (const ligne of lignes) {
        await addLigneMutation.mutateAsync({
          devisId: devis.id,
          designation: ligne.description,
          quantite: String(ligne.quantite),
          prixUnitaireHT: String(ligne.prixUnitaireHT),
          tauxTVA: String(ligne.tauxTVA),
        });
      }

      toast.success("Devis créé avec succès");
      utils.devis.list.invalidate();
      setLocation(`/devis/${devis.id}`);
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de la création");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/devis")}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Nouveau devis</h1>
          <p className="text-gray-600">Créer un nouveau devis</p>
        </div>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border">
        {/* Client */}
        <div>
          <Label htmlFor="clientId" className="block text-sm font-medium mb-2">
            Client *
          </Label>
          <select
            id="clientId"
            value={clientId}
            onChange={(e) => setClientId(parseInt(e.target.value))}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="0">Sélectionner un client...</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>
                {client.nom} {client.prenom}
              </option>
            ))}
          </select>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="dateDevis" className="block text-sm font-medium mb-2">
              Date du devis
            </Label>
            <input
              id="dateDevis"
              type="date"
              value={dateDevis}
              onChange={(e) => setDateDevis(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <Label htmlFor="dateExpiration" className="block text-sm font-medium mb-2">
              Date d'expiration
            </Label>
            <input
              id="dateExpiration"
              type="date"
              value={dateExpiration}
              onChange={(e) => setDateExpiration(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Modeles de devis */}
        {modeles.length > 0 && (
          <div>
            <Label className="block text-sm font-medium mb-2">
              Charger un modele
            </Label>
            <select
              value={selectedModeleId || ""}
              onChange={(e) => {
                const id = parseInt(e.target.value);
                if (id) {
                  setSelectedModeleId(id);
                  handleLoadModele(id);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selectionner un modele...</option>
              {modeles.map(modele => (
                <option key={modele.id} value={modele.id}>
                  {modele.nom}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Recherche d'articles */}
        <div>
          <Label className="block text-sm font-medium mb-2">
            Rechercher un article
          </Label>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start text-left"
            onClick={() => setIsSearchDialogOpen(true)}
          >
            <Search className="w-4 h-4 mr-2" />
            Cliquez pour rechercher un article...
          </Button>

          {/* Dialog de recherche */}
          <Dialog open={isSearchDialogOpen} onOpenChange={setIsSearchDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Sélectionner un article</DialogTitle>
                <DialogDescription>
                  Recherchez par nom ou catégorie (min 2 caractères)
                </DialogDescription>
              </DialogHeader>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
                {searchQuery && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <ScrollArea className="h-[400px] pr-4">
                {searchQuery.length < 2 ? (
                  <div className="text-center py-8 text-gray-500">
                    Tapez au moins 2 caractères pour rechercher
                  </div>
                ) : articlesFiltrés.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    Aucun article trouvé
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(articlesGroupes).map(([categorie, articlesInCategory]) => (
                      <div key={categorie}>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 sticky top-0 bg-white py-1">
                          {categorie} ({articlesInCategory.length})
                        </h4>
                        <div className="space-y-1">
                          {articlesInCategory.map(article => (
                            <button
                              key={article.id}
                              type="button"
                              onClick={() => handleSelectArticle(article)}
                              className="w-full text-left px-4 py-3 hover:bg-blue-50 rounded border-b last:border-b-0 transition-colors"
                            >
                              <div className="font-medium text-sm">{article.nom || article.designation}</div>
                              <div className="text-xs text-gray-600">
                                {formatCurrency(article.prix || article.prixUnitaireHT)} • {article.unite || "unité"}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>

        {/* Lignes de devis */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <Label className="block text-sm font-medium">
              Lignes du devis * ({lignes.length})
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAjouterLigne}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Ajouter une ligne
            </Button>
          </div>

          {lignes.length > 0 ? (
            <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
              {lignes.map((ligne, index) => (
                <div key={ligne.id} className="bg-white p-4 rounded border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">Ligne {index + 1}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className="text-gray-600 disabled:opacity-50"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === lignes.length - 1}
                        className="text-gray-600 disabled:opacity-50"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSupprimerLigne(ligne.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-medium mb-1 block">Description</Label>
                    <Input
                      value={ligne.description}
                      onChange={(e) => handleModifierLigne(ligne.id, 'description', e.target.value)}
                      placeholder="Description de l'article"
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Quantité</Label>
                      <Input
                        type="number"
                        value={ligne.quantite}
                        onChange={(e) => handleModifierLigne(ligne.id, 'quantite', parseFloat(e.target.value) || 0)}
                        min="0.01"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Prix HT</Label>
                      <Input
                        type="number"
                        value={ligne.prixUnitaireHT}
                        onChange={(e) => handleModifierLigne(ligne.id, 'prixUnitaireHT', parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">TVA %</Label>
                      <Input
                        type="number"
                        value={ligne.tauxTVA}
                        onChange={(e) => handleModifierLigne(ligne.id, 'tauxTVA', parseFloat(e.target.value) || 20)}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Total HT</Label>
                      <div className="px-3 py-2 bg-gray-100 rounded-md text-sm font-medium">
                        {formatCurrency(ligne.quantite * ligne.prixUnitaireHT)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-lg p-6 text-center text-gray-500">
              <p>Aucune ligne ajoutée. Cliquez sur "Ajouter une ligne" pour commencer.</p>
            </div>
          )}
        </div>

        {/* Totaux */}
        {lignes.length > 0 && (
          <div className="bg-blue-50 p-4 rounded-lg space-y-2 border border-blue-200">
            <div className="flex justify-between">
              <span className="font-medium">Total HT :</span>
              <span className="font-bold">{formatCurrency(totaux.totalHT)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">TVA :</span>
              <span className="font-bold">{formatCurrency(totaux.tva)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-lg">
              <span className="font-bold">Total TTC :</span>
              <span className="font-bold text-blue-600">{formatCurrency(totaux.totalTTC)}</span>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <Label htmlFor="notes" className="block text-sm font-medium mb-2">
            Notes
          </Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Notes du devis..."
          />
        </div>

        {/* Boutons */}
        <div className="flex justify-end gap-3 pt-6 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation("/devis")}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || lignes.length === 0}
          >
            {isSubmitting ? "Création..." : "Créer le devis"}
          </Button>
        </div>
      </form>
    </div>
  );
}
