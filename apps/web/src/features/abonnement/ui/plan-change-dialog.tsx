import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { trpc } from "@/shared/trpc";
import { isDowngrade, exceedsTargetLimits } from "../domain/plan-change-preview";
import type { PlanId } from "../application/use-billing-maison";

const fmtAmount = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

const fmtDate = (d: Date | string | null | undefined) =>
  d ? format(new Date(d), "dd MMM yyyy", { locale: fr }) : "—";

interface PlanChangeDialogProps {
  open: boolean;
  targetPlanId: PlanId;
  targetPlanName: string;
  currentPlanName: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isConfirming: boolean;
}

export function PlanChangeDialog({
  open,
  targetPlanId,
  targetPlanName,
  currentPlanName,
  onConfirm,
  onCancel,
  isConfirming,
}: PlanChangeDialogProps) {
  const { t } = useTranslation("abonnement");
  const [downgradeConfirmed, setDowngradeConfirmed] = useState(false);

  const previewQ = trpc.billing.previewPlanChange.useQuery(
    { planId: targetPlanId },
    { enabled: open },
  );

  const preview = previewQ.data;
  const downgrade = preview ? isDowngrade(preview.currentPlanId, preview.targetPlanId) : false;
  const exceeds = preview ? exceedsTargetLimits(preview) : false;
  const needsExtraConfirm = exceeds;
  const canConfirm = !needsExtraConfirm || downgradeConfirmed;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setDowngradeConfirmed(false);
      onCancel();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("planChange.titre", "Confirmer le changement de plan")}</DialogTitle>
        </DialogHeader>

        {previewQ.isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {previewQ.isError && (
          <p className="text-sm text-destructive">{t("planChange.erreurPreview", "Impossible de charger l'aperçu.")}</p>
        )}

        {preview && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("planChange.planActuel", "Plan actuel")}</span>
                <span className="font-medium">{currentPlanName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("planChange.nouveauPlan", "Nouveau plan")}</span>
                <span className="font-medium">{targetPlanName}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("planChange.maintenant", "Prélevé maintenant")}</span>
                <span className="font-medium text-green-700">{t("planChange.zero", "0 €")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("planChange.prochainEcheance", "Prochaine échéance")}</span>
                <span>{fmtDate(preview.nextBillingDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("planChange.montantProchain", "Nouveau montant récurrent")}</span>
                <span className="font-medium">{fmtAmount(preview.targetAmountCents)}</span>
              </div>
            </div>

            {downgrade ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-1 text-amber-800">
                <p className="font-medium">{t("planChange.limitesImm", "Limites réduites immédiatement")}</p>
                <p>{t("planChange.maxUsers", "Utilisateurs max : {{n}}", { n: preview.targetMaxUsers })}</p>
                <p className="text-xs">{t("planChange.sansRemboursement", "Aucun remboursement ni avoir pour la période en cours.")}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">{t("planChange.featuresImm", "Les fonctionnalités du nouveau plan sont débloquées immédiatement.")}</p>
            )}

            {exceeds && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                <div className="flex gap-2 items-start">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-destructive text-xs">
                    {t("planChange.usageDepasse", "Vous avez {{actif}} utilisateur(s) actif(s) mais le plan {{plan}} n'en autorise que {{max}}. Désactivez des utilisateurs avant ou après le changement.", {
                      actif: preview.activeUserCount,
                      plan: targetPlanName,
                      max: preview.targetMaxUsers,
                    })}
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={downgradeConfirmed}
                    onCheckedChange={(v) => setDowngradeConfirmed(Boolean(v))}
                    id="downgrade-confirm"
                  />
                  <span className="text-xs">{t("planChange.confirmDepasse", "Je comprends et je souhaite quand même changer de plan.")}</span>
                </label>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isConfirming}>
            {t("planChange.annuler", "Annuler")}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isConfirming || previewQ.isLoading || previewQ.isError || !canConfirm}
          >
            {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : t("planChange.confirmer", "Confirmer le changement")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
