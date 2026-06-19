import { trpc } from "@/shared/trpc";
import type { Subscription, Device } from "../domain/abonnement";

/*
 * Couche APPLICATION de la feature `abonnement` (clean-archi) : SEULE couche important tRPC.
 * Port moderne d'`AbonnementSection` : abonnement courant + appareils + mutations Stripe (checkout/
 * portal/cancel/reactivate) et appareils (revoke/revokeAll). Les redirections Stripe + toasts sont
 * attachés par l'UI via `mutate(vars, { onSuccess, onError })`.
 */
export function useAbonnement() {
  const utils = trpc.useUtils();
  const subQ = trpc.subscription.getCurrent.useQuery();
  const devicesQ = trpc.devices.list.useQuery();

  const invalidateSub = () => utils.subscription.getCurrent.invalidate();
  const invalidateDevices = () => utils.devices.list.invalidate();

  const checkout = trpc.subscription.createCheckout.useMutation();
  const portal = trpc.subscription.createPortal.useMutation();
  const cancel = trpc.subscription.cancel.useMutation({ onSuccess: invalidateSub });
  const reactivate = trpc.subscription.reactivate.useMutation({ onSuccess: invalidateSub });
  const revoke = trpc.devices.revoke.useMutation({ onSuccess: invalidateDevices });
  const revokeAll = trpc.devices.revokeAll.useMutation({ onSuccess: invalidateDevices });

  const sub: Subscription | undefined = subQ.data ?? undefined;
  const devices: Device[] = devicesQ.data ?? [];

  return { sub, devices, isLoading: subQ.isLoading, checkout, portal, cancel, reactivate, revoke, revokeAll };
}
