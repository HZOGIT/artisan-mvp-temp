import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle, ArrowLeft, RefreshCw } from "lucide-react";

export default function PaiementAnnule() {
  const [, setLocation] = useLocation();
  
  // Récupérer le token de l'URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <XCircle className="w-10 h-10 text-orange-600" />
          </div>
          <CardTitle className="text-2xl text-orange-700">Paiement annulé</CardTitle>
          <CardDescription className="text-base">
            Le paiement a été annulé. Aucun montant n'a été débité de votre compte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-orange-50 p-4 rounded-lg">
            <p className="text-sm text-orange-800">
              Si vous avez rencontré un problème lors du paiement, n'hésitez pas à contacter l'artisan pour obtenir de l'aide.
            </p>
          </div>
          
          <div className="flex flex-col gap-2">
            <Button 
              onClick={() => window.history.back()}
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Réessayer le paiement
            </Button>
            <Button 
              variant="outline"
              onClick={() => window.close()}
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Fermer cette fenêtre
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
