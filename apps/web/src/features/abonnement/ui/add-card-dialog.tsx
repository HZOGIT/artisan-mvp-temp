import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { useBillingMaison } from "../application/use-billing-maison";

const stripePromise = loadStripe(
  (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) ?? "",
);

interface SetupData {
  clientSecret: string;
  stripeCustomerId: string;
}

interface CardFormProps {
  stripeCustomerId: string;
  onSuccess: () => void;
  onCancel: () => void;
  confirmPaymentMethod: ReturnType<typeof useBillingMaison>["confirmPaymentMethod"];
  isConfirming: boolean;
}

function CardForm({
  stripeCustomerId,
  onSuccess,
  onCancel,
  confirmPaymentMethod,
  isConfirming,
}: CardFormProps) {
  const { t } = useTranslation("abonnement");
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const busy = isSubmitting || isConfirming || !stripe || !elements;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setIsSubmitting(true);
    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });

      if (result.error) {
        toast.error(result.error.message ?? t("billingMaison.erreurStripe", "Erreur de paiement."));
        return;
      }

      const pm = result.setupIntent.payment_method;
      const pmId = pm == null ? null : typeof pm === "string" ? pm : pm.id;
      if (!pmId) {
        toast.error(t("billingMaison.erreurPM", "Moyen de paiement introuvable."));
        return;
      }

      await confirmPaymentMethod({
        stripePaymentMethodId: pmId,
        stripeCustomerId,
        setAsDefault: true,
      });

      onSuccess();
    } catch {
      toast.error(t("billingMaison.erreurEnregistrement", "Impossible d'enregistrer la carte."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          {t("billingMaison.annuler", "Annuler")}
        </Button>
        <Button type="submit" disabled={busy}>
          {isSubmitting || isConfirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("billingMaison.enregistrer", "Enregistrer la carte")
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddCardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation("abonnement");
  const { createSetupIntent, isCreatingSetup, confirmPaymentMethod, isConfirming } =
    useBillingMaison();
  const [setupData, setSetupData] = useState<SetupData | null>(null);

  useEffect(() => {
    if (!open) {
      setSetupData(null);
      return;
    }
    let cancelled = false;
    createSetupIntent()
      .then((data) => {
        if (!cancelled) {
          setSetupData({ clientSecret: data.clientSecret, stripeCustomerId: data.stripeCustomerId });
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error(t("billingMaison.erreurSetupIntent", "Impossible d'initialiser le paiement."));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSuccess = () => {
    toast.success(t("billingMaison.carteAjoutee", "Carte enregistrée avec succès."));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("billingMaison.ajouterCarte", "Ajouter une carte")}</DialogTitle>
        </DialogHeader>

        {(isCreatingSetup || !setupData) && open ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : setupData ? (
          <Elements stripe={stripePromise} options={{ clientSecret: setupData.clientSecret }}>
            <CardForm
              stripeCustomerId={setupData.stripeCustomerId}
              onSuccess={handleSuccess}
              onCancel={() => onOpenChange(false)}
              confirmPaymentMethod={confirmPaymentMethod}
              isConfirming={isConfirming}
            />
          </Elements>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
