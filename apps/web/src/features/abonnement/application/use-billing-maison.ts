import { trpc } from "@/shared/trpc";
import type { RouterOutputs, RouterInputs } from "@/shared/trpc";

export type BillingInfo = RouterOutputs["billing"]["getBillingInfo"];
export type BillingPaymentMethod = BillingInfo["paymentMethods"][number];
export type BillingSubscription = NonNullable<BillingInfo["subscription"]>;
export type BillingInvoice = BillingInfo["recentInvoices"][number];

type ConfirmParams = RouterInputs["billing"]["confirmPaymentMethod"];

export function useBillingMaison() {
  const utils = trpc.useUtils();

  const invalidate = () => utils.billing.getBillingInfo.invalidate();

  const infoQ = trpc.billing.getBillingInfo.useQuery();

  const revokeMut = trpc.billing.revokePaymentMethod.useMutation({ onSuccess: invalidate });
  const setDefaultMut = trpc.billing.setDefaultPaymentMethod.useMutation({ onSuccess: invalidate });
  const setupIntentMut = trpc.billing.createSetupIntent.useMutation();
  const confirmMut = trpc.billing.confirmPaymentMethod.useMutation({ onSuccess: invalidate });

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
  };
}
