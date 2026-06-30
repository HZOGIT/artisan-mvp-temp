import { trpc } from "@/shared/trpc";
import type { RouterOutputs, RouterInputs } from "@/shared/trpc";

export type BillingInfo = RouterOutputs["billing"]["getBillingInfo"];
export type BillingPaymentMethod = BillingInfo["paymentMethods"][number];
export type BillingSubscription = NonNullable<BillingInfo["subscription"]>;
export type BillingInvoice = BillingInfo["recentInvoices"][number];

type ConfirmParams = RouterInputs["billing"]["confirmPaymentMethod"];
export type PlanId = RouterInputs["billing"]["changePlan"]["planId"];

export function useBillingMaison() {
  const utils = trpc.useUtils();

  const invalidate = () => utils.billing.getBillingInfo.invalidate();

  const infoQ = trpc.billing.getBillingInfo.useQuery();

  const revokeMut = trpc.billing.revokePaymentMethod.useMutation({ onSuccess: invalidate });
  const setDefaultMut = trpc.billing.setDefaultPaymentMethod.useMutation({ onSuccess: invalidate });
  const setupIntentMut = trpc.billing.createSetupIntent.useMutation();
  const confirmMut = trpc.billing.confirmPaymentMethod.useMutation({ onSuccess: invalidate });
  const changePlanMut = trpc.billing.changePlan.useMutation({ onSuccess: invalidate });
  const cancelMut = trpc.billing.cancelAtPeriodEnd.useMutation({ onSuccess: invalidate });
  const reactivateMut = trpc.billing.reactivate.useMutation({ onSuccess: invalidate });
  const downloadInvoiceMut = trpc.billing.downloadInvoice.useMutation();

  return {
    billingInfo: infoQ.data,
    isLoading: infoQ.isLoading,
    isError: infoQ.isError,

    revokePaymentMethod: (paymentMethodId: number) =>
      revokeMut.mutateAsync({ paymentMethodId }),
    isRevoking: revokeMut.isPending,

    setDefaultPaymentMethod: (paymentMethodId: number) =>
      setDefaultMut.mutateAsync({ paymentMethodId }),
    isSettingDefault: setDefaultMut.isPending,

    createSetupIntent: () => setupIntentMut.mutateAsync(undefined),
    isCreatingSetup: setupIntentMut.isPending,

    confirmPaymentMethod: (params: ConfirmParams) => confirmMut.mutateAsync(params),
    isConfirming: confirmMut.isPending,

    changePlan: (planId: PlanId) => changePlanMut.mutateAsync({ planId }),
    isChangingPlan: changePlanMut.isPending,

    cancelAtPeriodEnd: () => cancelMut.mutateAsync(undefined),
    isCanceling: cancelMut.isPending,

    reactivate: () => reactivateMut.mutateAsync(undefined),
    isReactivating: reactivateMut.isPending,

    downloadInvoice: (invoiceId: number) => downloadInvoiceMut.mutateAsync({ invoiceId }),
    isDownloadingInvoice: downloadInvoiceMut.isPending,
  };
}
