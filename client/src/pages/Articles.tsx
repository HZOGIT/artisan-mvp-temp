import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Package, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const categorieLabels: Record<string, string> = {
  plomberie: "Plomberie",
  electricite: "Électricité",
  chauffage: "Chauffage",
  sanitaire: "Sanitaire",
  autre: "Autre",
};

const categorieColors: Record<string, string> = {
  plomberie: "bg-blue-100 text-blue-700",
  electricite: "bg-yellow-100 text-yellow-700",
  chauffage: "bg-orange-100 text-orange-700",
  sanitaire: "bg-cyan-100 text-cyan-700",
  autre: "bg-gray-100 text-gray-700",
};

export default function Articles() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: articles, isLoading } = trpc.articles.getBibliotheque.useQuery({});

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  const filteredArticles = articles?.filter((article: any) => {
    const matchesSearch = 
      article.designation?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.reference?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || article.categorie === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const categories = articles 
    ? Array.from(new Set(articles.map((a: any) => a.categorie).filter(Boolean)))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Bibliothèque d'articles</h1>
          <p className="text-muted-foreground mt-1">
            {articles?.length || 0} articles disponibles
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un article..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {categories.map((cat: any) => (
              <SelectItem key={cat} value={cat}>
                {categorieLabels[cat] || cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Articles List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredArticles && filteredArticles.length > 0 ? (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Désignation</th>
                <th>Catégorie</th>
                <th>Unité</th>
                <th className="text-right">Prix HT</th>
              </tr>
            </thead>
            <tbody>
              {filteredArticles.map((article: any) => (
                <tr key={article.id}>
                  <td className="font-mono text-sm">{article.reference ?? "-"}</td>
                  <td>
                    <div>
                      <p className="font-medium">{article.designation ?? "Sans nom"}</p>
                      {article.description ? (
                        <p className="text-sm text-muted-foreground line-clamp-1">{article.description}</p>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <Badge className={categorieColors[article.categorie ?? 'autre'] ?? "bg-gray-100"}>
                      {categorieLabels[article.categorie ?? 'autre'] ?? article.categorie ?? "Autre"}
                    </Badge>
                  </td>
                  <td>{article.unite ?? "unité"}</td>
                  <td className="text-right font-medium">{formatCurrency(article.prixUnitaireHT)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {searchQuery || categoryFilter !== "all" ? "Aucun article trouvé" : "Aucun article"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || categoryFilter !== "all"
                ? "Essayez avec d'autres critères de recherche"
                : "La bibliothèque d'articles est vide"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
