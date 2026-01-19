import { useState, useCallback, useMemo } from "react";
import { useRouter } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

interface DevisLigneForm {
  id: string;
  designation: string;
  quantite: number;
  prixUnitaireHT: number;
}

interface DevisFormData {
  clientId: number;
  dateDevis: string;
  dateExpiration: string;
  notes: string;
  lignes: DevisLigneForm[];
}

const initialFormData: DevisFormData = {
  clientId: 0,
  dateDevis: new Date().toISOString().split('T')[0],
  dateExpiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  notes: "",
  lignes: [],
};

export function DevisNouveauPage() {
  const router = useRouter();
  const navigate = (path: string) => router.push(path);
  const [formData, setFormData] = useState<DevisFormData>(initialFormData);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const utils = trpc.useUtils();

  // Récupérer la liste des clients
  const { data: clients = [] } = trpc.clients.list.useQuery();

  // Rechercher les articles
  const { data: articles = [] } = trpc.articles.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 0 }
  );

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

  // Calculs
  const sousTotal = useMemo(() => {
    return formData.lignes.reduce((sum, ligne) => sum + (ligne.quantite * ligne.prixUnitaireHT), 0);
  }, [formData.lignes]);

  const tva = useMemo(() => {
    return sousTotal * 0.20; // 20% TVA
  }, [sousTotal]);

  const total = useMemo(() => {
    return sousTotal + tva;
  }, [sousTotal, tva]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'clientId' ? parseInt(value) : value
    }));
  }, []);

  const handleAddLigne = useCallback(() => {
    const newLigne: DevisLigneForm = {
      id: Date.now().toString(),
      designation: "",
      quantite: 1,
      prixUnitaireHT: 0,
    };
    setFormData(prev => ({
      ...prev,
      lignes: [...prev.lignes, newLigne]
    }));
  }, []);

  const handleRemoveLigne = useCallback((id: string) => {
    setFormData(prev => ({
      ...prev,
      lignes: prev.lignes.filter(l => l.id !== id)
    }));
  }, []);

  const handleLigneChange = useCallback((id: string, field: keyof DevisLigneForm, value: any) => {
    setFormData(prev => ({
      ...prev,
      lignes: prev.lignes.map(l =>
        l.id === id
          ? { ...l, [field]: field === 'designation' ? value : parseFloat(value) || 0 }
          : l
      )
    }));
  }, []);

  const handleAddArticle = useCallback((article: any) => {
    const newLigne: DevisLigneForm = {
      id: Date.now().toString(),
      designation: article.designation,
      quantite: 1,
      prixUnitaireHT: article.prixUnitaireHT || 0,
    };
    setFormData(prev => ({
      ...prev,
      lignes: [...prev.lignes, newLigne]
    }));
    setSearchQuery("");
    setShowSearchResults(false);
    toast.success("Article ajouté");
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId) {
      toast.error("Veuillez sélectionner un client");
      return;
    }
    if (formData.lignes.length === 0) {
      toast.error("Veuillez ajouter au moins une ligne");
      return;
    }
    
    // Préparer les données pour l'API
    const devisData = {
      clientId: formData.clientId,
      dateDevis: new Date(formData.dateDevis),
      dateValidite: new Date(formData.dateExpiration),
      notes: formData.notes,
      lignes: formData.lignes.map(l => ({
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaireHT: l.prixUnitaireHT,
      }))
    };
    
    await createMutation.mutateAsync(devisData as any);
  }, [formData, createMutation]);

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
      <div className="max-w-6xl">
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border">
          {/* Client et Dates */}
          <div className="grid grid-cols-3 gap-4">
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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchResults(e.target.value.length > 0);
                  }}
                  placeholder="Tapez pour rechercher..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Search className="w-4 h-4" />
                  Chercher
                </Button>
              </div>

              {/* Résultats de recherche */}
              {showSearchResults && articles.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                  {articles.map(article => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => handleAddArticle(article)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0 flex justify-between items-center"
                    >
                      <div>
                        <p className="font-medium">{article.designation}</p>
                        <p className="text-sm text-gray-600">{article.prixUnitaireHT}€ HT</p>
                      </div>
                      <Plus className="w-4 h-4 text-blue-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tableau des lignes */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <Label className="block text-sm font-medium">
                Lignes du devis *
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddLigne}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Ajouter une ligne
              </Button>
            </div>

            {formData.lignes.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-md border-2 border-dashed border-gray-300">
                <p className="text-gray-600">Aucune ligne ajoutée. Cliquez sur "Ajouter une ligne" pour commencer.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b">
                      <th className="px-4 py-2 text-left font-medium">Désignation</th>
                      <th className="px-4 py-2 text-center font-medium w-24">Quantité</th>
                      <th className="px-4 py-2 text-right font-medium w-32">Prix Unit. HT</th>
                      <th className="px-4 py-2 text-right font-medium w-32">Total HT</th>
                      <th className="px-4 py-2 text-center font-medium w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.lignes.map((ligne) => (
                      <tr key={ligne.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={ligne.designation}
                            onChange={(e) => handleLigneChange(ligne.id, 'designation', e.target.value)}
                            placeholder="Désignation"
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min="1"
                            value={ligne.quantite}
                            onChange={(e) => handleLigneChange(ligne.id, 'quantite', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={ligne.prixUnitaireHT}
                            onChange={(e) => handleLigneChange(ligne.id, 'prixUnitaireHT', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {(ligne.quantite * ligne.prixUnitaireHT).toFixed(2)}€
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveLigne(ligne.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Totaux */}
          {formData.lignes.length > 0 && (
            <div className="flex justify-end">
              <div className="w-80 space-y-2 bg-gray-50 p-4 rounded-md border">
                <div className="flex justify-between">
                  <span className="font-medium">Sous-total HT :</span>
                  <span>{sousTotal.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">TVA (20%) :</span>
                  <span>{tva.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total TTC :</span>
                  <span className="text-blue-600">{total.toFixed(2)}€</span>
                </div>
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
              rows={3}
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
              disabled={createMutation.isPending || formData.lignes.length === 0}
            >
              {createMutation.isPending ? "Création..." : "Créer le devis"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
