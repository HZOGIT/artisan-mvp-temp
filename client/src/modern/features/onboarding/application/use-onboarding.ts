import { trpc } from "@/modern/shared/trpc";
import type { Module } from "../domain/onboarding";

// Couche APPLICATION — onboarding : modules disponibles + finalisation/saut. SEULE couche important tRPC ;
// effets (toast, navigation, invalidations) gérés en UI via options.
export function useOnboarding() {
  const utils = trpc.useUtils();
  const modulesQ = trpc.modules.list.useQuery();
  const invalidate = () => { utils.modules.list.invalidate(); utils.modules.getMine.invalidate(); utils.modules.getOnboardingStatus.invalidate(); };
  return {
    modules: (modulesQ.data ?? []) as Module[],
    complete: trpc.modules.completeOnboarding.useMutation({ onSuccess: invalidate }),
    skip: trpc.modules.skipOnboarding.useMutation({ onSuccess: invalidate }),
  };
}
