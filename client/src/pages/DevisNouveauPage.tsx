import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Search, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface LigneDevis {
  id: string;
  description: string;
  quantite: number;
  prixUnitaireHT: number;
  tauxTVA: number;
  unite: string;
}

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
  const [objet, setObjet] = useState("");
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<LigneDevis[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Etats de la recherche d'articles (API /api/articles/search)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ArticleBibliotheque[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSearchLigneId, setActiveSearchLigneId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [selectedModeleId, setSelectedModeleId] = useState<number | null>(null);

  // Requetes tRPC
  const { data: clients = [] } = trpc.clients.list.useQuery();
  const { data: modeles = [] } = trpc.devis.getModeles.useQuery();
  const createMutation = trpc.devis.create.useMutation();
  const addLigneMutation = trpc.devis.addLigne.useMutation();
  const getModeleQuery = trpc.devis.getModeleWithLignes.useQuery(
    { modeleId: selectedModeleId || 0 },
    { enabled: selectedModeleId !== null }
  );

  // Recherche d'articles avec debounce 300ms
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
        const res = await fetch(`/api/articles/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error("[ArticleSearch]", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  // Fermer le dropdown si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveSearchLigneId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Ajouter une ligne vide
  const handleAjouterLigne = () => {
    const nouvelleLigne: LigneDevis = {
      id: Date.now().toString(),
      description: "",
      quantite: 1,
      prixUnitaireHT: 0,
      tauxTVA: 20,
      unite: "unité",
    };
    setLignes([...lignes, nouvelleLigne]);
  };

  // Sélectionner un article depuis la bibliothèque → pré-remplit la ligne existante
  const handleSelectArticle = (ligneId: string, article: ArticleBibliotheque) => {
    setLignes(lignes.map(ligne =>
      ligne.id === ligneId
        ? {
            ...ligne,
            description: article.nom,
            prixUnitaireHT: parseFloat(article.prix_base) || 0,
            unite: article.unite || "unité",
          }
        : ligne
    ));
    setActiveSearchLigneId(null);
    setSearchQuery("");
    setSearchResults([]);
    toast.success(`${article.nom} sélectionné`);
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
          unite: ligne.unite || "unité",
        }));
        setLignes([...lignes, ...newLignes]);
        setSelectedModeleId(null);
        toast.success("Modèle chargé");
      }
    } catch (error) {
      toast.error("Erreur lors du chargement du modèle");
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
        objet: objet || undefined,
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
            value={clientId.toString()}
            onChange={(e) => setClientId(parseInt(e.target.value))}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="0">Sélectionner un client...</option>
            {clients.map(client => (
              <option key={client.id} value={client.id.toString()}>
                {client.nom} {client.prenom}
              </option>
            ))}
          </select>
        </div>

        {/* Objet */}
        <div>
          <Label htmlFor="objet" className="block text-sm font-medium mb-2">
            Objet du devis
          </Label>
          <Input
            id="objet"
            value={objet}
            onChange={(e) => setObjet(e.target.value)}
            placeholder="Ex: Rénovation salle de bain, Dépannage fuite..."
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              Charger un modèle
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
              <option value="">Sélectionner un modèle...</option>
              {modeles.map(modele => (
                <option key={modele.id} value={modele.id}>
                  {modele.nom}
                </option>
              ))}
            </select>
          </div>
        )}

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

                  {/* Désignation avec autocomplete inline */}
                  <div className="relative" ref={activeSearchLigneId === ligne.id ? dropdownRef : undefined}>
                    <Label className="text-xs font-medium mb-1 block">Désignation *</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        value={activeSearchLigneId === ligne.id ? searchQuery : ligne.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (activeSearchLigneId !== ligne.id) {
                            setActiveSearchLigneId(ligne.id);
                            setSearchQuery(val);
                          } else {
                            setSearchQuery(val);
                          }
                          // Mise à jour simultanée de la description (saisie libre)
                          handleModifierLigne(ligne.id, 'description', val);
                          searchArticles(val);
                        }}
                        onFocus={() => {
                          setActiveSearchLigneId(ligne.id);
                          setSearchQuery(ligne.description);
                          if (ligne.description.length >= 2) {
                            searchArticles(ligne.description);
                          }
                        }}
                        placeholder="Tapez pour rechercher un article ou saisir librement..."
                        className="pl-10"
                      />
                      {isSearching && activeSearchLigneId === ligne.id && (
                        <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
                      )}
                    </div>

                    {/* Dropdown résultats */}
                    {activeSearchLigneId === ligne.id && searchQuery.length >= 2 && searchResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {searchResults.map((article) => (
                          <button
                            key={article.id}
                            type="button"
                            onClick={() => handleSelectArticle(ligne.id, article)}
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

                  <div className="grid grid-cols-5 gap-3">
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
                      <Label className="text-xs font-medium mb-1 block">Unité</Label>
                      <Input
                        value={ligne.unite}
                        onChange={(e) => handleModifierLigne(ligne.id, 'unite', e.target.value)}
                        placeholder="unité"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Prix HT (€)</Label>
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
