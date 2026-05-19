import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layers, FileText, ArrowRight, Info } from "lucide-react";

/**
 * Page /devis-options — placeholder explicatif.
 *
 * Historique : cette page existait avec une logique standalone qui
 * supposait un parametre d'URL :id (devis parent), mais la route
 * /devis-options sans :id faisait que devisId=0 et la query
 * trpc.devisOptions.getByDevisId restait en 'loading' indefiniment
 * ('Chargement…' bloque).
 *
 * Decision (cf. mission RAPPORT 'Option A choisie') : les variantes
 * d'un devis appartiennent au devis lui-meme, l'edition se fait depuis
 * la page de detail du devis. Cette page devient donc un panneau
 * explicatif qui renvoie l'utilisateur vers /devis.
 */
export default function DevisOptions() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Layers className="h-7 w-7 text-blue-600" />
          Variantes de devis
        </h1>
        <p className="text-muted-foreground mt-1">
          Proposez plusieurs options (Standard, Premium, Éco…) sur un même devis.
        </p>
      </div>

      <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
            <Info className="h-5 w-5" /> Où trouver les variantes ?
          </CardTitle>
          <CardDescription>
            Les variantes sont attachées à un devis existant et se gèrent depuis sa page de détail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside text-sm space-y-2 text-foreground">
            <li>Ouvrez la liste de vos devis ou créez-en un nouveau.</li>
            <li>Cliquez sur un devis pour entrer dans son détail.</li>
            <li>
              Utilisez l'onglet <strong>Variantes</strong> pour ajouter plusieurs options chiffrées
              (ex&nbsp;: <em>Standard</em>, <em>Premium</em>, <em>Éco</em>).
            </li>
            <li>
              Le client peut choisir une variante depuis le portail&nbsp;; vous la convertissez ensuite
              en devis officiel avec un seul bouton.
            </li>
          </ol>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button asChild className="min-h-[44px] flex-1">
              <Link to="/devis">
                <FileText className="h-4 w-4 mr-2" />
                Ouvrir mes devis
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-[44px] flex-1">
              <Link to="/devis/nouveau">Créer un nouveau devis</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Astuce&nbsp;: depuis un devis ouvert, vous pouvez aussi accéder directement aux variantes
        via l'URL <code className="font-mono">/devis-options/&lt;id-du-devis&gt;</code>.
      </p>
    </div>
  );
}
