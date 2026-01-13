import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ArrowLeft, Receipt } from "lucide-react";

export default function PaiementSucces() {
  const [, setLocation] = useLocation();
  
  // Récupérer les paramètres de l'URL
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  const token = params.get("token");

  useEffect(() => {
    // On pourrait ici vérifier le statut du paiement via l'API
    console.log("Payment success - Session:", sessionId, "Token:", token);
  }, [sessionId, token]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl text-green-700">Paiement réussi !</CardTitle>
          <CardDescription className="text-base">
            Votre paiement a été traité avec succès. Un reçu vous sera envoyé par email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-sm text-green-800">
              Merci pour votre confiance. La facture a été marquée comme payée et l'artisan en a été notifié.
            </p>
          </div>
          
          <div className="flex flex-col gap-2">
            <Button 
              onClick={() => window.close()}
              className="w-full"
            >
              <Receipt className="mr-2 h-4 w-4" />
              Fermer cette fenêtre
            </Button>
            <Button 
              variant="outline"
              onClick={() => setLocation("/")}
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour à l'accueil
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
