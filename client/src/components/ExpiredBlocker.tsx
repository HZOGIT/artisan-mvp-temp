import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { XCircle, RefreshCw, Download, MessageCircle } from "lucide-react";

// Page de blocage affichee si l'abonnement est dans un etat qui empeche
// l'usage normal de l'app. Conditions :
// - status === 'expired'
// - status === 'canceled' ET currentPeriodEnd passe
// - status === 'trialing' ET trialEndsAt passe (juste pour la transition,
//   le webhook devrait normalement avoir basculé en 'expired' a ce stade).
//
// Pendant ce blocage, on autorise quand meme la navigation vers
// /parametres?tab=abonnement (pour renouveler) — DashboardLayout fera la
// detection avant le render.

interface ExpiredBlockerProps {
  // L'utilisateur peut naviguer ici sans qu'on l'oblige a un autre URL.
  onExportData?: () => void;
}

export function ExpiredBlocker({ onExportData }: ExpiredBlockerProps) {
  const [, setLocation] = useLocation();
  const { data: sub } = trpc.subscription.getCurrent.useQuery();
  const portalMut = trpc.subscription.createPortal.useMutation({
    onSuccess: (res) => {
      if (res.url) window.location.href = res.url;
    },
  });

  // Si le sub redevient actif (paiement, reabonnement), on debloque
  // automatiquement au prochain poll.
  useEffect(() => {
    if (sub && (sub.status === "active" || sub.status === "trialing")) {
      // On force un refresh complet pour recharger l'app.
      window.location.reload();
    }
  }, [sub?.status]);

  const goRenew = () => setLocation("/parametres?tab=abonnement");

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardContent className="py-10 px-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40 mb-4">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Votre abonnement a expire</h1>
          <p className="text-muted-foreground mb-6">
            Renouvelez pour retrouver l'acces a toutes vos donnees.<br />
            <span className="text-sm">Vos donnees sont conservees pendant 30 jours.</span>
          </p>

          <div className="space-y-2">
            <Button className="w-full" onClick={goRenew}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Renouveler mon abonnement
            </Button>
            {sub?.stripeSubscriptionId && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => portalMut.mutate()}
                disabled={portalMut.isPending}
              >
                Gerer mon abonnement (portail Stripe)
              </Button>
            )}
            {onExportData && (
              <Button variant="ghost" className="w-full" onClick={onExportData}>
                <Download className="h-4 w-4 mr-2" />
                Exporter mes donnees
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => window.open("mailto:contact@operioz.com", "_blank")}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Contacter le support
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
