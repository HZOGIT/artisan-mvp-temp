'use client';

import { useRouter } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState, useCallback, useMemo, type ReactNode } from "react";

interface DevisFormData {
  clientId: number;
  dateDevis: string;
  dateExpiration: string;
  notes: string;
}

interface LigneDevis {
  id: string;
  articleId?: number;
  description: string;
  quantite: number;
  prixUnitaireHT: number;
}

interface Article {
  id: number;
  nom: string;
  categorie: string;
  prix: number;
  unite: string;
}

const initialFormData: DevisFormData = {
  clientId: 0,
  dateDevis: new Date().toISOString().split('T')[0],
  dateExpiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  notes: "",
};

export function DevisNouveauPage() {
  const router = useRouter();
  const navigate = (path: string) => router.push(path);
  const [formData, setFormData] = useState<DevisFormData>(initialFormData);
  const [lignes, setLignes] = useState<LigneDevis[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchPopup, setShowSearchPopup] = useState(false);
  const utils = trpc.useUtils();

  // Récupérer la liste des clients
  const { data: clients = [] } = trpc.clients.list.useQuery();

  // Récupérer la liste des articles
  const { data: articles = [] } = trpc.articles.list.useQuery();

  const createMutation = trpc.devis.create.useMutation({
    onSuccess: (devis) => {
      toast.success("Devis créé avec succès");
      utils.devis.list.invalidate();
      navigate(`/devis/${devis.id}`);
    },
    onError: (error) => {
      toast.error(error.message || "Erreur lors de la création");
    },
  });

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'clientId' ? parseInt(value) : value
    }));
  }, []);

  // Filtrer les articles selon la recherche
  const articlesFiltrés = useMemo(() => {
    if (searchQuery.length < 2) return [];
    return articles.filter(article =>
      article.nom.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, articles]);

  // Ajouter une ligne de devis
  const handleAjouterLigne = useCallback(() => {
    const nouvelleLigne: LigneDevis = {
      id: Date.now().toString(),
      description: "",
      quantite: 1,
      prixUnitaireHT: 0,
    };
    setLignes(prev => [...prev, nouvelleLigne]);
  }, []);

  // Sélectionner un article
  const handleSelectArticle = useCallback((article: Article) => {
    if (lignes.length === 0) {
      handleAjouterLigne();
    }
    const derniereLigne = lignes[lignes.length - 1];
    setLignes(prev => [
      ...prev.slice(0, -1),
      {
        ...derniereLigne,
        articleId: article.id,
        description: article.nom,
        prixUnitaireHT: article.prix,
      }
    ]);
    setSearchQuery("");
    setShowSearchPopup(false);
    toast.success(`${article.nom} ajouté`);
  }, [lignes, handleAjouterLigne]);

  // Modifier une ligne
  const handleModifierLigne = useCallback((id: string, field: keyof LigneDevis, value: any) => {
    setLignes(prev => prev.map(ligne =>
      ligne.id === id ? { ...ligne, [field]: value } : ligne
    ));
  }, []);

  // Supprimer une ligne
  const handleSupprimerLigne = useCallback((id: string) => {
    setLignes(prev => prev.filter(ligne => ligne.id !== id));
  }, []);

  // Calculs
  const totaux = useMemo(() => {
    const totalHT = lignes.reduce((sum, ligne) => sum + (ligne.quantite * ligne.prixUnitaireHT), 0);
    const tva = totalHT * 0.20; // 20% TVA
    const totalTTC = totalHT + tva;
    return { totalHT, tva, totalTTC };
  }, [lignes]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId) {
      toast.error("Veuillez sélectionner un client");
      return;
    }
    if (lignes.length === 0) {
      toast.error("Veuillez ajouter au moins une ligne");
      return;
    }
    // TODO: Créer le devis avec les lignes
    await createMutation.mutateAsync(formData);
  }, [formData, lignes, createMutation]);

  const handleCancel = useCallback(() => {
    navigate("/devis");
  }, [navigate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
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
      <div>
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border">
          {/* Client */}
          <div>
            <Label htmlFor="clientId" className="block text-sm font-medium mb-2">
              Client *
            </Label>
            <select
              id="clientId"
              name="clientId"
              value={formData.clientId}
              onChange={handleInputChange}
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
                name="dateDevis"
                value={formData.dateDevis}
                onChange={handleInputChange}
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
                name="dateExpiration"
                value={formData.dateExpiration}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Recherche d'articles */}
          <div className="relative">
            <Label className="block text-sm font-medium mb-2">
              Rechercher un article
            </Label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowSearchPopup(true)}
                placeholder="Tapez au moins 2 caractères..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Search className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
            </div>

            {/* Popup de recherche */}
            {showSearchPopup && searchQuery.length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-64 overflow-y-auto">
                {articlesFiltrés.length > 0 ? (
                  articlesFiltrés.map(article => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => handleSelectArticle(article)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b last:border-b-0"
                    >
                      <div className="font-medium">{article.nom}</div>
                      <div className="text-sm text-gray-600">
                        {article.categorie} • {article.prix}€ • {article.unite}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-2 text-gray-500">Aucun article trouvé</div>
                )}
              </div>
            )}
          </div>

          {/* Lignes de devis */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <Label className="block text-sm font-medium">
                Lignes du devis *
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAjouterLigne}
              >
                + Ajouter une ligne
              </Button>
            </div>

            {lignes.length > 0 ? (
              <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
                {lignes.map((ligne, index) => (
                  <div key={ligne.id} className="bg-white p-4 rounded border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600">Ligne {index + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSupprimerLigne(ligne.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div>
                      <Label className="text-xs font-medium mb-1 block">Description</Label>
                      <input
                        type="text"
                        value={ligne.description}
                        onChange={(e) => handleModifierLigne(ligne.id, 'description', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Description de l'article"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs font-medium mb-1 block">Quantité</Label>
                        <input
                          type="number"
                          value={ligne.quantite}
                          onChange={(e) => handleModifierLigne(ligne.id, 'quantite', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0.01"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium mb-1 block">Prix HT</Label>
                        <input
                          type="number"
                          value={ligne.prixUnitaireHT}
                          onChange={(e) => handleModifierLigne(ligne.id, 'prixUnitaireHT', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium mb-1 block">Total HT</Label>
                        <div className="px-3 py-2 bg-gray-100 rounded-md text-sm font-medium">
                          {(ligne.quantite * ligne.prixUnitaireHT).toFixed(2)}€
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
                <span className="font-bold">{totaux.totalHT.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">TVA (20%) :</span>
                <span className="font-bold">{totaux.tva.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-lg">
                <span className="font-bold">Total TTC :</span>
                <span className="font-bold text-blue-600">{totaux.totalTTC.toFixed(2)}€</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="block text-sm font-medium mb-2">
              Notes
            </Label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Notes du devis..."
            />
          </div>

          {/* Boutons */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={createMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || lignes.length === 0}
            >
              {createMutation.isPending ? "Création..." : "Créer le devis"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
